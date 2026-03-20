import { buildPrompt, resolveLanguagePair } from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";

function parseOpenAIStreamLine(line) {
    const trimmed = line.trim();
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
        console.error("Error parsing stream data", err);
        return null;
    }
}

export async function streamOpenAITranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];
    const apiUrl = settings.openai_api_url;
    const key = settings.openai_api_key;

    if (!apiUrl || !key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 OpenAI API 地址与 Key",
        );
        return;
    }

    const isThinking = !!settings.show_thoughts;
    const model = isThinking
        ? settings.openai_thinking_model || "gpt-5-thinking"
        : settings.openai_model || "gpt-4o-mini";

    const body = {
        model,
        messages: [
            {
                role: "user",
                content: buildPrompt(text, to, { glossaryTerms }),
            },
        ],
        temperature: 0.2,
        stream: true,
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
                "OpenAI 请求失败: " + textErr,
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
                const delta = parseOpenAIStreamLine(line);
                if (!delta) {
                    continue;
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
