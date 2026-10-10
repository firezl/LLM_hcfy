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
            endpointMatchers: [/\/models$/i, /:streamgeneratecontent$/i],
        },
    );
    if (!normalized.ok) {
        return normalized;
    }

    const modelsUrl = new URL(normalized.url);
    if (/\/models\/[^/]+:streamgeneratecontent$/i.test(modelsUrl.pathname)) {
        modelsUrl.pathname = modelsUrl.pathname.replace(
            /\/models\/[^/]+:streamgeneratecontent$/i,
            "/models",
        );
    } else if (!/\/models$/i.test(modelsUrl.pathname)) {
        modelsUrl.pathname = "/v1beta/models";
    }

    if (apiKey) {
        modelsUrl.searchParams.set("key", apiKey);
    }

    return {
        ok: true,
        modelsUrl: modelsUrl.toString(),
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
        const res = await fetch(endpoint.modelsUrl, {
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
                type: "GEMINI_OP_ERROR",
                requestId,
                error: tDetail("translate.models.geminiFailed", {
                    error: textErr || `${res.status} ${res.statusText}`,
                }),
            });
            return;
        }

        const payload = await res.json();
        const modelIds = extractGeminiModelIds(payload);

        safePostMessage(port, state, {
            type: "GEMINI_MODELS_RESPONSE",
            requestId,
            modelIds,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "GEMINI_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
