import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-3-latest";

function parseGrokStreamLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed || !trimmed.startsWith("data:")) {
        return null;
    }

    const payload = trimmed.substring(5).trim();
    if (!payload || payload === "[DONE]") {
        return null;
    }

    try {
        const json = JSON.parse(payload);
        return json.choices?.[0]?.delta || null;
    } catch (err) {
        return null;
    }
}

export async function streamGrokTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.grok_api_url,
        DEFAULT_GROK_API_URL,
    );
    const key = String(settings?.grok_api_key || "").trim();
    const model = String(settings?.grok_model || DEFAULT_GROK_MODEL).trim();
    const showThoughts = getThinkingEnabledByEngine("grok", settings);
    const promptContent = buildPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
    });

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    if (!key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 Grok API 地址与 Key",
        );
        return;
    }

    const body = {
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        temperature: 1.0,
        stream: true,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(endpoint.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
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
                "Grok 请求失败: " + textErr,
            );
            return;
        }

        if (!res.body) {
            postTranslateError(port, state, requestId, "响应不包含可读流");
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
                const delta = parseGrokStreamLine(line);
                if (!delta) {
                    continue;
                }

                if (showThoughts && delta.reasoning_content) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_THOUGHT",
                        requestId,
                        content: delta.reasoning_content,
                    });
                    if (!ok) {
                        return;
                    }
                }

                if (delta.content) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_CHUNK",
                        requestId,
                        content: delta.content,
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
