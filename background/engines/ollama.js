import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";

const DEFAULT_OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";

function normalizeOllamaChatEndpoint(rawUrl) {
    const raw = String(rawUrl || "").trim() || DEFAULT_OLLAMA_CHAT_URL;
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (err) {
        return {
            ok: false,
            error: "Ollama 地址无效，请填写完整 URL（例如 http://localhost:11434/api/chat）",
        };
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
        return {
            ok: false,
            error: "Ollama 地址仅支持 http/https 协议",
        };
    }

    let pathname = parsed.pathname || "/";
    if (!pathname.endsWith("/")) {
        pathname += "/";
    }

    const normalizedPath = pathname.toLowerCase();
    if (
        !normalizedPath.endsWith("/api/chat/") &&
        !normalizedPath.endsWith("/api/chat")
    ) {
        const basePath = pathname.replace(/\/+$/, "");
        pathname = `${basePath}/api/chat`;
    }

    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";

    return {
        ok: true,
        chatUrl: parsed.toString(),
        origin: parsed.origin,
    };
}

function buildTagsEndpoint(rawUrl) {
    const normalized = normalizeOllamaChatEndpoint(rawUrl);
    if (!normalized.ok) {
        return normalized;
    }

    return {
        ok: true,
        tagsUrl: `${normalized.origin}/api/tags`,
    };
}

function resolveOllamaModel(settings) {
    const selected = String(settings?.ollama_model || "").trim();
    if (selected === "custom") {
        return String(settings?.ollama_custom_model || "").trim();
    }
    return selected;
}

function parseOllamaChunkLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
        return null;
    }

    try {
        return JSON.parse(trimmed);
    } catch (err) {
        return null;
    }
}

export async function streamOllamaTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOllamaChatEndpoint(settings?.ollama_api_url);
    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    const model = resolveOllamaModel(settings);
    if (!model) {
        postTranslateError(
            port,
            state,
            requestId,
            "请先在设置中选择 Ollama 模型",
        );
        return;
    }

    const promptContent = buildPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
    });

    const body = {
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        stream: true,
        think: !!settings?.ollama_show_thoughts,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(endpoint.chatUrl, {
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
                "Ollama 请求失败: " +
                    (textErr || `${res.status} ${res.statusText}`),
            );
            return;
        }

        if (!res.body) {
            postTranslateError(
                port,
                state,
                requestId,
                "Ollama 响应不包含可读流",
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
                const chunk = parseOllamaChunkLine(line);
                if (!chunk) {
                    continue;
                }

                const thoughtDelta = chunk?.message?.thinking;
                if (thoughtDelta) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_THOUGHT",
                        requestId,
                        content: thoughtDelta,
                    });
                    if (!ok) {
                        return;
                    }
                }

                const contentDelta = chunk?.message?.content;
                if (contentDelta) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_CHUNK",
                        requestId,
                        content: contentDelta,
                    });
                    if (!ok) {
                        return;
                    }
                }

                if (chunk?.done === true) {
                    done = true;
                    break;
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

export async function handleOllamaGetModels(message, port, state) {
    const requestId = message?.requestId || `ollama-models-${Date.now()}`;
    const endpoint = buildTagsEndpoint(
        message?.apiUrl || message?.settings?.ollama_api_url,
    );

    if (!endpoint.ok) {
        safePostMessage(port, state, {
            type: "OLLAMA_OP_ERROR",
            requestId,
            error: endpoint.error,
        });
        return;
    }

    try {
        const res = await fetch(endpoint.tagsUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
        });

        if (!res.ok) {
            const textErr = await res.text();
            safePostMessage(port, state, {
                type: "OLLAMA_OP_ERROR",
                requestId,
                error:
                    "获取 Ollama 模型列表失败: " +
                    (textErr || `${res.status} ${res.statusText}`),
            });
            return;
        }

        const payload = await res.json();
        const modelIds = Array.from(
            new Set(
                (Array.isArray(payload?.models) ? payload.models : [])
                    .map((item) => String(item?.name || "").trim())
                    .filter(Boolean),
            ),
        );

        safePostMessage(port, state, {
            type: "OLLAMA_MODELS_RESPONSE",
            requestId,
            modelIds,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "OLLAMA_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
