import { safePostMessage } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_OPENAI_COMPAT_API_URL =
    "https://api.openai.com/v1/chat/completions";

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
    const endpoint = normalizeOpenAICompatEndpoint(
        message?.apiUrl,
        DEFAULT_OPENAI_COMPAT_API_URL,
    );

    if (!endpoint.ok) {
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
        safePostMessage(port, state, {
            type: "OPENAI_COMPAT_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
