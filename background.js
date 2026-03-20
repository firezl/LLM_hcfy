// background.js
// Service worker translation runtime: orchestrates translation work and streams back progress/results.

import * as webllm from "./vendor/webllm/index.js";

const PORT_NAME = "jyt-translate";
const MESSAGE_TYPE_START = "TRANSLATE_START";
const MESSAGE_TYPE_WEBLLM_PRELOAD = "WEBLLM_PRELOAD";
const MESSAGE_TYPE_WEBLLM_CLEAR_CACHE = "WEBLLM_CLEAR_CACHE";
const MESSAGE_TYPE_WEBLLM_GET_MODELS = "WEBLLM_GET_MODELS";
const RECOMMENDED_WEBLLM_MODELS = [
    "Qwen3-0.6B-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
];
const PDF_VIEWER_PATH = "vendor/pdfjs/web/viewer.html";
const DEFAULT_WEBLLM_MODEL = "Qwen3-0.6B-q4f16_1-MLC";
const WEBLLM_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const WEBLLM_IDLE_CHECK_INTERVAL_MS = 60 * 1000;
const HUGGINGFACE_BASE = "https://huggingface.co";
const redirectingTabs = new Map();
const runtimeBaseUrl = chrome.runtime.getURL("");
const isFirefoxExtensionRuntime = runtimeBaseUrl.startsWith("moz-extension://");

let webllmEngine = null;
let webllmEngineModelId = "";
let webllmEngineMirrorBase = "";
let webllmEngineLoadingPromise = null;
let webllmEngineLoadingModelId = "";
let webllmLastUsedAt = 0;
const webllmAppConfigCache = new Map();

function isWebLLMRuntimeSupported() {
    if (isFirefoxExtensionRuntime) {
        return false;
    }
    return typeof navigator !== "undefined" && !!navigator.gpu;
}

function resolveWebLLMModelId(modelId, settings) {
    const preferred = (modelId || "").trim();
    if (preferred) {
        return preferred;
    }

    const selected = (settings?.webllm_model || "").trim();
    if (selected === "custom") {
        return (settings?.webllm_custom_model || "").trim();
    }

    return selected || DEFAULT_WEBLLM_MODEL;
}

function normalizeMirrorBase(url) {
    const raw = String(url || "").trim();
    if (!raw) return HUGGINGFACE_BASE;
    try {
        const parsed = new URL(raw);
        return `${parsed.protocol}//${parsed.host}`;
    } catch (err) {
        return HUGGINGFACE_BASE;
    }
}

function resolveWebLLMMirrorBase(settings) {
    const mirror = String(settings?.webllm_model_mirror || "official").trim();
    if (mirror === "hf-mirror") {
        return "https://hf-mirror.com";
    }
    if (mirror === "custom") {
        return normalizeMirrorBase(settings?.webllm_custom_mirror || "");
    }
    return HUGGINGFACE_BASE;
}

function remapModelRepoToMirror(modelRepoUrl, mirrorBase) {
    const raw = String(modelRepoUrl || "");
    if (!raw) return raw;
    const normalizedMirror = normalizeMirrorBase(mirrorBase);
    if (!raw.startsWith(`${HUGGINGFACE_BASE}/`)) {
        return raw;
    }
    return raw.replace(HUGGINGFACE_BASE, normalizedMirror);
}

function buildMirrorAwareAppConfig(mirrorBase) {
    const normalizedMirror = normalizeMirrorBase(mirrorBase);
    if (webllmAppConfigCache.has(normalizedMirror)) {
        return webllmAppConfigCache.get(normalizedMirror);
    }

    const source = webllm.prebuiltAppConfig || {};
    const modelList = Array.isArray(source.model_list) ? source.model_list : [];
    const mappedModelList = modelList.map((item) => ({
        ...item,
        model: remapModelRepoToMirror(item?.model, normalizedMirror),
    }));

    const appConfig = {
        ...source,
        model_list: mappedModelList,
    };
    webllmAppConfigCache.set(normalizedMirror, appConfig);
    return appConfig;
}

function postWebLLMProgress(port, state, requestId, report) {
    const progressValue = Number(report?.progress);
    const progress = Number.isFinite(progressValue)
        ? Math.round(progressValue * 100)
        : null;

    safePostMessage(port, state, {
        type: "WEBLLM_MODEL_PROGRESS",
        requestId,
        progress,
        text: report?.text || "模型加载中",
    });
}

async function unloadWebLLMModel(clearCache) {
    const loadedModelId = webllmEngineModelId;

    if (webllmEngine && typeof webllmEngine.unload === "function") {
        try {
            await webllmEngine.unload();
        } catch (err) {
            console.warn("Failed to unload webllm engine", err);
        }
    }

    webllmEngine = null;
    webllmEngineModelId = "";
    webllmEngineMirrorBase = "";
    webllmLastUsedAt = 0;

    if (clearCache && loadedModelId) {
        try {
            await webllm.deleteModelAllInfoInCache(loadedModelId);
        } catch (err) {
            console.warn("Failed to clear webllm model cache", err);
        }
    }
}

async function maybeClearIdleWebLLMCache() {
    if (!webllmEngine || !webllmLastUsedAt) {
        return;
    }

    const now = Date.now();
    if (now - webllmLastUsedAt < WEBLLM_IDLE_TIMEOUT_MS) {
        return;
    }

    await unloadWebLLMModel(true);
}

setInterval(() => {
    void maybeClearIdleWebLLMCache();
}, WEBLLM_IDLE_CHECK_INTERVAL_MS);

async function ensureWebLLMEngine(modelId, mirrorBase, port, state, requestId) {
    if (
        webllmEngine &&
        webllmEngineModelId === modelId &&
        webllmEngineMirrorBase === normalizeMirrorBase(mirrorBase)
    ) {
        return webllmEngine;
    }

    if (
        webllmEngineLoadingPromise &&
        webllmEngineLoadingModelId &&
        webllmEngineLoadingModelId !== modelId
    ) {
        await webllmEngineLoadingPromise;
    }

    if (!webllmEngineLoadingPromise) {
        webllmEngineLoadingModelId = modelId;
        webllmEngineLoadingPromise = (async () => {
            if (webllmEngine && webllmEngineModelId !== modelId) {
                await unloadWebLLMModel(false);
            }

            if (
                webllmEngine &&
                webllmEngineModelId === modelId &&
                webllmEngineMirrorBase !== normalizeMirrorBase(mirrorBase)
            ) {
                await unloadWebLLMModel(false);
            }

            const engine = await webllm.CreateMLCEngine(modelId, {
                appConfig: buildMirrorAwareAppConfig(mirrorBase),
                initProgressCallback: (report) => {
                    postWebLLMProgress(port, state, requestId, report || {});
                },
            });

            webllmEngine = engine;
            webllmEngineModelId = modelId;
            webllmEngineMirrorBase = normalizeMirrorBase(mirrorBase);
            webllmLastUsedAt = Date.now();
            return engine;
        })();
    }

    try {
        return await webllmEngineLoadingPromise;
    } finally {
        webllmEngineLoadingPromise = null;
        webllmEngineLoadingModelId = "";
    }
}

function isInternalPdfViewerUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }
    return url.startsWith(chrome.runtime.getURL(PDF_VIEWER_PATH));
}

function isLikelyDirectPdfUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return false;
    }

    if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
        return false;
    }

    if (/\.pdf$/i.test(parsed.pathname)) {
        return true;
    }

    let decodedSearch = parsed.search || "";
    try {
        decodedSearch = decodeURIComponent(decodedSearch);
    } catch (err) {
        // keep raw search when decoding fails
    }
    if (/\.pdf(?:$|[&#?])/i.test(decodedSearch)) {
        return true;
    }

    return false;
}

function extractPdfUrlFromViewerParam(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return null;
    }

    const fileParam = parsed.searchParams.get("file");
    if (!fileParam) {
        return null;
    }

    let decoded = fileParam;
    try {
        decoded = decodeURIComponent(fileParam);
    } catch (err) {
        // keep raw value when decoding fails
    }

    if (isInternalPdfViewerUrl(decoded)) {
        return null;
    }

    if (isLikelyDirectPdfUrl(decoded)) {
        return decoded;
    }

    return null;
}

function resolvePdfSourceUrl(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    if (isInternalPdfViewerUrl(url)) {
        return null;
    }

    if (isLikelyDirectPdfUrl(url)) {
        return url;
    }

    return extractPdfUrlFromViewerParam(url);
}

function toInternalPdfViewerUrl(pdfUrl) {
    return chrome.runtime.getURL(
        `${PDF_VIEWER_PATH}?file=${encodeURIComponent(pdfUrl)}`,
    );
}

function isFileProtocolUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }
    try {
        return new URL(url).protocol === "file:";
    } catch (err) {
        return false;
    }
}

async function safeUpdateTabUrl(tabId, targetUrl) {
    if (!Number.isInteger(tabId) || tabId < 0 || !targetUrl) {
        return;
    }

    try {
        const maybePromise = chrome.tabs.update(tabId, { url: targetUrl });
        if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
        }
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (/Invalid tab ID/i.test(message)) {
            return;
        }
        console.warn("Failed to update tab URL", { tabId, targetUrl, err });
    }
}

function detectLangByHeuristic(text) {
    const zh = /[\u4e00-\u9fff]/;
    return zh.test(text) ? "zh" : "en";
}

function resolveLanguagePair(request) {
    const sourceSetting = request?.settings?.source_lang || "auto";
    const targetSetting = request?.settings?.target_lang || "auto";

    const from =
        sourceSetting !== "auto"
            ? sourceSetting
            : request.from ||
              request.preferredFrom ||
              detectLangByHeuristic(request.text || "");

    let to =
        targetSetting !== "auto"
            ? targetSetting
            : request.to ||
              request.preferredTo ||
              (from === "zh" ? "en" : "zh");

    if (to === from) {
        to = from === "zh" ? "en" : "zh";
    }

    return { from, to };
}

function getLanguageDisplayName(lang) {
    const normalized = String(lang || "").toLowerCase();
    const names = {
        zh: "中文",
        en: "英文",
        ja: "日文",
        ko: "韩文",
        fr: "法文",
        de: "德文",
        es: "西班牙文",
        ru: "俄文",
    };
    return names[normalized] || `${normalized}语言`;
}

function buildPrompt(text, to) {
    const targetLang = getLanguageDisplayName(to);
    return `请把这段文字翻译为${targetLang}，不要有多余的输出。输入:\n${text}`;
}

function buildWebLLMPrompt(text, to) {
    const targetLang = getLanguageDisplayName(to);
    return `请把以下文本翻译为${targetLang}，不要有多余的输出。输入:\n${text}`;
}

function safePostMessage(port, state, payload) {
    if (!state.connected) {
        return false;
    }
    try {
        port.postMessage(payload);
        return true;
    } catch (err) {
        state.connected = false;
        return false;
    }
}

function postTranslateError(port, state, requestId, error) {
    safePostMessage(port, state, {
        type: "TRANSLATE_ERROR",
        requestId,
        error,
    });
}

function parseOpenAIStreamLine(line) {
    const trimmed = line.trim();
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
        console.error("Error parsing stream data", err);
        return null;
    }
}

async function streamOpenAITranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const apiUrl = settings.openai_api_url;
    const key = settings.openai_api_key;

    if (!apiUrl || !key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 OpenAI API 地址与 Key",
        );
        return;
    }

    const isThinking = !!settings.show_thoughts;
    const model = isThinking
        ? settings.openai_thinking_model || "gpt-5-thinking"
        : settings.openai_model || "gpt-4o-mini";

    const body = {
        model,
        messages: [{ role: "user", content: buildPrompt(text, to) }],
        temperature: 0.2,
        stream: true,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const textErr = await res.text();
            postTranslateError(
                port,
                state,
                requestId,
                "OpenAI 请求失败: " + textErr,
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
                const delta = parseOpenAIStreamLine(line);
                if (!delta) {
                    continue;
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

                if (delta.reasoning_content) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_THOUGHT",
                        requestId,
                        content: delta.reasoning_content,
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

async function streamWebLLMTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const modelId = resolveWebLLMModelId("", settings);
    const mirrorBase = resolveWebLLMMirrorBase(settings);
    const enableThinking = !!settings?.webllm_show_thoughts;
    const isQwen3Model = /^qwen3/i.test(modelId || "");

    if (!isWebLLMRuntimeSupported()) {
        postTranslateError(
            port,
            state,
            requestId,
            "当前环境不支持 WebLLM（仅支持 Chrome/Edge 且需要 WebGPU）",
        );
        return;
    }

    if (!modelId) {
        postTranslateError(
            port,
            state,
            requestId,
            "请先在设置中选择 WebLLM 模型",
        );
        return;
    }

    try {
        const engine = await ensureWebLLMEngine(
            modelId,
            mirrorBase,
            port,
            state,
            requestId,
        );
        webllmLastUsedAt = Date.now();

        const completionRequest = {
            stream: true,
            temperature: 0.2,
            messages: [
                {
                    role: "user",
                    content: buildWebLLMPrompt(text, to),
                },
            ],
        };

        if (isQwen3Model) {
            completionRequest.extra_body = {
                enable_thinking: enableThinking,
            };
        }

        const stream = await engine.chat.completions.create(completionRequest);

        for await (const chunk of stream) {
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (!delta) {
                continue;
            }
            webllmLastUsedAt = Date.now();
            const ok = safePostMessage(port, state, {
                type: "TRANSLATE_CHUNK",
                requestId,
                content: delta,
            });
            if (!ok) {
                return;
            }
        }

        safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
    } catch (err) {
        postTranslateError(
            port,
            state,
            requestId,
            err && err.message ? err.message : String(err),
        );
    }
}

async function handleWebLLMPreload(message, port, state) {
    const requestId = message?.requestId || `webllm-preload-${Date.now()}`;
    const modelId = resolveWebLLMModelId(
        message?.modelId || "",
        message?.settings,
    );
    const mirrorBase = resolveWebLLMMirrorBase(message?.settings);

    if (!isWebLLMRuntimeSupported()) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: "当前环境不支持 WebLLM（仅支持 Chrome/Edge 且需要 WebGPU）",
        });
        return;
    }

    if (!modelId) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: "未提供模型 ID",
        });
        return;
    }

    try {
        await ensureWebLLMEngine(modelId, mirrorBase, port, state, requestId);
        webllmLastUsedAt = Date.now();
        safePostMessage(port, state, {
            type: "WEBLLM_PRELOAD_DONE",
            requestId,
            modelId,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}

async function handleWebLLMClearCache(message, port, state) {
    const requestId = message?.requestId || `webllm-clear-${Date.now()}`;
    const targetModelId = resolveWebLLMModelId(
        message?.modelId || "",
        message?.settings,
    );

    try {
        if (webllmEngine && webllmEngineModelId === targetModelId) {
            await unloadWebLLMModel(true);
        } else if (targetModelId) {
            await webllm.deleteModelAllInfoInCache(targetModelId);
        }

        safePostMessage(port, state, {
            type: "WEBLLM_CLEAR_DONE",
            requestId,
            modelId: targetModelId,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}

function getWebLLMModelListPayload() {
    const modelList = Array.isArray(webllm?.prebuiltAppConfig?.model_list)
        ? webllm.prebuiltAppConfig.model_list
        : [];

    const allIds = Array.from(
        new Set(
            modelList
                .map((item) => (item && item.model_id ? item.model_id : ""))
                .filter(Boolean),
        ),
    );

    const recommended = RECOMMENDED_WEBLLM_MODELS.filter((id) =>
        allIds.includes(id),
    );
    const others = allIds.filter((id) => !recommended.includes(id));

    return {
        modelIds: [...recommended, ...others],
        recommendedModelIds: RECOMMENDED_WEBLLM_MODELS,
    };
}

function handleWebLLMGetModels(message, port, state) {
    const requestId = message?.requestId || `webllm-models-${Date.now()}`;
    try {
        const payload = getWebLLMModelListPayload();
        safePostMessage(port, state, {
            type: "WEBLLM_MODELS_RESPONSE",
            requestId,
            ...payload,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}

async function handleTranslateStart(message, port, state) {
    const engine = message?.settings?.engine || "auto";

    if (engine === "browser") {
        postTranslateError(
            port,
            state,
            message.requestId,
            "浏览器 Translation API 不支持在扩展 service worker 中运行，请使用 auto 或 openai",
        );
        return;
    }

    if (engine === "webllm") {
        await streamWebLLMTranslate(message, port, state);
        return;
    }

    await streamOpenAITranslate(message, port, state);
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) {
        return;
    }

    const state = {
        connected: true,
        controllers: new Map(),
    };

    port.onDisconnect.addListener(() => {
        state.connected = false;
        for (const controller of state.controllers.values()) {
            controller.abort();
        }
        state.controllers.clear();
    });

    port.onMessage.addListener((message) => {
        if (!message || !message.type) {
            return;
        }

        if (message.type === MESSAGE_TYPE_START) {
            void handleTranslateStart(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_PRELOAD) {
            void handleWebLLMPreload(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_CLEAR_CACHE) {
            void handleWebLLMClearCache(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_GET_MODELS) {
            handleWebLLMGetModels(message, port, state);
        }
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const nextUrl = changeInfo?.url;
    if (!nextUrl || typeof nextUrl !== "string") {
        return;
    }

    if (isInternalPdfViewerUrl(nextUrl)) {
        redirectingTabs.delete(tabId);
        return;
    }

    const pdfSourceUrl = resolvePdfSourceUrl(nextUrl);
    if (!pdfSourceUrl) {
        return;
    }

    if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfSourceUrl)) {
        return;
    }

    const targetUrl = toInternalPdfViewerUrl(pdfSourceUrl);
    if (nextUrl === targetUrl) {
        return;
    }

    const lastTargetUrl = redirectingTabs.get(tabId);
    if (lastTargetUrl === targetUrl) {
        return;
    }

    redirectingTabs.set(tabId, targetUrl);
    void safeUpdateTabUrl(tabId, targetUrl);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    redirectingTabs.delete(tabId);
});
