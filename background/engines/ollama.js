import {
    buildChatPromptParts,
    buildOpenAIStyleMessages,
    buildTranslationgemmaPrompt,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload } from "./custom-payload.js";
import { streamChatToPort } from "./openai-compat-stream.js";
import { normalizeOllamaEndpoint } from "./url-utils.js";

const DEFAULT_OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";

function normalizeOllamaChatEndpoint(rawUrl) {
    return normalizeOllamaEndpoint(rawUrl, DEFAULT_OLLAMA_CHAT_URL);
}

function buildTagsEndpoint(rawUrl) {
    const normalized = normalizeOllamaChatEndpoint(rawUrl);
    if (!normalized.ok) {
        return normalized;
    }

    return {
        ok: true,
        tagsUrl: normalized.tagsUrl,
    };
}

function resolveOllamaModel(settings) {
    const selected = String(settings?.ollama_model || "").trim();
    if (selected === "custom") {
        return String(settings?.ollama_custom_model || "").trim();
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

function buildOllamaPromptParts(model, request, from, to) {
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    if (isTranslationgemmaModel(model)) {
        return {
            systemPrompt: "",
            userPrompt: buildTranslationgemmaPrompt(
                request?.text || "",
                from,
                to,
                { glossaryTerms },
            ),
        };
    }

    return buildChatPromptParts(request?.text || "", to, {
        glossaryTerms,
        legacyCustomPromptTemplate:
            request?.promptTemplates?.legacy || request?.customPromptTemplate,
        systemPromptTemplate: request?.promptTemplates?.system,
        userPromptTemplate: request?.promptTemplates?.user,
        context: request?.context,
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

export async function streamOllamaTranslate(request, port, state) {
    const { requestId, settings } = request;
    const { from, to } = resolveLanguagePair(request);

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

    const promptParts = buildOllamaPromptParts(model, request, from, to);

    const baseBody = {
        model,
        messages: buildOpenAIStyleMessages(promptParts),
        stream: true,
        think: !!settings?.ollama_show_thoughts,
    };
    const { body } = mergeCustomPayload(baseBody, request?.customPayload);

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "Ollama",
        requestStream: async (signal) => ({
            response: await fetch(endpoint.chatUrl, {
                method: "POST",
                headers: mergeCustomHeaders(
                    {
                        "Content-Type": "application/json",
                    },
                    request?.customHeaders,
                ).headers,
                body: JSON.stringify(body),
                signal,
            }),
        }),
        parseLine: parseOllamaDeltaLine,
    });
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
            headers: mergeCustomHeaders(
                {
                    Accept: "application/json",
                },
                message?.customHeaders,
            ).headers,
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
