import {
    DEFAULT_WEBLLM_MODEL,
    HUGGINGFACE_BASE,
    RECOMMENDED_WEBLLM_MODELS,
    WEBLLM_IDLE_CHECK_INTERVAL_MS,
    WEBLLM_IDLE_TIMEOUT_MS,
} from "../constants.js";
import { extensionApi } from "../extension-api.js";
import {
    buildWebLLMPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError, safePostMessage } from "../port-utils.js";
import * as webllmModule from "../../vendor/webllm/index.js";

const runtimeBaseUrl = extensionApi.runtime.getURL("");
const isFirefoxExtensionRuntime = runtimeBaseUrl.startsWith("moz-extension://");

let webllmEngine = null;
let webllmEngineModelId = "";
let webllmEngineMirrorBase = "";
let webllmEngineLoadingPromise = null;
let webllmEngineLoadingModelId = "";
let webllmLastUsedAt = 0;
const webllmAppConfigCache = new Map();
let webllmIdleTimerStarted = false;

function isWebLLMRuntimeSupported() {
    if (isFirefoxExtensionRuntime) {
        return false;
    }
    return typeof navigator !== "undefined" && !!navigator.gpu;
}

async function getWebLLMModule() {
    if (!isWebLLMRuntimeSupported()) {
        throw new Error(
            "当前环境不支持 WebLLM（仅支持 Chrome/Edge 且需要 WebGPU）",
        );
    }
    return webllmModule;
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

async function buildMirrorAwareAppConfig(mirrorBase) {
    const normalizedMirror = normalizeMirrorBase(mirrorBase);
    if (webllmAppConfigCache.has(normalizedMirror)) {
        return webllmAppConfigCache.get(normalizedMirror);
    }

    const webllm = await getWebLLMModule();
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
            const webllm = await getWebLLMModule();
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

export function startWebLLMIdleMonitor() {
    if (webllmIdleTimerStarted) {
        return;
    }
    webllmIdleTimerStarted = true;
    setInterval(() => {
        void maybeClearIdleWebLLMCache();
    }, WEBLLM_IDLE_CHECK_INTERVAL_MS);
}

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

            const webllm = await getWebLLMModule();
            const engine = await webllm.CreateMLCEngine(modelId, {
                appConfig: await buildMirrorAwareAppConfig(mirrorBase),
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

export async function streamWebLLMTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];
    const modelId = resolveWebLLMModelId("", settings);
    const mirrorBase = resolveWebLLMMirrorBase(settings);
    const enableThinking = !!settings?.webllm_show_thoughts;
    const isQwen3Model = /^qwen3/i.test(modelId || "");
    const promptContent = buildWebLLMPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
    });

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
                    content: promptContent,
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

export async function handleWebLLMPreload(message, port, state) {
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

export async function handleWebLLMClearCache(message, port, state) {
    const requestId = message?.requestId || `webllm-clear-${Date.now()}`;
    const targetModelId = resolveWebLLMModelId(
        message?.modelId || "",
        message?.settings,
    );

    try {
        if (webllmEngine && webllmEngineModelId === targetModelId) {
            await unloadWebLLMModel(true);
        } else if (targetModelId) {
            const webllm = await getWebLLMModule();
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

async function getWebLLMModelListPayload() {
    let modelList = [];
    try {
        const webllm = await getWebLLMModule();
        modelList = Array.isArray(webllm?.prebuiltAppConfig?.model_list)
            ? webllm.prebuiltAppConfig.model_list
            : [];
    } catch (err) {
        modelList = [];
    }

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

export async function handleWebLLMGetModels(message, port, state) {
    const requestId = message?.requestId || `webllm-models-${Date.now()}`;
    try {
        const payload = await getWebLLMModelListPayload();
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
