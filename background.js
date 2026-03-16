// background.js
// Runs translation requests in the extension service worker process.

function buildPrompt(text, to) {
    return `请把这段文字翻译为${to === "zh" ? "中文" : "英文"}，不要有多余的输出。输入:\n${text}`;
}

function safePostMessage(port, state, payload) {
    if (!state.connected) {
        return false;
    }
    try {
        port.postMessage(payload);
        return true;
    } catch (err) {
        state.connected = false;
        return false;
    }
}

async function streamOpenAITranslate(request, port, state) {
    const { requestId, text, settings, to } = request;
    const apiUrl = settings.openai_api_url;
    const key = settings.openai_api_key;

    if (!apiUrl || !key) {
        safePostMessage(port, state, {
            type: "TRANSLATE_ERROR",
            requestId,
            error: "请在设置中配置 OpenAI API 地址与 Key",
        });
        return;
    }

    const isThinking = !!settings.show_thoughts;
    const model = isThinking
        ? settings.openai_thinking_model || "gpt-5-thinking"
        : settings.openai_model || "gpt-4o-mini";

    const body = {
        model,
        messages: [{ role: "user", content: buildPrompt(text, to) }],
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
            safePostMessage(port, state, {
                type: "TRANSLATE_ERROR",
                requestId,
                error: "OpenAI 请求失败: " + textErr,
            });
            return;
        }

        if (!res.body) {
            safePostMessage(port, state, {
                type: "TRANSLATE_ERROR",
                requestId,
                error: "响应不包含可读流",
            });
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
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) {
                    continue;
                }

                const payload = trimmed.substring(5).trim();
                if (!payload || payload === "[DONE]") {
                    continue;
                }

                try {
                    const json = JSON.parse(payload);
                    const delta = json.choices?.[0]?.delta;
                    if (!delta) {
                        continue;
                    }

                    if (delta.content) {
                        if (
                            !safePostMessage(port, state, {
                                type: "TRANSLATE_CHUNK",
                                requestId,
                                content: delta.content,
                            })
                        ) {
                            return;
                        }
                    }

                    if (delta.reasoning_content) {
                        if (
                            !safePostMessage(port, state, {
                                type: "TRANSLATE_THOUGHT",
                                requestId,
                                content: delta.reasoning_content,
                            })
                        ) {
                            return;
                        }
                    }
                } catch (err) {
                    console.error("Error parsing stream data", err);
                }
            }
        }

        safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
    } catch (err) {
        // BFCache 或页面关闭导致断连时会触发中止，不需要再向断开的端口发错误消息。
        const aborted = err && err.name === "AbortError";
        if (!aborted && state.connected) {
            safePostMessage(port, state, {
                type: "TRANSLATE_ERROR",
                requestId,
                error: err && err.message ? err.message : String(err),
            });
        }
    } finally {
        state.controllers.delete(requestId);
    }
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "jyt-translate") {
        return;
    }

    const state = {
        connected: true,
        controllers: new Map(),
    };

    port.onDisconnect.addListener(() => {
        state.connected = false;
        for (const controller of state.controllers.values()) {
            controller.abort();
        }
        state.controllers.clear();
    });

    port.onMessage.addListener((message) => {
        if (!message || message.type !== "TRANSLATE_START") {
            return;
        }
        streamOpenAITranslate(message, port, state);
    });
});
