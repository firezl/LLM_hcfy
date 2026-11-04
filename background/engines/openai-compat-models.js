import { t, tDetail } from "../i18n.js";
import { safePostMessage } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";
import { DEFAULT_SETTINGS } from "../../libs/default-settings.mjs";

const DEFAULT_OPENAI_COMPAT_API_URL =
    "https://api.openai.com/v1/chat/completions";

const PREDEFINED_QWEN_MODELS = [
    "qwen3.8-flash",
    "qwen3.8-max",
    "qwen3.7-plus",
    "qwen3.6-plus",
    "qwen3.5-plus",
    "qwen-plus",
    "qwen-flash",
];

function isDashScopeHost(hostname) {
    return /^dashscope(?:-[a-z]+)?\.aliyuncs\.com$/.test(hostname) ||
        hostname.endsWith(".maas.aliyuncs.com");
}

function sendPredefinedModels(port, state, requestId) {
    safePostMessage(port, state, {
        type: "OPENAI_COMPAT_MODELS_RESPONSE",
        requestId,
        modelIds: PREDEFINED_QWEN_MODELS,
    });
}

function extractOpenAIModelIds(data) {
    return Array.from(
        new Set(
            data.map((item) => String(item?.id || "").trim()).filter(Boolean),
        ),
    );
}

async function fetchDashScopeModelIds(url, headers, state) {
    url.pathname = "/api/v1/models";
    url.searchParams.set("capabilities", "TG");
    url.searchParams.set("page_size", "100");
    const modelIds = new Set();
    let page = 1;
    let seen = 0;

    while (state?.connected !== false) {
        url.searchParams.set("page_no", String(page++));
        const response = await fetch(url.href, { method: "GET", headers });
        if (!response.ok) throw new Error(`DashScope model list: HTTP ${response.status}`);

        const payload = await response.json();
        const { models, total } = payload?.output || {};
        if (!Array.isArray(models)) throw new Error("Invalid DashScope model list");
        for (const item of models) {
            if (typeof item?.model === "string" && item.model.trim()) {
                modelIds.add(item.model.trim());
            }
        }
        seen += models.length;
        if (!models.length || !Number.isFinite(total) || seen >= total) break;
    }
    return [...modelIds];
}

export async function handleOpenAICompatGetModels(message, port, state) {
    const requestId =
        message?.requestId || `openai-compat-models-${Date.now()}`;

    const rawApiUrl = String(
        message?.apiUrl ||
        (message?.engine === "openai" ? DEFAULT_OPENAI_COMPAT_API_URL : "") ||
        DEFAULT_SETTINGS[`${message?.engine}_api_url`] ||
        "",
    ).trim();
    if (!rawApiUrl) {
        safePostMessage(port, state, {
            type: "OPENAI_COMPAT_OP_ERROR",
            requestId,
            error: t("translate.models.apiUrlRequired"),
        });
        return;
    }

    const endpoint = normalizeOpenAICompatEndpoint(
        rawApiUrl,
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
    const modelsUrl = new URL(endpoint.modelsUrl);
    const dashScope = isDashScopeHost(modelsUrl.hostname);
    if (modelsUrl.origin === "https://api.x.ai") {
        modelsUrl.pathname = "/v1/language-models";
    }

    try {
        if (dashScope) {
            const modelIds = apiKey
                ? await fetchDashScopeModelIds(modelsUrl, mergedHeaders, state)
                : [];
            if (!modelIds.length) {
                sendPredefinedModels(port, state, requestId);
                return;
            }
            safePostMessage(port, state, {
                type: "OPENAI_COMPAT_MODELS_RESPONSE",
                requestId,
                modelIds,
            });
            return;
        }

        const res = await fetch(modelsUrl.href, {
            method: "GET",
            headers: mergedHeaders,
        });

        if (!res.ok) {
            const textErr = await res.text();
            safePostMessage(port, state, {
                type: "OPENAI_COMPAT_OP_ERROR",
                requestId,
                error: tDetail("translate.models.openaiCompatFailed", {
                    error: textErr || `${res.status} ${res.statusText}`,
                }),
            });
            return;
        }

        const payload = await res.json();
        const models = payload?.data ?? payload?.models;
        const modelIds = extractOpenAIModelIds(Array.isArray(models) ? models : []);

        safePostMessage(port, state, {
            type: "OPENAI_COMPAT_MODELS_RESPONSE",
            requestId,
            modelIds,
        });
    } catch (err) {
        if (dashScope) {
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
