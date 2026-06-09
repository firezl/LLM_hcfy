import { safePostMessage } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

function resolveClaudeModelsUrl(rawUrl) {
    const normalized = normalizeFixedHttpEndpoint(
        rawUrl,
        DEFAULT_CLAUDE_API_URL,
        {
            preferredProtocol: "https",
            errorPrefix: "Claude ",
            endpointPath: "/v1/messages",
            suffixOnVersionBase: "/messages",
            endpointMatchers: [/\/messages$/i, /\/models$/i],
        },
    );
    if (!normalized.ok) {
        return normalized;
    }

    const modelsUrl = new URL(normalized.url);
    if (/\/messages$/i.test(modelsUrl.pathname)) {
        modelsUrl.pathname = modelsUrl.pathname.replace(
            /\/messages$/i,
            "/models",
        );
    } else if (!/\/models$/i.test(modelsUrl.pathname)) {
        modelsUrl.pathname = "/v1/models";
    }

    return {
        ok: true,
        modelsUrl: modelsUrl.toString(),
    };
}

function extractClaudeModelIds(payload) {
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return Array.from(
        new Set(
            data
                .map((item) =>
                    String(item?.id || item?.name || "")
                        .trim()
                        .toLowerCase(),
                )
                .filter(Boolean),
        ),
    );
}

export async function handleClaudeGetModels(message, port, state) {
    const requestId = message?.requestId || `claude-models-${Date.now()}`;
    const endpoint = resolveClaudeModelsUrl(message?.apiUrl);

    if (!endpoint.ok) {
        safePostMessage(port, state, {
            type: "CLAUDE_OP_ERROR",
            requestId,
            error: endpoint.error,
        });
        return;
    }

    const apiKey = String(message?.apiKey || "").trim();
    const headers = {
        Accept: "application/json",
        "anthropic-version": "2023-06-01",
    };
    if (apiKey) {
        headers["x-api-key"] = apiKey;
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
                type: "CLAUDE_OP_ERROR",
                requestId,
                error:
                    "获取 Claude 模型列表失败: " +
                    (textErr || `${res.status} ${res.statusText}`),
            });
            return;
        }

        const payload = await res.json();
        const modelIds = extractClaudeModelIds(payload);

        safePostMessage(port, state, {
            type: "CLAUDE_MODELS_RESPONSE",
            requestId,
            modelIds,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "CLAUDE_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
