import { buildPrompt, resolveLanguagePair } from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";

const DEFAULT_QWEN_API_URL =
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
const DEFAULT_QWEN_MODEL = "qwen-plus";

function parseQwenStreamLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
        return null;
    }

    const payload = trimmed.startsWith("data:")
        ? trimmed.substring(5).trim()
        : trimmed;
    if (!payload || payload === "[DONE]") {
        return null;
    }

    try {
        return JSON.parse(payload);
    } catch (err) {
        return null;
    }
}

function extractQwenDelta(payload) {
    const message = payload?.output?.choices?.[0]?.message || {};
    return {
        content: String(message?.content || ""),
        thought: String(message?.reasoning_content || ""),
    };
}

export async function streamQwenTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const apiUrl = String(
        settings?.qwen_api_url || DEFAULT_QWEN_API_URL,
    ).trim();
    const key = String(settings?.qwen_api_key || "").trim();
    const model = String(settings?.qwen_model || DEFAULT_QWEN_MODEL).trim();
    const showThoughts = getThinkingEnabledByEngine("qwen", settings);

    if (!apiUrl || !key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 Qwen API 地址与 Key",
        );
        return;
    }

    const parameters = {
        result_format: "message",
        incremental_output: true,
        stream: true,
        enable_thinking: showThoughts,
    };

    const thinkingBudget = Number(settings?.qwen_thinking_budget);
    if (showThoughts && Number.isFinite(thinkingBudget) && thinkingBudget > 0) {
        parameters.thinking_budget = Math.floor(thinkingBudget);
    }

    if (showThoughts) {
        parameters.preserve_thinking = !!settings?.qwen_preserve_thinking;
    }

    const body = {
        model,
        input: {
            messages: [
                {
                    role: "user",
                    content: buildPrompt(text, to, { glossaryTerms }),
                },
            ],
        },
        parameters,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
                Accept: "text/event-stream",
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
                "Qwen 请求失败: " + textErr,
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
                const payload = parseQwenStreamLine(line);
                if (!payload) {
                    continue;
                }

                const delta = extractQwenDelta(payload);
                if (delta.thought) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_THOUGHT",
                        requestId,
                        content: delta.thought,
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
