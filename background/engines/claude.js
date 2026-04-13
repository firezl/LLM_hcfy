import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

function parseClaudeSSELine(line) {
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

function buildClaudeThinkingConfig(settings) {
    if (!settings?.claude_show_thoughts) {
        return {
            type: "disabled",
        };
    }

    const mode = String(settings?.claude_thinking_mode || "adaptive")
        .trim()
        .toLowerCase();
    if (mode === "enabled") {
        const budget = Number(settings?.claude_thinking_budget);
        const budgetTokens =
            Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 2048;
        return {
            type: "enabled",
            budget_tokens: budgetTokens,
            display: "summarized",
        };
    }

    return {
        type: "adaptive",
        display: "summarized",
    };
}

export async function streamClaudeTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeFixedHttpEndpoint(
        settings?.claude_api_url,
        DEFAULT_CLAUDE_API_URL,
        {
            preferredProtocol: "https",
            errorPrefix: "Claude ",
            endpointPath: "/v1/messages",
            suffixOnVersionBase: "/messages",
            endpointMatchers: [/\/messages$/i],
        },
    );
    const apiKey = String(settings?.claude_api_key || "").trim();
    const model = String(settings?.claude_model || DEFAULT_CLAUDE_MODEL).trim();
    const maxTokensRaw = Number(settings?.claude_max_tokens);
    const maxTokens =
        Number.isFinite(maxTokensRaw) && maxTokensRaw > 0
            ? Math.floor(maxTokensRaw)
            : 4096;
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
            "请在设置中配置 Claude API Key",
        );
        return;
    }

    const thinking = buildClaudeThinkingConfig(settings);
    if (
        thinking.type === "enabled" &&
        Number.isFinite(thinking.budget_tokens) &&
        thinking.budget_tokens >= maxTokens
    ) {
        thinking.budget_tokens = Math.max(1024, maxTokens - 1);
    }

    const body = {
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        thinking,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(endpoint.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
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
                "Claude 请求失败: " +
                    (textErr || `${res.status} ${res.statusText}`),
            );
            return;
        }

        if (!res.body) {
            postTranslateError(
                port,
                state,
                requestId,
                "Claude 响应不包含可读流",
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
                const event = parseClaudeSSELine(line);
                if (!event) {
                    continue;
                }

                if (event.type === "message_stop") {
                    done = true;
                    break;
                }

                if (event.type !== "content_block_delta") {
                    continue;
                }

                const delta = event.delta || {};
                if (delta.type === "thinking_delta" && delta.thinking) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_THOUGHT",
                        requestId,
                        content: delta.thinking,
                    });
                    if (!ok) {
                        return;
                    }
                    continue;
                }

                if (delta.type === "text_delta" && delta.text) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_CHUNK",
                        requestId,
                        content: delta.text,
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
