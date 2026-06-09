import {
    buildChatPromptParts,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload } from "./custom-payload.js";
import { streamChatToPort } from "./openai-compat-stream.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_GEMINI_BASE_URL =
    "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

function parseGeminiSSELine(line) {
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

function parseGeminiDeltaLine(line) {
    const chunk = parseGeminiSSELine(line);
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

function normalizeGeminiBaseUrl(rawUrl) {
    return normalizeFixedHttpEndpoint(rawUrl, DEFAULT_GEMINI_BASE_URL, {
        preferredProtocol: "https",
        errorPrefix: "Gemini ",
        endpointPath: "/v1beta/models",
        suffixOnVersionBase: "/models",
        endpointMatchers: [/\/models$/i, /:streamgeneratecontent$/i],
    });
}

function isGemini3Model(model) {
    return /^gemini-3/i.test(String(model || ""));
}

function isLikelyGemmaModel(model) {
    return /^gemma(?:-|\d|$)/i.test(String(model || "").trim());
}

function buildGeminiThinkingConfig(model, settings) {
    if (isLikelyGemmaModel(model)) {
        return null;
    }

    const showThoughts = !!settings?.gemini_show_thoughts;
    const cfg = {
        includeThoughts: showThoughts,
    };

    if (isGemini3Model(model)) {
        cfg.thinkingLevel = showThoughts
            ? String(settings?.gemini_thinking_level || "high")
                  .trim()
                  .toUpperCase()
            : "MINIMAL";
        return cfg;
    }

    const rawBudget = Number(settings?.gemini_thinking_budget);
    const budget =
        Number.isFinite(rawBudget) && rawBudget >= -1
            ? Math.floor(rawBudget)
            : -1;
    cfg.thinkingBudget = showThoughts ? budget : 0;
    return cfg;
}

function isUnsupportedThinkingConfigError(status, errorText) {
    if (status !== 400) {
        return false;
    }

    const message = String(errorText || "");
    return /thinking\s*budget\s*is\s*not\s*supported/i.test(message);
}

function resolveGeminiEndpoint(baseUrl, model, apiKey) {
    const normalizedBaseResult = normalizeGeminiBaseUrl(baseUrl);
    if (!normalizedBaseResult.ok) {
        return normalizedBaseResult;
    }

    const normalizedBase = normalizedBaseResult.url;
    const encodedKey = encodeURIComponent(apiKey);

    if (normalizedBase.includes(":streamGenerateContent")) {
        const joiner = normalizedBase.includes("?") ? "&" : "?";
        return {
            ok: true,
            url: `${normalizedBase}${joiner}alt=sse&key=${encodedKey}`,
        };
    }

    const normalizedModel = String(model || "").trim();
    return {
        ok: true,
        url: `${normalizedBase}/${encodeURIComponent(normalizedModel)}:streamGenerateContent?alt=sse&key=${encodedKey}`,
    };
}

export async function streamGeminiTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const apiKey = String(settings?.gemini_api_key || "").trim();
    const model = String(settings?.gemini_model || DEFAULT_GEMINI_MODEL).trim();
    const baseUrl = settings?.gemini_api_url || DEFAULT_GEMINI_BASE_URL;
    const promptParts = buildChatPromptParts(text, to, {
        glossaryTerms,
        legacyCustomPromptTemplate:
            request?.promptTemplates?.legacy || request?.customPromptTemplate,
        systemPromptTemplate: request?.promptTemplates?.system,
        userPromptTemplate: request?.promptTemplates?.user,
    });

    if (!apiKey) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 Gemini API Key",
        );
        return;
    }

    if (!model) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 Gemini 模型",
        );
        return;
    }

    const endpoint = resolveGeminiEndpoint(baseUrl, model, apiKey);
    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    const thinkingConfig = buildGeminiThinkingConfig(model, settings);
    const generationConfig = {
        temperature: 0.2,
    };
    if (thinkingConfig && typeof thinkingConfig === "object") {
        generationConfig.thinkingConfig = thinkingConfig;
    }

    const baseBody = {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: promptParts.userPrompt,
                    },
                ],
            },
        ],
        generationConfig,
    };
    if (String(promptParts.systemPrompt || "").trim()) {
        baseBody.systemInstruction = {
            parts: [
                {
                    text: promptParts.systemPrompt,
                },
            ],
        };
    }
    const { body } = mergeCustomPayload(baseBody, request?.customPayload);

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "Gemini",
        requestStream: async (signal) => {
            const sendBody = (requestBody) =>
                fetch(endpoint.url, {
                    method: "POST",
                    headers: mergeCustomHeaders(
                        {
                            "Content-Type": "application/json",
                        },
                        request?.customHeaders,
                    ).headers,
                    body: JSON.stringify(requestBody),
                    signal,
                });

            let res = await sendBody(body);

            if (!res.ok && body?.generationConfig?.thinkingConfig) {
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
                        error: "Gemini 请求失败: " + textErr,
                    };
                }
            }

            return { response: res };
        },
        parseLine: parseGeminiDeltaLine,
    });
}
