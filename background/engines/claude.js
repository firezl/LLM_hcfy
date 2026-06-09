import {
    buildChatPromptParts,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload } from "./custom-payload.js";
import { streamChatToPort } from "./openai-compat-stream.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

function parseClaudeSSELine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed || !trimmed.startsWith("data:")) {
        return null;
    }
    const payload = trimmed.substring(5).trim();
    if (!payload || payload === "[DONE]") {
        return null;
    }
    try {
        return JSON.parse(payload);
    } catch (err) {
        return null;
    }
}

function parseClaudeDeltaLine(line) {
    const event = parseClaudeSSELine(line);
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

function buildClaudeThinkingConfig(settings) {
    if (!settings?.claude_show_thoughts) {
        return {
            type: "disabled",
        };
    }

    const mode = String(settings?.claude_thinking_mode || "adaptive")
        .trim()
        .toLowerCase();
    if (mode === "enabled") {
        const budget = Number(settings?.claude_thinking_budget);
        const budgetTokens =
            Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 2048;
        return {
            type: "enabled",
            budget_tokens: budgetTokens,
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
    const model = String(settings?.claude_model || DEFAULT_CLAUDE_MODEL).trim();
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
            "请在设置中配置 Claude API Key",
        );
        return;
    }

    const thinking = buildClaudeThinkingConfig(settings);
    if (
        thinking.type === "enabled" &&
        Number.isFinite(thinking.budget_tokens) &&
        thinking.budget_tokens >= maxTokens
    ) {
        thinking.budget_tokens = Math.max(1024, maxTokens - 1);
    }

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
    };
    if (String(promptParts.systemPrompt || "").trim()) {
        baseBody.system = promptParts.systemPrompt;
    }
    const { body } = mergeCustomPayload(baseBody, request?.customPayload);

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
                        "anthropic-version": "2023-06-01",
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
