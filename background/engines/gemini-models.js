import { tDetail } from "../i18n.js";
import { safePostMessage } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_GEMINI_BASE_URL =
    "https://generativelanguage.googleapis.com/v1beta/models";

function resolveGeminiModelsUrl(rawUrl, apiKey) {
    const normalized = normalizeFixedHttpEndpoint(
        rawUrl,
        DEFAULT_GEMINI_BASE_URL,
        {
            preferredProtocol: "https",
            errorPrefix: "Gemini ",
            endpointPath: "/v1beta/models",
            suffixOnVersionBase: "/models",
            endpointMatchers: [/\/models$/i, /:streamgeneratecontent$/i, /\/interactions$/i],
        },
    );
    if (!normalized.ok) {
        return normalized;
    }

    const modelsUrl = new URL(normalized.url);
    const isInteractions = /\/interactions$/i.test(modelsUrl.pathname);
    if (/\/models\/[^/]+:streamgeneratecontent$/i.test(modelsUrl.pathname)) {
        modelsUrl.pathname = modelsUrl.pathname.replace(
            /\/models\/[^/]+:streamgeneratecontent$/i,
            "/models",
        );
    } else if (isInteractions) {
        modelsUrl.pathname = modelsUrl.pathname.replace(/\/interactions$/i, "/models");
    } else if (!/\/models$/i.test(modelsUrl.pathname)) {
        modelsUrl.pathname = "/v1beta/models";
    }

    const useHeaderAuth =
        modelsUrl.origin === new URL(DEFAULT_GEMINI_BASE_URL).origin ||
        isInteractions;
    if (apiKey && !useHeaderAuth) {
        modelsUrl.searchParams.set("key", apiKey);
    }

    return {
        ok: true,
        modelsUrl: modelsUrl.toString(),
        authHeaders: apiKey && useHeaderAuth ? { "x-goog-api-key": apiKey } : {},
    };
}

function extractGeminiModelIds(payload) {
    const data = Array.isArray(payload?.models) ? payload.models : [];
    return Array.from(
        new Set(
            data
                .map((item) => {
                    const fullName = String(item?.name || "").trim();
                    if (!fullName) {
                        return "";
                    }
                    return fullName.replace(/^models\//i, "").trim();
                })
                .filter(Boolean),
        ),
    );
}

export async function handleGeminiGetModels(message, port, state) {
    const requestId = message?.requestId || `gemini-models-${Date.now()}`;
    const apiKey = String(message?.apiKey || "").trim();
    const endpoint = resolveGeminiModelsUrl(message?.apiUrl, apiKey);

    if (!endpoint.ok) {
        safePostMessage(port, state, {
            type: "GEMINI_OP_ERROR",
            requestId,
            error: endpoint.error,
        });
        return;
    }

    try {
        const url = new URL(endpoint.modelsUrl);
        const headers = mergeCustomHeaders(
            { Accept: "application/json", ...endpoint.authHeaders },
            message?.customHeaders,
        ).headers;
        const modelIds = new Set();
        const pageTokens = new Set();

        while (state?.connected !== false) {
            const res = await fetch(url.href, {
                method: "GET",
                headers,
            });

            if (!res.ok) {
                const textErr = await res.text();
                safePostMessage(port, state, {
                    type: "GEMINI_OP_ERROR",
                    requestId,
                    error: tDetail("translate.models.geminiFailed", {
                        error: textErr || `${res.status} ${res.statusText}`,
                    }),
                });
                return;
            }

            const payload = await res.json();
            for (const modelId of extractGeminiModelIds(payload)) {
                modelIds.add(modelId);
            }
            const token = payload?.nextPageToken;
            if (!token || pageTokens.has(token)) break;
            pageTokens.add(token);
            url.searchParams.set("pageToken", token);
        }

        safePostMessage(port, state, {
            type: "GEMINI_MODELS_RESPONSE",
            requestId,
            modelIds: [...modelIds],
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "GEMINI_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
