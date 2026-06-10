import { safePostMessage } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_OPENAI_COMPAT_API_URL =
    "https://api.openai.com/v1/chat/completions";

const PREDEFINED_QWEN_MODELS = [
    "qwen3.5-plus",
    "qwen-plus",
    "qwen-turbo",
    "qwen-max",
    "qwen-long",
    "deepseek-v3",
    "deepseek-r1",
    "qwen2.5-72b-instruct",
    "qwen2.5-14b-instruct",
    "qwen2.5-7b-instruct",
    "qwen2.5-coder-32b-instruct",
    "qwen2.5-coder-7b-instruct",
];

function shouldFallbackToPredefinedModels(engine, apiUrl) {
    const isQwen = engine === "qwen" || /qwen/i.test(engine || "");
    const isDashScope = /dashscope/i.test(apiUrl || "");
    return isQwen || isDashScope;
}

function sendPredefinedModels(port, state, requestId) {
    safePostMessage(port, state, {
        type: "OPENAI_COMPAT_MODELS_RESPONSE",
        requestId,
        modelIds: PREDEFINED_QWEN_MODELS,
    });
}

function extractOpenAIModelIds(payload) {
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return Array.from(
        new Set(
            data.map((item) => String(item?.id || "").trim()).filter(Boolean),
        ),
    );
}

export async function handleOpenAICompatGetModels(message, port, state) {
    const requestId =
        message?.requestId || `openai-compat-models-${Date.now()}`;

    const rawApiUrl = String(message?.apiUrl || "").trim();
    if (!rawApiUrl) {
        if (shouldFallbackToPredefinedModels(message?.engine, message?.apiUrl)) {
            sendPredefinedModels(port, state, requestId);
            return;
        }
        safePostMessage(port, state, {
            type: "OPENAI_COMPAT_OP_ERROR",
            requestId,
            error: "请先填写 API 地址",
        });
        return;
    }

    const endpoint = normalizeOpenAICompatEndpoint(
        rawApiUrl,
        DEFAULT_OPENAI_COMPAT_API_URL,
    );

    if (!endpoint.ok) {
        if (shouldFallbackToPredefinedModels(message?.engine, message?.apiUrl)) {
            sendPredefinedModels(port, state, requestId);
            return;
        }
        safePostMessage(port, state, {
            type: "OPENAI_COMPAT_OP_ERROR",
            requestId,
            error: endpoint.error,
        });
        return;
    }

    const apiKey = String(message?.apiKey || "").trim();
    const headers = {
        Accept: "application/json",
    };
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }
    const mergedHeaders = mergeCustomHeaders(
        headers,
        message?.customHeaders,
    ).headers;

    try {
        const res = await fetch(endpoint.modelsUrl, {
            method: "GET",
            headers: mergedHeaders,
        });

        if (!res.ok) {
            if (shouldFallbackToPredefinedModels(message?.engine, message?.apiUrl)) {
                sendPredefinedModels(port, state, requestId);
                return;
            }
            const textErr = await res.text();
            safePostMessage(port, state, {
                type: "OPENAI_COMPAT_OP_ERROR",
                requestId,
                error:
                    "获取 OpenAI 兼容模型列表失败: " +
                    (textErr || `${res.status} ${res.statusText}`),
            });
            return;
        }

        const payload = await res.json();
        const modelIds = extractOpenAIModelIds(payload);

        safePostMessage(port, state, {
            type: "OPENAI_COMPAT_MODELS_RESPONSE",
            requestId,
            modelIds,
        });
    } catch (err) {
        if (shouldFallbackToPredefinedModels(message?.engine, message?.apiUrl)) {
            sendPredefinedModels(port, state, requestId);
            return;
        }
        safePostMessage(port, state, {
            type: "OPENAI_COMPAT_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
