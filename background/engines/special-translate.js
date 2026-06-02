import {
    buildPromptWithUserTemplate,
    buildTranslationgemmaPrompt,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import { streamChatToPort } from "./openai-compat-stream.js";
import {
    normalizeOllamaEndpoint,
    normalizeOpenAICompatEndpoint,
} from "./url-utils.js";

const DEFAULT_OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";
const DEFAULT_OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

function normalizeOllamaChatEndpoint(rawUrl) {
    return normalizeOllamaEndpoint(rawUrl, DEFAULT_OLLAMA_CHAT_URL);
}

function normalizeOpenAICompatChatEndpoint(rawUrl) {
    const normalized = normalizeOpenAICompatEndpoint(
        rawUrl,
        DEFAULT_OPENAI_CHAT_URL,
    );
    if (!normalized.ok) {
        return normalized;
    }

    return {
        ok: true,
        chatUrl: normalized.url,
        modelsUrl: normalized.modelsUrl,
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

function parseOllamaDeltaLine(line) {
    const chunk = parseOllamaChunkLine(line);
    if (!chunk) {
        return null;
    }
    return {
        thought: chunk?.message?.thinking || "",
        content: chunk?.message?.content || "",
        done: chunk?.done === true,
    };
}

function parseOpenAICompatDeltaLine(line) {
    const delta = parseOpenAICompatStreamLine(line);
    if (!delta) {
        return null;
    }
    return {
        thought: delta.reasoning_content || "",
        content: delta.content || "",
    };
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

    const isOpenAICompat = provider === "openai_compatible";
    const endpoint = isOpenAICompat
        ? normalizeOpenAICompatChatEndpoint(settings?.special_translate_api_url)
        : normalizeOllamaChatEndpoint(settings?.special_translate_api_url);

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    const headers = {
        "Content-Type": "application/json",
    };
    let body;

    if (isOpenAICompat) {
        const apiKey = String(
            settings?.special_translate_api_key || "",
        ).trim();
        if (apiKey) {
            headers.Authorization = `Bearer ${apiKey}`;
        }
        body = {
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
    } else {
        body = {
            model,
            messages: [
                {
                    role: "user",
                    content: promptContent,
                },
            ],
            stream: true,
            think: !!settings?.special_translate_show_thoughts,
        };
    }

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "专用翻译",
        requestStream: async (signal) => ({
            response: await fetch(endpoint.chatUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal,
            }),
        }),
        parseLine: isOpenAICompat
            ? parseOpenAICompatDeltaLine
            : parseOllamaDeltaLine,
    });
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
            ? normalizeOpenAICompatChatEndpoint(apiUrl)
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
