import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_GEMINI_BASE_URL =
    "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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
    const promptContent = buildPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
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

    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: promptContent,
                    },
                ],
            },
        ],
        generationConfig,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        let requestBody = body;
        let res = await fetch(endpoint.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        if (!res.ok) {
            const textErr = await res.text();

            if (
                requestBody?.generationConfig?.thinkingConfig &&
                isUnsupportedThinkingConfigError(res.status, textErr)
            ) {
                const fallbackBody = {
                    ...requestBody,
                    generationConfig: {
                        ...requestBody.generationConfig,
                    },
                };
                delete fallbackBody.generationConfig.thinkingConfig;
                requestBody = fallbackBody;

                res = await fetch(endpoint.url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                });
            }
        }

        if (!res.ok) {
            const textErr = await res.text();
            postTranslateError(
                port,
                state,
                requestId,
                "Gemini 请求失败: " +
                    (textErr || `${res.status} ${res.statusText}`),
            );
            return;
        }

        if (!res.body) {
            postTranslateError(
                port,
                state,
                requestId,
                "Gemini 响应不包含可读流",
            );
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let carry = "";

        while (!done) {
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
            if (!value) {
                continue;
            }

            carry += decoder.decode(value, { stream: true });
            const lines = carry.split("\n");
            carry = lines.pop() || "";

            for (const line of lines) {
                const chunk = parseGeminiSSELine(line);
                if (!chunk) {
                    continue;
                }

                const parts =
                    chunk?.candidates?.[0]?.content?.parts ||
                    chunk?.candidates?.[0]?.parts ||
                    [];
                if (!Array.isArray(parts)) {
                    continue;
                }

                for (const part of parts) {
                    const textDelta = String(part?.text || "");
                    if (!textDelta) {
                        continue;
                    }

                    if (part?.thought === true) {
                        const ok = safePostMessage(port, state, {
                            type: "TRANSLATE_THOUGHT",
                            requestId,
                            content: textDelta,
                        });
                        if (!ok) {
                            return;
                        }
                        continue;
                    }

                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_CHUNK",
                        requestId,
                        content: textDelta,
                    });
                    if (!ok) {
                        return;
                    }
                }
            }
        }

        safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
    } catch (err) {
        const aborted = err && err.name === "AbortError";
        if (!aborted && state.connected) {
            postTranslateError(
                port,
                state,
                requestId,
                err && err.message ? err.message : String(err),
            );
        }
    } finally {
        state.controllers.delete(requestId);
    }
}
