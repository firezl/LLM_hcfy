import {
    buildChatPromptParts,
    resolveLanguagePair,
} from "../language.js";
import { t, tDetail } from "../i18n.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import {
    BLOCKED_CUSTOM_PAYLOAD_KEYS,
    mergeCustomPayload,
    parseCustomPayload,
} from "./custom-payload.js";
import { parseSseJsonLine, streamChatToPort } from "./openai-compat-stream.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_GEMINI_BASE_URL =
    "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_API_ORIGIN = new URL(DEFAULT_GEMINI_BASE_URL).origin;
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const INTERACTION_BLOCKED_PAYLOAD_KEYS = new Set([
    ...BLOCKED_CUSTOM_PAYLOAD_KEYS,
    "system_instruction",
    "store",
]);

function parseGeminiDeltaLine(line) {
    const chunk = parseSseJsonLine(line);
    if (!chunk) {
        return null;
    }

    const parts =
        chunk?.candidates?.[0]?.content?.parts ||
        chunk?.candidates?.[0]?.parts ||
        [];
    if (!Array.isArray(parts)) {
        return null;
    }

    const deltas = [];
    for (const part of parts) {
        const textDelta = String(part?.text || "");
        if (!textDelta) {
            continue;
        }
        if (part?.thought === true) {
            deltas.push({ thought: textDelta });
        } else {
            deltas.push({ content: textDelta });
        }
    }
    return deltas;
}

function parseInteractionDeltaLine(line) {
    const event = parseSseJsonLine(line);
    if (event?.event_type === "interaction.completed") {
        const status = event.interaction?.status;
        if (status !== "completed") {
            throw new Error(`Gemini interaction ended with status: ${status}`);
        }
        return { done: true };
    }
    if (event?.event_type !== "step.delta") return null;

    const delta = event.delta;
    if (delta?.type === "text") {
        return { content: delta.text };
    }
    if (delta?.type === "thought_summary" && delta.content?.type === "text") {
        return { thought: delta.content.text };
    }
    return null;
}

function normalizeGeminiBaseUrl(rawUrl) {
    return normalizeFixedHttpEndpoint(rawUrl, DEFAULT_GEMINI_BASE_URL, {
        preferredProtocol: "https",
        errorPrefix: "Gemini ",
        endpointPath: "/v1beta/models",
        suffixOnVersionBase: "/models",
        endpointMatchers: [/\/models$/i, /:streamgeneratecontent$/i, /\/interactions$/i],
    });
}

function usesThinkingLevels(model) {
    return /^gemini-(?:[3-9]\d*(?:[.-]|$)|.+-latest$)/i.test(model);
}

function isLikelyGemmaModel(model) {
    return /^gemma(?:-|\d|$)/i.test(String(model || "").trim());
}

function resolveGeminiThinkingLevel(model, settings) {
    const configured = String(settings?.gemini_thinking_level || "")
        .trim()
        .toLowerCase();
    const level = settings?.gemini_show_thoughts ? configured || "high" : "minimal";
    // Only send minimal for models that advertise it. Moving aliases can change capabilities.
    const supportsMinimal =
        /^gemini-(?:3-flash|3\.6-flash|3\.5-flash-lite|3\.1-flash-lite)(?:-|$)/i.test(model);
    if (level === "minimal") return supportsMinimal ? "minimal" : "low";
    if (level === "medium" && /^gemini-3-pro(?:-|$)/i.test(model)) return "low";
    return ["low", "medium", "high"].includes(level) ? level : "high";
}

function buildGeminiThinkingConfig(model, settings) {
    if (isLikelyGemmaModel(model)) {
        return null;
    }

    const showThoughts = !!settings?.gemini_show_thoughts;
    const cfg = {
        includeThoughts: showThoughts,
    };

    if (usesThinkingLevels(model)) {
        cfg.thinkingLevel = resolveGeminiThinkingLevel(model, settings).toUpperCase();
        return cfg;
    }

    const rawBudget = Number(settings?.gemini_thinking_budget);
    const budget =
        Number.isFinite(rawBudget) && rawBudget >= -1
            ? Math.floor(rawBudget)
            : -1;
    const requestedBudget = showThoughts ? budget : 0;
    if (requestedBudget !== 0 || !/^gemini-2\.5-pro(?:-|$)/i.test(model)) {
        cfg.thinkingBudget = requestedBudget;
    }
    return cfg;
}

function isUnsupportedThinkingConfigError(status, errorText) {
    if (status !== 400) {
        return false;
    }

    const message = String(errorText || "");
    return /thinking\s*budget\s*is\s*not\s*supported/i.test(message);
}

function resolveGeminiEndpoint(baseUrl, model, apiKey, customPayload) {
    const normalizedBaseResult = normalizeGeminiBaseUrl(baseUrl);
    if (!normalizedBaseResult.ok) {
        return normalizedBaseResult;
    }

    const endpoint = new URL(normalizedBaseResult.url);
    const official = endpoint.origin === GEMINI_API_ORIGIN;
    const useInteractions =
        /\/interactions$/i.test(endpoint.pathname) ||
        (endpoint.href === DEFAULT_GEMINI_BASE_URL &&
            usesThinkingLevels(model) &&
            !Object.keys(parseCustomPayload(customPayload)).length);

    if (useInteractions) {
        endpoint.pathname = endpoint.pathname.replace(/\/models$/i, "/interactions");
    } else {
        if (!/:streamgeneratecontent$/i.test(endpoint.pathname)) {
            endpoint.pathname += `/${encodeURIComponent(model)}:streamGenerateContent`;
        }
        endpoint.searchParams.set("alt", "sse");
        // Existing third-party Generate Content gateways may require query authentication.
        if (!official) endpoint.searchParams.set("key", apiKey);
    }

    return {
        ok: true,
        url: endpoint.href,
        useInteractions,
        authHeaders: official || useInteractions ? { "x-goog-api-key": apiKey } : {},
    };
}

function buildInteractionBody(model, settings, promptParts) {
    const body = {
        model,
        input: promptParts.userPrompt,
        stream: true,
        store: false,
    };
    if (promptParts.systemPrompt?.trim()) {
        body.system_instruction = promptParts.systemPrompt;
    }
    if (!isLikelyGemmaModel(model)) {
        const showThoughts = !!settings?.gemini_show_thoughts;
        body.generation_config = {
            thinking_summaries: showThoughts ? "auto" : "none",
            thinking_level: resolveGeminiThinkingLevel(model, settings),
        };
    }
    return body;
}

function buildGenerateContentBody(model, settings, promptParts) {
    const generationConfig = { temperature: 0.2 };
    const thinkingConfig = buildGeminiThinkingConfig(model, settings);
    if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

    const body = {
        contents: [{ role: "user", parts: [{ text: promptParts.userPrompt }] }],
        generationConfig,
    };
    if (promptParts.systemPrompt?.trim()) {
        body.systemInstruction = { parts: [{ text: promptParts.systemPrompt }] };
    }
    return body;
}

export async function streamGeminiTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const apiKey = String(settings?.gemini_api_key || "").trim();
    const selectedModel = String(settings?.gemini_model || DEFAULT_GEMINI_MODEL).trim();
    const model = String(
        selectedModel === "custom" ? settings?.gemini_custom_model || "" : selectedModel,
    )
        .trim()
        .replace(/^models\//i, "");
    const baseUrl = settings?.gemini_api_url || DEFAULT_GEMINI_BASE_URL;
    const promptParts = buildChatPromptParts(text, to, {
        glossaryTerms,
        legacyCustomPromptTemplate:
            request?.promptTemplates?.legacy || request?.customPromptTemplate,
        systemPromptTemplate: request?.promptTemplates?.system,
        userPromptTemplate: request?.promptTemplates?.user,
        context: request?.context,
    });

    if (!apiKey) {
        postTranslateError(
            port,
            state,
            requestId,
            t("translate.engine.gemini.missingKey"),
        );
        return;
    }

    if (!model) {
        postTranslateError(
            port,
            state,
            requestId,
            t("translate.engine.gemini.missingModel"),
        );
        return;
    }

    const endpoint = resolveGeminiEndpoint(
        baseUrl,
        model,
        apiKey,
        request?.customPayload,
    );
    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    const { body } = endpoint.useInteractions
        ? mergeCustomPayload(
              buildInteractionBody(model, settings, promptParts),
              request?.customPayload,
              { blockedKeys: INTERACTION_BLOCKED_PAYLOAD_KEYS },
          )
        : mergeCustomPayload(
              buildGenerateContentBody(model, settings, promptParts),
              request?.customPayload,
          );
    const headers = mergeCustomHeaders(
        {
            "Content-Type": "application/json",
            ...endpoint.authHeaders,
        },
        request?.customHeaders,
    ).headers;

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "Gemini",
        requireDone: endpoint.useInteractions,
        requestStream: async (signal) => {
            const sendBody = (requestBody) =>
                fetch(endpoint.url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(requestBody),
                    signal,
                });

            let res = await sendBody(body);

            if (
                !endpoint.useInteractions &&
                !res.ok &&
                body?.generationConfig?.thinkingConfig
            ) {
                const textErr = await res.text();
                if (isUnsupportedThinkingConfigError(res.status, textErr)) {
                    const fallbackBody = {
                        ...body,
                        generationConfig: {
                            ...body.generationConfig,
                        },
                    };
                    delete fallbackBody.generationConfig.thinkingConfig;
                    res = await sendBody(fallbackBody);
                } else {
                    return {
                        error: tDetail("translate.engine.gemini.requestFailed", {
                            error: textErr,
                        }),
                    };
                }
            }

            return { response: res };
        },
        parseLine: endpoint.useInteractions
            ? parseInteractionDeltaLine
            : parseGeminiDeltaLine,
    });
}
