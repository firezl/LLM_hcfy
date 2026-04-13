import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import {
    pickOpenAIReasoningEffort,
    supportsOpenAIReasoning,
} from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_CUSTOM_OPENAI_API_URL =
    "https://api.openai.com/v1/chat/completions";
const DEFAULT_CUSTOM_OPENAI_MODEL = "gpt-4o-mini";

function parseOpenAICompatStreamLine(line) {
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

function buildCustomOpenAIThinkingPatch(model, settings) {
    const patch = {};
    const showThoughts = !!settings?.custom_openai_show_thoughts;

    if (!supportsOpenAIReasoning(model)) {
        return patch;
    }

    patch.reasoning_effort = showThoughts
        ? pickOpenAIReasoningEffort(
              settings?.custom_openai_reasoning_effort,
              "medium",
          )
        : "none";

    const maxCompletionTokens = Number(
        settings?.custom_openai_max_completion_tokens,
    );
    if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
        patch.max_completion_tokens = Math.floor(maxCompletionTokens);
    }

    return patch;
}

export async function streamCustomOpenAITranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.custom_openai_api_url,
        DEFAULT_CUSTOM_OPENAI_API_URL,
    );
    const apiKey = String(settings?.custom_openai_api_key || "").trim();
    const model = String(
        settings?.custom_openai_model || DEFAULT_CUSTOM_OPENAI_MODEL,
    ).trim();
    const promptContent = buildPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
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
            "请在设置中配置自定义 OpenAI 兼容 API 地址与 Key",
        );
        return;
    }

    const baseBody = {
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

    const thinkingPatch = buildCustomOpenAIThinkingPatch(model, settings);
    const primaryBody = {
        ...baseBody,
        ...thinkingPatch,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        let res = await fetch(endpoint.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(primaryBody),
            signal: controller.signal,
        });

        if (!res.ok && Object.keys(thinkingPatch).length > 0) {
            const textErr = await res.text();
            const maybeUnsupportedThinking =
                res.status === 400 &&
                /(reasoning|thinking|unsupported|unknown|invalid)/i.test(
                    textErr || "",
                );

            if (maybeUnsupportedThinking) {
                res = await fetch(endpoint.url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(baseBody),
                    signal: controller.signal,
                });
            } else {
                postTranslateError(
                    port,
                    state,
                    requestId,
                    "自定义 OpenAI 兼容请求失败: " + textErr,
                );
                return;
            }
        }

        if (!res.ok) {
            const textErr = await res.text();
            postTranslateError(
                port,
                state,
                requestId,
                "自定义 OpenAI 兼容请求失败: " + textErr,
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
                const delta = parseOpenAICompatStreamLine(line);
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
