import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import {
    parseSseJsonLine,
    extractChoiceDelta,
} from "./openai-compat-stream.js";
import { pickOpenAIReasoningEffort } from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_OPENROUTER_API_URL =
    "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const modelCache = new Map();

function normalizeModelId(model) {
    return String(model || "")
        .trim()
        .toLowerCase();
}

function parsePrice(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function isZeroPrice(value) {
    const price = parsePrice(value);
    return price !== null && price <= 0;
}

function isOpenRouterFreeModel(item) {
    const id = normalizeModelId(item?.id);
    if (id === DEFAULT_OPENROUTER_MODEL || id.endsWith(":free")) {
        return true;
    }

    const pricing = item?.pricing && typeof item.pricing === "object"
        ? item.pricing
        : {};
    const relevantPrices = [
        pricing.prompt,
        pricing.completion,
        pricing.request,
        pricing.input,
        pricing.output,
    ].filter((value) => value !== undefined && value !== null);

    return (
        relevantPrices.length > 0 &&
        relevantPrices.every((value) => isZeroPrice(value))
    );
}

function normalizeSupportedParameters(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(
        new Set(
            value
                .map((item) =>
                    String(item || "")
                        .trim()
                        .toLowerCase(),
                )
                .filter(Boolean),
        ),
    );
}

function normalizeOpenRouterModelItem(item) {
    const topProvider =
        item?.top_provider && typeof item.top_provider === "object"
            ? item.top_provider
            : {};
    return {
        id: String(item?.id || "").trim(),
        name: String(item?.name || item?.id || "").trim(),
        isFree: isOpenRouterFreeModel(item),
        contextLength: Number.isFinite(Number(item?.context_length))
            ? Number(item.context_length)
            : 0,
        maxCompletionTokens: Number.isFinite(
            Number(topProvider.max_completion_tokens),
        )
            ? Number(topProvider.max_completion_tokens)
            : 0,
        supportedParameters: normalizeSupportedParameters(
            item?.supported_parameters,
        ),
        pricing:
            item?.pricing && typeof item.pricing === "object"
                ? { ...item.pricing }
                : {},
    };
}

function extractOpenRouterModelItems(payload) {
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return data
        .map(normalizeOpenRouterModelItem)
        .filter((item) => item.id);
}

function buildHeaders(apiKey) {
    const headers = {
        Accept: "application/json",
    };
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }
    return headers;
}

async function fetchOpenRouterModelItems(endpoint, apiKey) {
    const cacheKey = `${endpoint.modelsUrl}\n${apiKey ? "auth" : "anon"}`;
    const cached = modelCache.get(cacheKey);
    if (cached && Date.now() - cached.loadedAt < MODEL_CACHE_TTL_MS) {
        return cached.items;
    }

    const res = await fetch(endpoint.modelsUrl, {
        method: "GET",
        headers: buildHeaders(apiKey),
    });
    if (!res.ok) {
        const textErr = await res.text();
        throw new Error(textErr || `${res.status} ${res.statusText}`);
    }

    const payload = await res.json();
    const items = extractOpenRouterModelItems(payload);
    modelCache.set(cacheKey, {
        loadedAt: Date.now(),
        items,
    });
    return items;
}

async function getOpenRouterModelMeta(endpoint, apiKey, model) {
    try {
        const items = await fetchOpenRouterModelItems(endpoint, apiKey);
        const normalizedModel = normalizeModelId(model);
        return (
            items.find((item) => normalizeModelId(item.id) === normalizedModel) ||
            null
        );
    } catch (err) {
        return null;
    }
}

function supportsParameter(meta, parameter) {
    const supported = Array.isArray(meta?.supportedParameters)
        ? meta.supportedParameters
        : [];
    return supported.includes(String(parameter || "").toLowerCase());
}

function buildOpenRouterOptionalPatch(settings, meta) {
    const patch = {};

    if (supportsParameter(meta, "temperature")) {
        patch.temperature = 1.0;
    }

    const maxCompletionTokens = Number(
        settings?.openrouter_max_completion_tokens,
    );
    if (
        Number.isFinite(maxCompletionTokens) &&
        maxCompletionTokens > 0 &&
        supportsParameter(meta, "max_tokens")
    ) {
        patch.max_tokens = Math.floor(maxCompletionTokens);
    }

    if (settings?.openrouter_show_thoughts && supportsParameter(meta, "reasoning")) {
        const rawEffort = pickOpenAIReasoningEffort(
            settings?.openrouter_reasoning_effort,
            "medium",
        );
        const effort =
            rawEffort === "minimal"
                ? "low"
                : rawEffort === "xhigh"
                  ? "high"
                  : rawEffort;
        if (effort !== "none") {
            patch.reasoning = { effort };
        }
    }

    return patch;
}

function isUnsupportedParameterError(status, text) {
    return (
        (status === 400 || status === 422) &&
        /(unsupported|unknown|invalid|parameter|reasoning|temperature|max_tokens|max_completion_tokens)/i.test(
            text || "",
        )
    );
}

function stringifyReasoningDetails(details) {
    if (!Array.isArray(details)) {
        return "";
    }
    return details
        .map((item) => {
            if (typeof item === "string") {
                return item;
            }
            return (
                item?.text ||
                item?.content ||
                item?.summary ||
                item?.reasoning ||
                ""
            );
        })
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .join("\n");
}

function extractOpenRouterDelta(payload) {
    const delta = extractChoiceDelta(payload);
    if (!delta) {
        return null;
    }
    return {
        content: delta.content || "",
        thought:
            delta.reasoning ||
            delta.reasoning_content ||
            stringifyReasoningDetails(delta.reasoning_details),
    };
}

async function streamOpenRouterResponse({
    requestId,
    port,
    state,
    endpoint,
    apiKey,
    primaryBody,
    fallbackBody,
}) {
    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    async function sendBody(body) {
        return fetch(endpoint.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
    }

    try {
        let res = await sendBody(primaryBody);
        if (!res.ok) {
            const textErr = await res.text();
            const shouldRetry =
                fallbackBody &&
                fallbackBody !== primaryBody &&
                isUnsupportedParameterError(res.status, textErr);
            if (shouldRetry) {
                res = await sendBody(fallbackBody);
            } else {
                postTranslateError(
                    port,
                    state,
                    requestId,
                    "OpenRouter 请求失败: " + textErr,
                );
                return;
            }
        }

        if (!res.ok) {
            const textErr = await res.text();
            postTranslateError(
                port,
                state,
                requestId,
                "OpenRouter 请求失败: " + textErr,
            );
            return;
        }

        if (!res.body) {
            postTranslateError(port, state, requestId, "响应不包含可读流");
            return;
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
                const payload = parseSseJsonLine(line);
                if (!payload) {
                    continue;
                }

                const delta = extractOpenRouterDelta(payload);
                if (!delta) {
                    continue;
                }

                if (delta.thought) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_THOUGHT",
                        requestId,
                        content: delta.thought,
                    });
                    if (!ok) {
                        return;
                    }
                }

                if (delta.content) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_CHUNK",
                        requestId,
                        content: delta.content,
                    });
                    if (!ok) {
                        return;
                    }
                }
            }
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

export async function streamOpenRouterTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.openrouter_api_url,
        DEFAULT_OPENROUTER_API_URL,
    );
    const apiKey = String(settings?.openrouter_api_key || "").trim();
    const model = String(
        settings?.openrouter_model || DEFAULT_OPENROUTER_MODEL,
    ).trim();
    const promptContent = buildPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
    });

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    if (!apiKey) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 OpenRouter API Key",
        );
        return;
    }

    if (!model) {
        postTranslateError(port, state, requestId, "请先选择 OpenRouter 模型");
        return;
    }

    const baseBody = {
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        stream: true,
    };
    const meta = await getOpenRouterModelMeta(endpoint, apiKey, model);
    const optionalPatch = buildOpenRouterOptionalPatch(settings, meta);
    const primaryBody = {
        ...baseBody,
        ...optionalPatch,
    };

    await streamOpenRouterResponse({
        requestId,
        port,
        state,
        endpoint,
        apiKey,
        primaryBody,
        fallbackBody:
            Object.keys(optionalPatch).length > 0 ? baseBody : null,
    });
}

export async function handleOpenRouterGetModels(message, port, state) {
    const requestId = message?.requestId || `openrouter-models-${Date.now()}`;
    const endpoint = normalizeOpenAICompatEndpoint(
        message?.apiUrl,
        DEFAULT_OPENROUTER_API_URL,
    );

    if (!endpoint.ok) {
        safePostMessage(port, state, {
            type: "OPENROUTER_OP_ERROR",
            requestId,
            error: endpoint.error,
        });
        return;
    }

    const apiKey = String(message?.apiKey || "").trim();

    try {
        const modelItems = await fetchOpenRouterModelItems(endpoint, apiKey);
        safePostMessage(port, state, {
            type: "OPENROUTER_MODELS_RESPONSE",
            requestId,
            modelItems,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "OPENROUTER_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}
