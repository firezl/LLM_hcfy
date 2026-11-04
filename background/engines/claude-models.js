import { tDetail } from "../i18n.js";
import { safePostMessage } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";
import { claudeApiVersion } from "./claude.js";

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
        "anthropic-version": claudeApiVersion(endpoint.modelsUrl),
    };
    if (apiKey) {
        headers["x-api-key"] = apiKey;
    }
    const mergedHeaders = mergeCustomHeaders(
        headers,
        message?.customHeaders,
    ).headers;

    try {
        const url = new URL(endpoint.modelsUrl);
        const modelIds = new Set();
        const cursors = new Set();
        while (state?.connected !== false) {
            const res = await fetch(url.href, {
                method: "GET",
                headers: mergedHeaders,
            });
            if (!res.ok) {
                const textErr = await res.text();
                safePostMessage(port, state, {
                    type: "CLAUDE_OP_ERROR",
                    requestId,
                    error: tDetail("translate.models.claudeFailed", {
                        error: textErr || `${res.status} ${res.statusText}`,
                    }),
                });
                return;
            }
            const payload = await res.json();
            for (const id of extractClaudeModelIds(payload)) modelIds.add(id);
            const cursor = payload?.last_id;
            if (!payload?.has_more || !cursor || cursors.has(cursor)) break;
            cursors.add(cursor);
            url.searchParams.set("after_id", cursor);
        }

        safePostMessage(port, state, {
            type: "CLAUDE_MODELS_RESPONSE",
            requestId,
            modelIds: [...modelIds],
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "CLAUDE_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
