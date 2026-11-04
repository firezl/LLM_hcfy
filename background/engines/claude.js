import {
    buildChatPromptParts,
    resolveLanguagePair,
} from "../language.js";
import { t } from "../i18n.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload, parseCustomPayload } from "./custom-payload.js";
import { parseSseJsonLine, streamChatToPort } from "./openai-compat-stream.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";
import { resolveConfiguredModel } from "../../libs/default-settings.mjs";

const DEFAULT_CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

export function claudeApiVersion(url, customPayload = {}) {
    const official = new URL(url).origin === "https://api.anthropic.com";
    const usesRemovedSampling = ["temperature", "top_p", "top_k"]
        .some((key) => Object.hasOwn(customPayload, key));
    return official && !usesRemovedSampling ? "2026-10-21" : "2023-06-01";
}

function parseClaudeDeltaLine(line) {
    const event = parseSseJsonLine(line);
    if (!event) {
        return null;
    }

    if (event.type === "message_stop") {
        return { done: true };
    }

    if (event.type !== "content_block_delta") {
        return null;
    }

    const delta = event.delta || {};
    if (delta.type === "thinking_delta" && delta.thinking) {
        return { thought: delta.thinking };
    }
    if (delta.type === "text_delta" && delta.text) {
        return { content: delta.text };
    }
    return null;
}

function buildClaudeThinkingConfig(model, settings, maxTokens) {
    const sonnet55 = /^claude-sonnet-5-5(?:-|$)/i.test(model);
    const alwaysThinking = /^claude-(?:(?:fable|mythos)(?:-preview|-5)|opus-5-5)(?:-|$)/i.test(model);
    const adaptive =
        alwaysThinking ||
        /^claude-(?:sonnet|opus|haiku)-(?:5(?:-|$)|4-[678](?:-|$))/i.test(model);
    const extendedOnly =
        /^claude-(?:sonnet|opus|haiku)-4(?:-[015])?(?:-\d{8}|$)/i.test(model) ||
        /^claude-3-7-sonnet/i.test(model);

    if (!settings?.claude_show_thoughts) {
        if (sonnet55) return { type: "between_tools" };
        if (alwaysThinking) return { type: "adaptive", display: "omitted" };
        return { type: "disabled" };
    }

    const mode = String(settings?.claude_thinking_mode || "adaptive")
        .trim()
        .toLowerCase();
    if (extendedOnly || (!adaptive && mode === "enabled")) {
        if (maxTokens <= 1024) return { type: "disabled" };
        const budget = Number(settings?.claude_thinking_budget);
        const budgetTokens =
            Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 2048;
        return {
            type: "enabled",
            budget_tokens: Math.min(maxTokens - 1, Math.max(1024, budgetTokens)),
            display: "summarized",
        };
    }

    return {
        type: "adaptive",
        display: "summarized",
    };
}

export async function streamClaudeTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeFixedHttpEndpoint(
        settings?.claude_api_url,
        DEFAULT_CLAUDE_API_URL,
        {
            preferredProtocol: "https",
            errorPrefix: "Claude ",
            endpointPath: "/v1/messages",
            suffixOnVersionBase: "/messages",
            endpointMatchers: [/\/messages$/i],
        },
    );
    const apiKey = String(settings?.claude_api_key || "").trim();
    const model = resolveConfiguredModel(settings, "claude");
    const maxTokensRaw = Number(settings?.claude_max_tokens);
    const maxTokens =
        Number.isFinite(maxTokensRaw) && maxTokensRaw > 0
            ? Math.floor(maxTokensRaw)
            : 4096;
    const promptParts = buildChatPromptParts(text, to, {
        glossaryTerms,
        legacyCustomPromptTemplate:
            request?.promptTemplates?.legacy || request?.customPromptTemplate,
        systemPromptTemplate: request?.promptTemplates?.system,
        userPromptTemplate: request?.promptTemplates?.user,
        context: request?.context,
    });

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    if (!apiKey) {
        postTranslateError(
            port,
            state,
            requestId,
            t("translate.engine.claude.missingKey"),
        );
        return;
    }
    if (!model) {
        postTranslateError(port, state, requestId, t("translate.engine.openai.missingModel"));
        return;
    }

    const thinking = buildClaudeThinkingConfig(model, settings, maxTokens);
    const configuredEffort = String(settings?.claude_thinking_effort || "").toLowerCase();
    const effort = ["low", "medium", "high"].includes(configuredEffort)
        ? configuredEffort
        : "medium";

    const baseBody = {
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [
            {
                role: "user",
                content: promptParts.userPrompt,
            },
        ],
        thinking,
        ...((thinking.type === "adaptive" || thinking.type === "between_tools") && {
            output_config: { effort: settings?.claude_show_thoughts ? effort : "low" },
        }),
    };
    if (String(promptParts.systemPrompt || "").trim()) {
        baseBody.system = promptParts.systemPrompt;
    }
    const customPayload = parseCustomPayload(request?.customPayload);
    const { body } = mergeCustomPayload(baseBody, customPayload);

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "Claude",
        requestStream: async (signal) => ({
            response: await fetch(endpoint.url, {
                method: "POST",
                headers: mergeCustomHeaders(
                    {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": claudeApiVersion(endpoint.url, customPayload),
                    },
                    request?.customHeaders,
                ).headers,
                body: JSON.stringify(body),
                signal,
            }),
        }),
        parseLine: parseClaudeDeltaLine,
    });
}
