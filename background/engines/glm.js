import { buildPrompt, resolveLanguagePair } from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";

const DEFAULT_GLM_API_URL =
    "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const DEFAULT_GLM_MODEL = "glm-5.1";

function parseGLMStreamLine(line) {
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

export async function streamGLMTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const apiUrl = String(settings?.glm_api_url || DEFAULT_GLM_API_URL).trim();
    const key = String(settings?.glm_api_key || "").trim();
    const model = String(settings?.glm_model || DEFAULT_GLM_MODEL).trim();
    const showThoughts = getThinkingEnabledByEngine("glm", settings);

    if (!apiUrl || !key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 GLM API 地址与 Key",
        );
        return;
    }

    const body = {
        model,
        messages: [
            {
                role: "user",
                content: buildPrompt(text, to, { glossaryTerms }),
            },
        ],
        stream: true,
        do_sample: false,
        thinking: {
            type: showThoughts ? "enabled" : "disabled",
            clear_thinking: settings?.glm_clear_thinking !== false,
        },
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(apiUrl, {
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
                "GLM 请求失败: " + textErr,
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
                const payload = parseGLMStreamLine(line);
                if (!payload) {
                    continue;
                }

                const delta = payload?.choices?.[0]?.delta || null;
                if (!delta) {
                    continue;
                }

                if (delta.reasoning_content) {
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
