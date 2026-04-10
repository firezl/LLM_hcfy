import { buildPrompt, resolveLanguagePair } from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";

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
    const raw = String(rawUrl || DEFAULT_GEMINI_BASE_URL)
        .trim()
        .replace(/\/+$/, "");
    if (raw.includes(":streamGenerateContent")) {
        return raw;
    }
    return raw;
}

function isGemini3Model(model) {
    return /^gemini-3/i.test(String(model || ""));
}

function buildGeminiThinkingConfig(model, settings) {
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

function resolveGeminiEndpoint(baseUrl, model, apiKey) {
    const normalizedBase = normalizeGeminiBaseUrl(baseUrl);
    const encodedKey = encodeURIComponent(apiKey);

    if (normalizedBase.includes(":streamGenerateContent")) {
        const joiner = normalizedBase.includes("?") ? "&" : "?";
        return `${normalizedBase}${joiner}alt=sse&key=${encodedKey}`;
    }

    const normalizedModel = String(model || "").trim();
    return `${normalizedBase}/${encodeURIComponent(normalizedModel)}:streamGenerateContent?alt=sse&key=${encodedKey}`;
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

    const apiUrl = resolveGeminiEndpoint(baseUrl, model, apiKey);
    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: buildPrompt(text, to, { glossaryTerms }),
                    },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.2,
            thinkingConfig: buildGeminiThinkingConfig(model, settings),
        },
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

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
