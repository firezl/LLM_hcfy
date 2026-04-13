import {
    buildPromptWithUserTemplate,
    buildTranslationgemmaPrompt,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";

const DEFAULT_OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";
const DEFAULT_OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

function normalizeHttpUrl(rawUrl, fallbackUrl) {
    const raw = String(rawUrl || "").trim() || fallbackUrl;
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (err) {
        return {
            ok: false,
            error: "地址无效，请填写完整 URL",
        };
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
        return {
            ok: false,
            error: "地址仅支持 http/https 协议",
        };
    }

    return { ok: true, url: parsed };
}

function normalizeOllamaChatEndpoint(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl, DEFAULT_OLLAMA_CHAT_URL);
    if (!normalized.ok) {
        return normalized;
    }

    const parsed = normalized.url;
    let pathname = parsed.pathname || "/";
    if (!pathname.endsWith("/")) {
        pathname += "/";
    }

    const lowered = pathname.toLowerCase();
    if (!lowered.endsWith("/api/chat/") && !lowered.endsWith("/api/chat")) {
        const basePath = pathname.replace(/\/+$/, "");
        pathname = `${basePath}/api/chat`;
    }

    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";

    return {
        ok: true,
        chatUrl: parsed.toString(),
        modelsUrl: `${parsed.origin}/api/tags`,
    };
}

function normalizeOpenAICompatEndpoint(rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl, DEFAULT_OPENAI_CHAT_URL);
    if (!normalized.ok) {
        return normalized;
    }

    const parsed = normalized.url;
    let pathname = parsed.pathname || "/";
    if (!pathname.endsWith("/")) {
        pathname += "/";
    }

    const lowered = pathname.toLowerCase();
    if (
        !lowered.endsWith("/v1/chat/completions/") &&
        !lowered.endsWith("/v1/chat/completions") &&
        !lowered.endsWith("/chat/completions/") &&
        !lowered.endsWith("/chat/completions")
    ) {
        const basePath = pathname.replace(/\/+$/, "");
        pathname = `${basePath}/v1/chat/completions`;
    }

    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";

    const modelsPath = pathname
        .replace(/\/chat\/completions\/?$/i, "/models")
        .replace(/\/v1\/v1\//i, "/v1/");

    return {
        ok: true,
        chatUrl: parsed.toString(),
        modelsUrl: `${parsed.origin}${modelsPath.startsWith("/") ? "" : "/"}${modelsPath}`,
    };
}

function resolveSpecialProvider(settings) {
    const provider = String(settings?.special_translate_provider || "ollama")
        .trim()
        .toLowerCase();
    if (provider === "openai_compatible") {
        return "openai_compatible";
    }
    return "ollama";
}

function resolveSpecialModel(settings) {
    const selected = String(settings?.special_translate_model || "").trim();
    if (selected === "custom") {
        return String(settings?.special_translate_custom_model || "").trim();
    }
    return selected;
}

function isTranslationgemmaModel(model) {
    const normalized = String(model || "")
        .trim()
        .toLowerCase();
    return (
        normalized === "translategemma" ||
        normalized.startsWith("translategemma:")
    );
}

function buildPromptByModel(model, request, from, to) {
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    if (isTranslationgemmaModel(model)) {
        return buildTranslationgemmaPrompt(request?.text || "", from, to, {
            glossaryTerms,
        });
    }

    return buildPromptWithUserTemplate(request?.text || "", to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
    });
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

async function streamByOllama(
    request,
    port,
    state,
    endpoint,
    model,
    promptContent,
) {
    const body = {
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        stream: true,
        think: !!request?.settings?.special_translate_show_thoughts,
    };

    const res = await fetch(endpoint.chatUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: request.controller.signal,
    });

    if (!res.ok) {
        const textErr = await res.text();
        throw new Error(textErr || `${res.status} ${res.statusText}`);
    }

    if (!res.body) {
        throw new Error("响应不包含可读流");
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
                    requestId: request.requestId,
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
                    requestId: request.requestId,
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
}

async function streamByOpenAICompat(
    request,
    port,
    state,
    endpoint,
    model,
    promptContent,
    apiKey,
) {
    const headers = {
        "Content-Type": "application/json",
    };
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const body = {
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        stream: true,
        temperature: 1.0,
    };

    const res = await fetch(endpoint.chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: request.controller.signal,
    });

    if (!res.ok) {
        const textErr = await res.text();
        throw new Error(textErr || `${res.status} ${res.statusText}`);
    }

    if (!res.body) {
        throw new Error("响应不包含可读流");
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
                    requestId: request.requestId,
                    content: delta.reasoning_content,
                });
                if (!ok) {
                    return;
                }
            }

            if (delta.content) {
                const ok = safePostMessage(port, state, {
                    type: "TRANSLATE_CHUNK",
                    requestId: request.requestId,
                    content: delta.content,
                });
                if (!ok) {
                    return;
                }
            }
        }
    }
}

export async function streamSpecialTranslate(request, port, state) {
    const { requestId, settings } = request;
    const provider = resolveSpecialProvider(settings);
    const model = resolveSpecialModel(settings);

    if (!model) {
        postTranslateError(port, state, requestId, "请先选择专用翻译模型");
        return;
    }

    const { from, to } = resolveLanguagePair(request);
    const promptContent = buildPromptByModel(model, request, from, to);
    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        if (provider === "openai_compatible") {
            const endpoint = normalizeOpenAICompatEndpoint(
                settings?.special_translate_api_url,
            );
            if (!endpoint.ok) {
                throw new Error(endpoint.error);
            }

            await streamByOpenAICompat(
                {
                    ...request,
                    controller,
                },
                port,
                state,
                endpoint,
                model,
                promptContent,
                String(settings?.special_translate_api_key || "").trim(),
            );
        } else {
            const endpoint = normalizeOllamaChatEndpoint(
                settings?.special_translate_api_url,
            );
            if (!endpoint.ok) {
                throw new Error(endpoint.error);
            }

            await streamByOllama(
                {
                    ...request,
                    controller,
                },
                port,
                state,
                endpoint,
                model,
                promptContent,
            );
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

function buildSpecialModelsError(port, state, requestId, error) {
    safePostMessage(port, state, {
        type: "SPECIAL_TRANSLATE_OP_ERROR",
        requestId,
        error,
    });
}

function extractOpenAIModels(payload) {
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return Array.from(
        new Set(
            data.map((item) => String(item?.id || "").trim()).filter(Boolean),
        ),
    );
}

function extractOllamaModels(payload) {
    const models = Array.isArray(payload?.models) ? payload.models : [];
    return Array.from(
        new Set(
            models
                .map((item) => String(item?.name || "").trim())
                .filter(Boolean),
        ),
    );
}

export async function handleSpecialTranslateGetModels(message, port, state) {
    const requestId = message?.requestId || `special-models-${Date.now()}`;
    const provider = String(message?.provider || "ollama")
        .trim()
        .toLowerCase();
    const apiUrl = String(message?.apiUrl || "").trim();
    const apiKey = String(message?.apiKey || "").trim();

    const endpoint =
        provider === "openai_compatible"
            ? normalizeOpenAICompatEndpoint(apiUrl)
            : normalizeOllamaChatEndpoint(apiUrl);

    if (!endpoint.ok) {
        buildSpecialModelsError(port, state, requestId, endpoint.error);
        return;
    }

    try {
        const headers = {
            Accept: "application/json",
        };

        if (provider === "openai_compatible" && apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }

        const res = await fetch(endpoint.modelsUrl, {
            method: "GET",
            headers,
        });

        if (!res.ok) {
            const textErr = await res.text();
            buildSpecialModelsError(
                port,
                state,
                requestId,
                textErr || `${res.status} ${res.statusText}`,
            );
            return;
        }

        const payload = await res.json();
        const discoveredModelIds =
            provider === "openai_compatible"
                ? extractOpenAIModels(payload)
                : extractOllamaModels(payload);

        const modelIds = Array.from(
            new Set(["translategemma", ...discoveredModelIds]),
        );

        safePostMessage(port, state, {
            type: "SPECIAL_TRANSLATE_MODELS_RESPONSE",
            requestId,
            modelIds,
        });
    } catch (err) {
        buildSpecialModelsError(
            port,
            state,
            requestId,
            err && err.message ? err.message : String(err),
        );
    }
}
