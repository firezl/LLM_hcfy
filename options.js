// options.js
document.addEventListener("DOMContentLoaded", () => {
    const shared = globalThis.JYT_SHARED || {};
    const storageModule = globalThis.JYT_OPTION_STORAGE || {};
    const glossaryModule = globalThis.JYT_OPTION_GLOSSARY || {};
    const modelModule = globalThis.JYT_OPTION_MODEL || {};
    const syncDataModule = globalThis.JYT_OPTION_SYNC_DATA || {};

    function requireSharedConfig(name) {
        const value = shared[name];
        if (!value) {
            throw new Error(`缺少共享配置: ${name}`);
        }
        return value;
    }

    const MESSAGE_TYPES = requireSharedConfig("MESSAGE_TYPES");
    const DEFAULT_SETTINGS = requireSharedConfig("DEFAULT_SETTINGS");
    const runtimeBaseUrl = chrome.runtime.getURL("");
    const isFirefoxRuntime = runtimeBaseUrl.startsWith("moz-extension://");
    const isWebLLMSupportedBrowser = !isFirefoxRuntime;
    const WEBLLM_WEAK_MEMORY_GB = 4;
    const WEBLLM_WEAK_CPU_CORES = 4;
    const RECOMMENDED_WEBLLM_MODELS = requireSharedConfig(
        "RECOMMENDED_WEBLLM_MODELS",
    );
    const RECOMMENDED_SPECIAL_TRANSLATE_MODELS = ["translategemma"];
    const SPECIAL_PROVIDER_OLLAMA = "ollama";
    const SPECIAL_PROVIDER_OPENAI = "openai_compatible";
    const SPECIAL_DEFAULT_URL_BY_PROVIDER = {
        [SPECIAL_PROVIDER_OLLAMA]: "http://localhost:11434/api/chat",
        [SPECIAL_PROVIDER_OPENAI]: "https://api.openai.com/v1/chat/completions",
    };
    const OPENAI_COMPAT_MODEL_ENGINES = [
        {
            name: "openai",
            apiUrlId: "openai_api_url",
            apiKeyId: "openai_api_key",
            modelId: "openai_model",
            customModelId: "openai_custom_model",
            defaultModel: "gpt-4o-mini",
        },
        {
            name: "custom_openai",
            apiUrlId: "custom_openai_api_url",
            apiKeyId: "custom_openai_api_key",
            modelId: "custom_openai_model",
            customModelId: "custom_openai_custom_model",
            defaultModel: "gpt-4o-mini",
        },
        {
            name: "deepseek",
            apiUrlId: "deepseek_api_url",
            apiKeyId: "deepseek_api_key",
            modelId: "deepseek_model",
            customModelId: "deepseek_custom_model",
            defaultModel: "deepseek-chat",
        },
        {
            name: "qwen",
            apiUrlId: "qwen_api_url",
            apiKeyId: "qwen_api_key",
            modelId: "qwen_model",
            customModelId: "qwen_custom_model",
            defaultModel: "qwen-plus",
        },
        {
            name: "glm",
            apiUrlId: "glm_api_url",
            apiKeyId: "glm_api_key",
            modelId: "glm_model",
            customModelId: "glm_custom_model",
            defaultModel: "glm-5.1",
        },
        {
            name: "xiaomi",
            apiUrlId: "xiaomi_api_url",
            apiKeyId: "xiaomi_api_key",
            modelId: "xiaomi_model",
            customModelId: "xiaomi_custom_model",
            defaultModel: "mimo-v2-pro",
        },
        {
            name: "grok",
            apiUrlId: "grok_api_url",
            apiKeyId: "grok_api_key",
            modelId: "grok_model",
            customModelId: "grok_custom_model",
            defaultModel: "grok-3-latest",
        },
    ];
    const OPENAI_COMPAT_ENGINE_BY_NAME = Object.fromEntries(
        OPENAI_COMPAT_MODEL_ENGINES.map((cfg) => [cfg.name, cfg]),
    );
    const API_KEY_FIELDS =
        typeof storageModule.buildApiKeyFields === "function"
            ? storageModule.buildApiKeyFields(DEFAULT_SETTINGS)
            : Object.keys(DEFAULT_SETTINGS).filter((key) =>
                  key.endsWith("_api_key"),
              );
    const modelState =
        typeof modelModule.createModelLoaderState === "function"
            ? modelModule.createModelLoaderState()
            : {
                  loadedSet: new Set(),
                  debounceByKey(key, task, delayMs = 600) {
                      setTimeout(task, delayMs);
                  },
              };
    const modelListLoaded = modelState.loadedSet;
    const debounceByKey = modelState.debounceByKey;

    function getCurrentEffectiveEngine() {
        const selectedEngine = String(els.engine_select?.value || "auto");
        if (selectedEngine !== "llm") {
            return selectedEngine;
        }
        return String(els.llm_engine_select?.value || "openai");
    }

    function extractApiKeyPayload(input) {
        if (typeof storageModule.extractApiKeyPayload === "function") {
            return storageModule.extractApiKeyPayload(API_KEY_FIELDS, input);
        }

        const source = input && typeof input === "object" ? input : {};
        const payload = {};
        for (const key of API_KEY_FIELDS) {
            payload[key] = String(source[key] || "").trim();
        }
        return payload;
    }

    function collectMissingLocalApiKeys(syncItems, localItems) {
        if (typeof storageModule.collectMissingLocalApiKeys === "function") {
            return storageModule.collectMissingLocalApiKeys(
                API_KEY_FIELDS,
                syncItems,
                localItems,
            );
        }

        const sourceSync =
            syncItems && typeof syncItems === "object" ? syncItems : {};
        const sourceLocal =
            localItems && typeof localItems === "object" ? localItems : {};
        const missing = {};

        for (const key of API_KEY_FIELDS) {
            const localValue = String(sourceLocal[key] || "").trim();
            const syncValue = String(sourceSync[key] || "").trim();
            if (!localValue && syncValue) {
                missing[key] = syncValue;
            }
        }

        return missing;
    }

    function stripApiKeyPayload(input) {
        if (typeof storageModule.stripApiKeyPayload === "function") {
            return storageModule.stripApiKeyPayload(API_KEY_FIELDS, input);
        }

        const source = input && typeof input === "object" ? input : {};
        const next = { ...source };
        for (const key of API_KEY_FIELDS) {
            delete next[key];
        }
        return next;
    }

    const ids = [
        "enable_select",
        "engine_select",
        "llm_engine_select",
        "translate_shortcut",
        "source_lang",
        "target_lang",
        "openai_api_url",
        "openai_api_key",
        "openai_model",
        "openai_custom_model",
        "openai_custom_prompt",
        "show_thoughts",
        "openai_reasoning_effort",
        "openai_max_completion_tokens",
        "custom_openai_api_url",
        "custom_openai_api_key",
        "custom_openai_model",
        "custom_openai_custom_model",
        "custom_openai_custom_prompt",
        "custom_openai_show_thoughts",
        "custom_openai_reasoning_effort",
        "custom_openai_max_completion_tokens",
        "deepseek_api_url",
        "deepseek_api_key",
        "deepseek_model",
        "deepseek_custom_model",
        "deepseek_custom_prompt",
        "deepseek_show_thoughts",
        "qwen_api_url",
        "qwen_api_key",
        "qwen_model",
        "qwen_custom_model",
        "qwen_custom_prompt",
        "qwen_show_thoughts",
        "qwen_thinking_budget",
        "qwen_preserve_thinking",
        "glm_api_url",
        "glm_api_key",
        "glm_model",
        "glm_custom_model",
        "glm_custom_prompt",
        "glm_show_thoughts",
        "glm_clear_thinking",
        "xiaomi_api_url",
        "xiaomi_api_key",
        "xiaomi_model",
        "xiaomi_custom_model",
        "xiaomi_custom_prompt",
        "xiaomi_show_thoughts",
        "xiaomi_max_completion_tokens",
        "grok_api_url",
        "grok_api_key",
        "grok_model",
        "grok_custom_model",
        "grok_custom_prompt",
        "grok_show_thoughts",
        "claude_api_url",
        "claude_api_key",
        "claude_model",
        "claude_custom_model",
        "claude_custom_prompt",
        "claude_show_thoughts",
        "claude_max_tokens",
        "claude_thinking_mode",
        "claude_thinking_budget",
        "claude_thinking_effort",
        "gemini_api_url",
        "gemini_api_key",
        "gemini_model",
        "gemini_custom_model",
        "gemini_custom_prompt",
        "gemini_show_thoughts",
        "gemini_thinking_level",
        "gemini_thinking_budget",
        "ollama_api_url",
        "ollama_model_select",
        "ollama_custom_model",
        "ollama_custom_prompt",
        "ollama_show_thoughts",
        "special_translate_provider",
        "special_translate_api_url",
        "special_translate_api_key",
        "special_translate_model_select",
        "special_translate_custom_model",
        "special_translate_custom_prompt",
        "special_translate_show_thoughts",
        "webllm_model_select",
        "webllm_custom_model",
        "webllm_custom_prompt",
        "webllm_show_thoughts",
        "webllm_model_mirror",
        "webllm_custom_mirror",
        "theme_mode",
        "font_family",
        "bubble_width_percent",
        "bubble_height_percent",
    ];
    const els = {};
    ids.forEach((id) => (els[id] = document.getElementById(id)));
    const openaiSection = document.getElementById("openai_section");
    const customOpenAISection = document.getElementById(
        "custom_openai_section",
    );
    const deepseekSection = document.getElementById("deepseek_section");
    const qwenSection = document.getElementById("qwen_section");
    const glmSection = document.getElementById("glm_section");
    const xiaomiSection = document.getElementById("xiaomi_section");
    const grokSection = document.getElementById("grok_section");
    const claudeSection = document.getElementById("claude_section");
    const geminiSection = document.getElementById("gemini_section");
    const ollamaSection = document.getElementById("ollama_section");
    const specialTranslateSection = document.getElementById(
        "special_translate_section",
    );
    const webllmSection = document.getElementById("webllm_section");
    const webllmPerformanceNote = document.getElementById(
        "webllm_performance_note",
    );
    const webllmStatusEl = document.getElementById("webllm_status");
    const webllmDownloadBtn = document.getElementById("webllm_download");
    const webllmClearCacheBtn = document.getElementById("webllm_clear_cache");
    const openLocalPdfBtn = document.getElementById("open_local_pdf");
    const currentPdfStatusEl = document.getElementById("current_pdf_status");
    const glossaryExportBtn = document.getElementById("glossary_export");
    const glossaryImportBtn = document.getElementById("glossary_import");
    const glossaryImportFileInput = document.getElementById(
        "glossary_import_file",
    );
    const glossaryStatusEl = document.getElementById("glossary_status");
    const glossaryListEl = document.getElementById("glossary_list");
    const glossarySaveBtn = document.getElementById("glossary_save");
    const glossaryCancelEditBtn = document.getElementById(
        "glossary_cancel_edit",
    );
    const glossaryClearBtn = document.getElementById("glossary_clear");
    const glossarySourceLangEl = document.getElementById(
        "glossary_source_lang",
    );
    const glossaryTargetLangEl = document.getElementById(
        "glossary_target_lang",
    );
    const glossarySourceTermEl = document.getElementById(
        "glossary_source_term",
    );
    const glossaryTargetTermEl = document.getElementById(
        "glossary_target_term",
    );
    const configExportBtn = document.getElementById("config_export");
    const configImportBtn = document.getElementById("config_import");
    const configImportFileInput = document.getElementById("config_import_file");
    const configStatusEl = document.getElementById("config_status");
    const webdavBaseUrlEl = document.getElementById("webdav_base_url");
    const webdavUsernameEl = document.getElementById("webdav_username");
    const webdavPasswordEl = document.getElementById("webdav_password");
    const webdavRemoteDirEl = document.getElementById("webdav_remote_dir");
    const webdavSaveLocalBtn = document.getElementById("webdav_save_local");
    const syncTestBtn = document.getElementById("sync_test");
    const syncUploadBtn = document.getElementById("sync_upload");
    const syncDownloadBtn = document.getElementById("sync_download");
    const syncBidirectionalBtn = document.getElementById("sync_bidirectional");
    const syncStatusEl = document.getElementById("sync_status");

    let cachedActiveTab = null;
    let cachedCurrentPdfUrl = "";
    let webllmPort = null;
    let webllmPerfProfile = null;
    const webllmModelRequestResolvers = new Map();
    const ollamaModelRequestResolvers = new Map();
    const openaiCompatModelRequestResolvers = new Map();
    const claudeModelRequestResolvers = new Map();
    const geminiModelRequestResolvers = new Map();
    const specialModelRequestResolvers = new Map();
    const LLM_ENGINES = new Set([
        "openai",
        "custom_openai",
        "gemini",
        "claude",
        "qwen",
        "deepseek",
        "glm",
        "xiaomi",
        "grok",
        "ollama",
        "webllm",
    ]);

    // --- Added: UI Tab Logic & Toast ---
    const tabs = document.querySelectorAll(".jyt-tab");
    const contents = document.querySelectorAll(".jyt-tab-content");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            contents.forEach((c) => c.classList.remove("active"));
            tab.classList.add("active");
            const targetId = tab.dataset.tab;
            if (targetId)
                document.getElementById(targetId).classList.add("active");
        });
    });

    const toastContainer = document.getElementById("toast_container");
    const showToast = (window.showToast = (msg, isError = false) => {
        if (!toastContainer) return;
        const toast = document.createElement("div");
        toast.className = `jyt-toast jyt-toast-show ${isError ? "jyt-toast-error" : "jyt-toast-success"}`;
        toast.textContent = msg;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.remove("jyt-toast-show"), 2500);
        setTimeout(() => toast.remove(), 3000);
    });
    // -----------------------------------

    function isRunningInPopup() {
        try {
            const extensionApi = chrome.extension;
            if (!extensionApi || typeof extensionApi.getViews !== "function") {
                return false;
            }
            const popupViews = extensionApi.getViews({ type: "popup" }) || [];
            return popupViews.includes(window);
        } catch (err) {
            return false;
        }
    }

    function openImportInNewTab() {
        return new Promise((resolve, reject) => {
            try {
                const url = chrome.runtime.getURL(
                    "options.html#glossary-import",
                );
                const maybePromise = chrome.tabs.create({ url });
                if (maybePromise && typeof maybePromise.then === "function") {
                    maybePromise.then(() => resolve()).catch(reject);
                    return;
                }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("读取文件失败"));
            reader.readAsText(file, "utf-8");
        });
    }

    function sendBackgroundMessage(type, payload) {
        const request = {
            type,
            ...(payload || {}),
        };

        if (
            typeof browser !== "undefined" &&
            browser.runtime &&
            typeof browser.runtime.sendMessage === "function"
        ) {
            return browser.runtime.sendMessage(request);
        }

        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(request, (resp) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        reject(new Error(err.message || "后台消息发送失败"));
                        return;
                    }
                    resolve(resp);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    function sendTermMessage(type, payload) {
        return sendBackgroundMessage(type, payload);
    }

    const glossaryController = glossaryModule.createGlossaryController({
        messageTypes: MESSAGE_TYPES,
        sendTermMessage,
        readFileAsText,
        shouldOpenImportInNewTab: () => isFirefoxRuntime && isRunningInPopup(),
        openImportInNewTab,
        elements: {
            sourceLang: glossarySourceLangEl,
            targetLang: glossaryTargetLangEl,
            sourceTerm: glossarySourceTermEl,
            targetTerm: glossaryTargetTermEl,
            saveButton: glossarySaveBtn,
            cancelEditButton: glossaryCancelEditBtn,
            importButton: glossaryImportBtn,
            exportButton: glossaryExportBtn,
            clearButton: glossaryClearBtn,
            importFileInput: glossaryImportFileInput,
            list: glossaryListEl,
            status: glossaryStatusEl,
        },
    });

    const syncDataController = syncDataModule.createSyncDataController({
        defaultSettings: DEFAULT_SETTINGS,
        messageTypes: MESSAGE_TYPES,
        sendBackgroundMessage,
        readFileAsText,
        reloadSettings: load,
        glossary: glossaryController,
        extractApiKeyPayload,
        stripApiKeyPayload,
        elements: {
            configImportButton: configImportBtn,
            configExportButton: configExportBtn,
            configImportFileInput,
            configStatus: configStatusEl,
            webdavBaseUrl: webdavBaseUrlEl,
            webdavUsername: webdavUsernameEl,
            webdavPassword: webdavPasswordEl,
            webdavRemoteDir: webdavRemoteDirEl,
            webdavSaveLocalButton: webdavSaveLocalBtn,
            syncTestButton: syncTestBtn,
            syncUploadButton: syncUploadBtn,
            syncDownloadButton: syncDownloadBtn,
            syncBidirectionalButton: syncBidirectionalBtn,
            syncStatus: syncStatusEl,
        },
    });

    function setWebLLMStatus(text, isError) {
        if (!webllmStatusEl) return;
        webllmStatusEl.textContent = text || "";
        webllmStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function setWebLLMButtonsEnabled(enabled) {
        if (webllmDownloadBtn) webllmDownloadBtn.disabled = !enabled;
        if (webllmClearCacheBtn) webllmClearCacheBtn.disabled = !enabled;
    }

    function populateWebLLMModelSelect(modelIds, selectedModel) {
        if (!els.webllm_model_select) return;

        const uniqueIds = Array.from(
            new Set((modelIds || []).map((id) => String(id || "").trim())),
        ).filter(Boolean);

        const recommended = RECOMMENDED_WEBLLM_MODELS.filter((id) =>
            uniqueIds.includes(id),
        );
        const others = uniqueIds.filter((id) => !recommended.includes(id));
        const orderedIds = [...recommended, ...others];

        els.webllm_model_select.innerHTML = "";
        orderedIds.forEach((id) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = RECOMMENDED_WEBLLM_MODELS.includes(id)
                ? `${id}（推荐）`
                : id;
            els.webllm_model_select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = "自定义模型 ID";
        els.webllm_model_select.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.webllm_model_select.value = selectedModel;
            els.webllm_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            const savedOption = document.createElement("option");
            savedOption.value = selectedModel;
            savedOption.textContent = `${selectedModel}（已保存）`;
            els.webllm_model_select.insertBefore(savedOption, customOption);
            els.webllm_model_select.value = selectedModel;
            els.webllm_custom_model.disabled = true;
            return;
        }

        if (orderedIds.length > 0) {
            els.webllm_model_select.value = orderedIds[0];
            els.webllm_custom_model.disabled = true;
        }
    }

    function populateOllamaModelSelect(modelIds, selectedModel) {
        if (!els.ollama_model_select) return;

        const orderedIds = Array.from(
            new Set((modelIds || []).map((id) => String(id || "").trim())),
        ).filter(Boolean);

        els.ollama_model_select.innerHTML = "";
        orderedIds.forEach((id) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = id;
            els.ollama_model_select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = "自定义模型名";
        els.ollama_model_select.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.ollama_model_select.value = selectedModel;
            els.ollama_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            const savedOption = document.createElement("option");
            savedOption.value = selectedModel;
            savedOption.textContent = `${selectedModel}（已保存）`;
            els.ollama_model_select.insertBefore(savedOption, customOption);
            els.ollama_model_select.value = selectedModel;
            els.ollama_custom_model.disabled = true;
            return;
        }

        if (selectedModel === "custom") {
            els.ollama_model_select.value = "custom";
            els.ollama_custom_model.disabled = false;
            return;
        }

        if (orderedIds.length > 0) {
            els.ollama_model_select.value = orderedIds[0];
            els.ollama_custom_model.disabled = true;
            return;
        }

        els.ollama_model_select.value = "custom";
        els.ollama_custom_model.disabled = false;
    }

    function populateOpenAICompatModelSelect(
        modelSelectEl,
        customModelEl,
        modelIds,
        selectedModel,
    ) {
        if (!modelSelectEl || !customModelEl) return;

        const orderedIds = Array.from(
            new Set((modelIds || []).map((id) => String(id || "").trim())),
        ).filter(Boolean);

        modelSelectEl.innerHTML = "";
        orderedIds.forEach((id) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = id;
            modelSelectEl.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = "自定义模型名";
        modelSelectEl.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            modelSelectEl.value = selectedModel;
            customModelEl.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            const savedOption = document.createElement("option");
            savedOption.value = selectedModel;
            savedOption.textContent = `${selectedModel}（已保存）`;
            modelSelectEl.insertBefore(savedOption, customOption);
            modelSelectEl.value = selectedModel;
            customModelEl.disabled = true;
            return;
        }

        if (selectedModel === "custom") {
            modelSelectEl.value = "custom";
            customModelEl.disabled = false;
            return;
        }

        if (orderedIds.length > 0) {
            modelSelectEl.value = orderedIds[0];
            customModelEl.disabled = true;
            return;
        }

        modelSelectEl.value = "custom";
        customModelEl.disabled = false;
    }

    function getSelectedOpenAICompatModel(modelSelectEl, customModelEl) {
        const selected = String(modelSelectEl?.value || "").trim();
        if (selected === "custom") {
            return String(customModelEl?.value || "").trim();
        }
        return selected;
    }

    function normalizeSpecialProvider(provider) {
        const normalized = String(provider || "")
            .trim()
            .toLowerCase();
        return normalized === SPECIAL_PROVIDER_OPENAI
            ? SPECIAL_PROVIDER_OPENAI
            : SPECIAL_PROVIDER_OLLAMA;
    }

    function getSpecialApiDefaultByProvider(provider) {
        return (
            SPECIAL_DEFAULT_URL_BY_PROVIDER[
                normalizeSpecialProvider(provider)
            ] || SPECIAL_DEFAULT_URL_BY_PROVIDER[SPECIAL_PROVIDER_OLLAMA]
        );
    }

    function populateSpecialTranslateModelSelect(modelIds, selectedModel) {
        if (!els.special_translate_model_select) return;

        const orderedIds = Array.from(
            new Set((modelIds || []).map((id) => String(id || "").trim())),
        ).filter(Boolean);

        els.special_translate_model_select.innerHTML = "";
        orderedIds.forEach((id) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = RECOMMENDED_SPECIAL_TRANSLATE_MODELS.includes(
                id.toLowerCase(),
            )
                ? `${id}（推荐）`
                : id;
            els.special_translate_model_select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = "自定义模型名";
        els.special_translate_model_select.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.special_translate_model_select.value = selectedModel;
            els.special_translate_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            const savedOption = document.createElement("option");
            savedOption.value = selectedModel;
            savedOption.textContent = `${selectedModel}（已保存）`;
            els.special_translate_model_select.insertBefore(
                savedOption,
                customOption,
            );
            els.special_translate_model_select.value = selectedModel;
            els.special_translate_custom_model.disabled = true;
            return;
        }

        if (selectedModel === "custom") {
            els.special_translate_model_select.value = "custom";
            els.special_translate_custom_model.disabled = false;
            return;
        }

        if (orderedIds.length > 0) {
            els.special_translate_model_select.value = orderedIds[0];
            els.special_translate_custom_model.disabled = true;
            return;
        }

        els.special_translate_model_select.value = "custom";
        els.special_translate_custom_model.disabled = false;
    }

    async function requestWebLLMModelList() {
        return new Promise((resolve, reject) => {
            const requestId = `webllm-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                webllmModelRequestResolvers.delete(requestId);
                reject(new Error("请求模型列表超时"));
            }, 8000);

            webllmModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.WEBLLM_GET_MODELS || "WEBLLM_GET_MODELS",
                    requestId,
                });
            } catch (err) {
                clearTimeout(timer);
                webllmModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
    }

    async function requestOllamaModelList(apiUrl) {
        return new Promise((resolve, reject) => {
            const requestId = `ollama-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                ollamaModelRequestResolvers.delete(requestId);
                reject(new Error("请求 Ollama 模型列表超时"));
            }, 8000);

            ollamaModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.OLLAMA_GET_MODELS || "OLLAMA_GET_MODELS",
                    requestId,
                    apiUrl: String(apiUrl || "").trim(),
                });
            } catch (err) {
                clearTimeout(timer);
                ollamaModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
    }

    async function requestOpenAICompatModelList(apiUrl, apiKey) {
        return new Promise((resolve, reject) => {
            const requestId = `openai-compat-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                openaiCompatModelRequestResolvers.delete(requestId);
                reject(new Error("请求 OpenAI 兼容模型列表超时"));
            }, 8000);

            openaiCompatModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.OPENAI_COMPAT_GET_MODELS ||
                        "OPENAI_COMPAT_GET_MODELS",
                    requestId,
                    apiUrl: String(apiUrl || "").trim(),
                    apiKey: String(apiKey || "").trim(),
                });
            } catch (err) {
                clearTimeout(timer);
                openaiCompatModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
    }

    async function requestClaudeModelList(apiUrl, apiKey) {
        return new Promise((resolve, reject) => {
            const requestId = `claude-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                claudeModelRequestResolvers.delete(requestId);
                reject(new Error("请求 Claude 模型列表超时"));
            }, 8000);

            claudeModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.CLAUDE_GET_MODELS || "CLAUDE_GET_MODELS",
                    requestId,
                    apiUrl: String(apiUrl || "").trim(),
                    apiKey: String(apiKey || "").trim(),
                });
            } catch (err) {
                clearTimeout(timer);
                claudeModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
    }

    async function requestGeminiModelList(apiUrl, apiKey) {
        return new Promise((resolve, reject) => {
            const requestId = `gemini-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                geminiModelRequestResolvers.delete(requestId);
                reject(new Error("请求 Gemini 模型列表超时"));
            }, 8000);

            geminiModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.GEMINI_GET_MODELS || "GEMINI_GET_MODELS",
                    requestId,
                    apiUrl: String(apiUrl || "").trim(),
                    apiKey: String(apiKey || "").trim(),
                });
            } catch (err) {
                clearTimeout(timer);
                geminiModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
    }

    async function requestSpecialTranslateModelList(provider, apiUrl, apiKey) {
        return new Promise((resolve, reject) => {
            const requestId = `special-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                specialModelRequestResolvers.delete(requestId);
                reject(new Error("请求专用翻译模型列表超时"));
            }, 8000);

            specialModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.SPECIAL_TRANSLATE_GET_MODELS ||
                        "SPECIAL_TRANSLATE_GET_MODELS",
                    requestId,
                    provider: normalizeSpecialProvider(provider),
                    apiUrl: String(apiUrl || "").trim(),
                    apiKey: String(apiKey || "").trim(),
                });
            } catch (err) {
                clearTimeout(timer);
                specialModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
    }

    function getSelectedWebLLMModelId() {
        const selected = (els.webllm_model_select?.value || "").trim();
        if (selected === "custom") {
            return (els.webllm_custom_model?.value || "").trim();
        }
        return selected;
    }

    function getSelectedWebLLMMirrorBase() {
        const selected = (els.webllm_model_mirror?.value || "official").trim();
        if (selected === "hf-mirror") {
            return "https://hf-mirror.com";
        }
        if (selected === "custom") {
            return (els.webllm_custom_mirror?.value || "").trim();
        }
        return "https://huggingface.co";
    }

    function ensureWebLLMPort() {
        if (webllmPort) return webllmPort;

        webllmPort = chrome.runtime.connect({ name: "jyt-translate" });
        webllmPort.onMessage.addListener((message) => {
            if (!message) return;

            if (message.type === "WEBLLM_MODEL_PROGRESS") {
                const percent = Number.isFinite(message.progress)
                    ? Math.max(0, Math.min(100, Math.round(message.progress)))
                    : null;
                const percentText = percent === null ? "" : ` (${percent}%)`;
                setWebLLMStatus(
                    `${message.text || "模型加载中"}${percentText}`,
                    false,
                );
                return;
            }

            if (message.type === "WEBLLM_PRELOAD_DONE") {
                setWebLLMStatus("模型已加载完成，可直接用于划词翻译", false);
                setWebLLMButtonsEnabled(true);
                return;
            }

            if (message.type === "WEBLLM_CLEAR_DONE") {
                setWebLLMStatus("模型缓存已清理", false);
                setWebLLMButtonsEnabled(true);
                return;
            }

            if (message.type === "WEBLLM_OP_ERROR") {
                setWebLLMStatus(
                    `操作失败: ${message.error || "未知错误"}`,
                    true,
                );
                setWebLLMButtonsEnabled(true);
                const resolvePending = webllmModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    webllmModelRequestResolvers.delete(message.requestId);
                    resolvePending({
                        modelIds: [],
                        recommendedModelIds: RECOMMENDED_WEBLLM_MODELS,
                    });
                }
                return;
            }

            if (message.type === "WEBLLM_MODELS_RESPONSE") {
                const resolvePending = webllmModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    webllmModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
                return;
            }

            if (message.type === "OLLAMA_OP_ERROR") {
                const resolvePending = ollamaModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    ollamaModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelIds: [] });
                }
                return;
            }

            if (message.type === "OLLAMA_MODELS_RESPONSE") {
                const resolvePending = ollamaModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    ollamaModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
                return;
            }

            if (message.type === "OPENAI_COMPAT_OP_ERROR") {
                const resolvePending = openaiCompatModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    openaiCompatModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelIds: [] });
                }
                return;
            }

            if (message.type === "OPENAI_COMPAT_MODELS_RESPONSE") {
                const resolvePending = openaiCompatModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    openaiCompatModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
                return;
            }

            if (message.type === "CLAUDE_OP_ERROR") {
                const resolvePending = claudeModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    claudeModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelIds: [] });
                }
                return;
            }

            if (message.type === "CLAUDE_MODELS_RESPONSE") {
                const resolvePending = claudeModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    claudeModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
                return;
            }

            if (message.type === "GEMINI_OP_ERROR") {
                const resolvePending = geminiModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    geminiModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelIds: [] });
                }
                return;
            }

            if (message.type === "GEMINI_MODELS_RESPONSE") {
                const resolvePending = geminiModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    geminiModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
                return;
            }

            if (message.type === "SPECIAL_TRANSLATE_OP_ERROR") {
                const resolvePending = specialModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    specialModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelIds: ["translategemma"] });
                }
                return;
            }

            if (message.type === "SPECIAL_TRANSLATE_MODELS_RESPONSE") {
                const resolvePending = specialModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    specialModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
            }
        });

        webllmPort.onDisconnect.addListener(() => {
            webllmPort = null;
            setWebLLMButtonsEnabled(true);
        });

        return webllmPort;
    }

    async function evaluateWebLLMPerformance() {
        const hasWebGPU = !!navigator.gpu;
        const memoryGB = Number(navigator.deviceMemory || 0);
        const cpuCores = Number(navigator.hardwareConcurrency || 0);
        const reasons = [];

        if (!hasWebGPU) {
            reasons.push("当前浏览器不可用 WebGPU");
        }
        if (memoryGB > 0 && memoryGB <= WEBLLM_WEAK_MEMORY_GB) {
            reasons.push(`设备内存约 ${memoryGB}GB`);
        }
        if (cpuCores > 0 && cpuCores <= WEBLLM_WEAK_CPU_CORES) {
            reasons.push(`CPU 逻辑核心数约 ${cpuCores}`);
        }

        return {
            hasWebGPU,
            memoryGB,
            cpuCores,
            isWeak: reasons.length > 0,
            reasons,
        };
    }

    function renderWebLLMPerformance(profile) {
        if (!webllmPerformanceNote) return;

        if (!isWebLLMSupportedBrowser) {
            webllmPerformanceNote.textContent =
                "当前浏览器不支持 WebLLM（仅 Chrome/Edge 可用）";
            webllmPerformanceNote.className = "jyt-perf-note jyt-perf-warning";
            return;
        }

        if (!profile || !profile.isWeak) {
            webllmPerformanceNote.textContent =
                "设备检测通过，可尝试使用本地模型翻译。";
            webllmPerformanceNote.className = "jyt-perf-note jyt-perf-ok";
            return;
        }

        webllmPerformanceNote.textContent =
            "设备性能偏弱，不建议开启 WebLLM: " +
            profile.reasons.join("；") +
            "。";
        webllmPerformanceNote.className = "jyt-perf-note jyt-perf-warning";
    }

    function clampPercent(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return fallback;
        }
        return Math.max(5, Math.min(95, Math.round(n)));
    }

    function normalizeShortcut(value) {
        const raw = (value || "").trim();
        return raw;
    }

    function normalizeKeyName(key) {
        const raw = String(key || "").trim();
        if (!raw) return "";

        const alias = {
            " ": "Space",
            Escape: "Esc",
            ArrowUp: "Up",
            ArrowDown: "Down",
            ArrowLeft: "Left",
            ArrowRight: "Right",
            "+": "Plus",
        };

        if (alias[raw]) {
            return alias[raw];
        }

        if (raw.length === 1) {
            return raw.toUpperCase();
        }

        return raw;
    }

    function formatShortcutFromEvent(e) {
        const keyName = normalizeKeyName(e.key);
        const modifierOnlyKeys = new Set(["Control", "Shift", "Alt", "Meta"]);
        if (!keyName || modifierOnlyKeys.has(e.key)) {
            return "";
        }

        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey) parts.push("Meta");
        parts.push(keyName);
        return parts.join("+");
    }

    function updateEngineDependentUI() {
        if (!openaiSection) return;
        const selectedEngine = els.engine_select.value;
        const llmEngine = els.llm_engine_select?.value || "openai";
        const engine = selectedEngine === "llm" ? llmEngine : selectedEngine;
        const llmEngineSection = document.getElementById("llm_engine_section");
        if (llmEngineSection) {
            llmEngineSection.classList.toggle(
                "jyt-hidden",
                selectedEngine !== "llm",
            );
        }
        const hideOpenAI =
            engine === "browser" ||
            engine === "ollama" ||
            engine === "special_translate" ||
            engine === "custom_openai" ||
            engine === "deepseek" ||
            engine === "qwen" ||
            engine === "glm" ||
            engine === "xiaomi" ||
            engine === "grok" ||
            engine === "claude" ||
            engine === "gemini" ||
            engine === "webllm" ||
            engine === "google" ||
            engine === "bing";
        openaiSection.classList.toggle("jyt-hidden", hideOpenAI);

        if (customOpenAISection) {
            customOpenAISection.classList.toggle(
                "jyt-hidden",
                engine !== "custom_openai",
            );
        }

        if (deepseekSection) {
            deepseekSection.classList.toggle(
                "jyt-hidden",
                engine !== "deepseek",
            );
        }

        if (qwenSection) {
            qwenSection.classList.toggle("jyt-hidden", engine !== "qwen");
        }

        if (glmSection) {
            glmSection.classList.toggle("jyt-hidden", engine !== "glm");
        }

        if (xiaomiSection) {
            xiaomiSection.classList.toggle("jyt-hidden", engine !== "xiaomi");
        }

        if (grokSection) {
            grokSection.classList.toggle("jyt-hidden", engine !== "grok");
        }

        if (claudeSection) {
            claudeSection.classList.toggle("jyt-hidden", engine !== "claude");
        }

        if (geminiSection) {
            geminiSection.classList.toggle("jyt-hidden", engine !== "gemini");
        }

        if (ollamaSection) {
            const showOllama = engine === "ollama";
            ollamaSection.classList.toggle("jyt-hidden", !showOllama);
        }

        if (specialTranslateSection) {
            const showSpecialTranslate = engine === "special_translate";
            specialTranslateSection.classList.toggle(
                "jyt-hidden",
                !showSpecialTranslate,
            );
        }

        if (webllmSection) {
            const showWebLLM = engine === "webllm" && isWebLLMSupportedBrowser;
            webllmSection.classList.toggle("jyt-hidden", !showWebLLM);
        }

        ensureActiveEngineModelListLoaded(engine);
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        if (theme === "auto") {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches;
            root.setAttribute("data-theme", prefersDark ? "dark" : "light");
        } else {
            root.setAttribute("data-theme", theme);
        }
    }

    function isLikelyPdfUrl(url) {
        if (!url || typeof url !== "string") return false;

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
            // keep raw search
        }

        return /\.pdf(?:$|[&#?])/i.test(decodedSearch);
    }

    function extractPdfUrlFromTabUrl(tabUrl) {
        if (!tabUrl || typeof tabUrl !== "string") {
            return "";
        }

        if (isLikelyPdfUrl(tabUrl)) {
            return tabUrl;
        }

        let parsed;
        try {
            parsed = new URL(tabUrl);
        } catch (err) {
            return "";
        }

        const fileParam = parsed.searchParams.get("file");
        if (!fileParam) {
            return "";
        }

        let decoded = fileParam;
        try {
            decoded = decodeURIComponent(fileParam);
        } catch (err) {
            // keep raw value
        }

        return isLikelyPdfUrl(decoded) ? decoded : "";
    }

    function getDisplayNameFromPdfUrl(pdfUrl) {
        if (!pdfUrl) return "";
        try {
            const parsed = new URL(pdfUrl);
            const fromPath = (parsed.pathname || "").split("/").pop() || "";
            if (fromPath) return decodeURIComponent(fromPath);
        } catch (err) {
            // ignore
        }
        return pdfUrl;
    }

    function setOpenButtonLabel(label) {
        if (!openLocalPdfBtn) return;
        openLocalPdfBtn.textContent = label;
    }

    function updateCurrentPdfStatusUI(activeTab, currentPdfUrl) {
        if (!currentPdfStatusEl) return;

        if (currentPdfUrl) {
            const fileName = getDisplayNameFromPdfUrl(currentPdfUrl);
            const isFilePdf = currentPdfUrl.startsWith("file://");

            if (isFirefoxRuntime && isFilePdf) {
                setOpenButtonLabel("选择本地 PDF（Firefox）");
                currentPdfStatusEl.textContent = `已检测到当前 PDF：${fileName}。Firefox 无法让扩展直接读取 file://，点击后会打开文件选择器，请选择该文件。`;
                return;
            }

            setOpenButtonLabel("用 LLM 翻译器打开当前 PDF");
            currentPdfStatusEl.textContent = `已检测到当前 PDF：${fileName}`;
            return;
        }

        setOpenButtonLabel("打开本地 PDF（Firefox 兼容）");
        if (activeTab?.url) {
            currentPdfStatusEl.textContent =
                "当前标签页未检测到 PDF 链接。点击后将进入内置 PDF.js 页面并弹出文件选择器。";
        } else {
            currentPdfStatusEl.textContent =
                "未获取到当前标签页信息。点击后将进入内置 PDF.js 页面并弹出文件选择器。";
        }
    }

    function getCurrentActiveTab() {
        return new Promise((resolve) => {
            try {
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        resolve(
                            Array.isArray(tabs) && tabs[0] ? tabs[0] : null,
                        );
                    },
                );
            } catch (err) {
                resolve(null);
            }
        });
    }

    async function refreshActivePdfContext() {
        const activeTab = await getCurrentActiveTab();
        cachedActiveTab = activeTab;
        const activeTabUrl =
            activeTab && typeof activeTab.url === "string" ? activeTab.url : "";
        cachedCurrentPdfUrl = extractPdfUrlFromTabUrl(activeTabUrl);
        updateCurrentPdfStatusUI(activeTab, cachedCurrentPdfUrl);
    }

    function load() {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (syncItems) => {
            const syncErr = chrome.runtime.lastError;
            if (syncErr) {
                showToast(`读取同步配置失败: ${syncErr.message}`, true);
                return;
            }

            chrome.storage.local.get(API_KEY_FIELDS, (localItems) => {
                const localErr = chrome.runtime.lastError;
                const migrateKeys = collectMissingLocalApiKeys(
                    syncItems,
                    localErr ? null : localItems,
                );
                const mergedLocalItems = {
                    ...(localErr ? {} : localItems || {}),
                    ...migrateKeys,
                };
                const items = {
                    ...DEFAULT_SETTINGS,
                    ...(syncItems || {}),
                    ...mergedLocalItems,
                };

                if (localErr) {
                    showToast(`读取本地密钥失败: ${localErr.message}`, true);
                } else if (Object.keys(migrateKeys).length > 0) {
                    chrome.storage.local.set(migrateKeys, () => {
                        const migrateErr = chrome.runtime.lastError;
                        if (migrateErr) {
                            showToast(
                                `迁移本地密钥失败: ${migrateErr.message}`,
                                true,
                            );
                        }
                    });
                }

                const savedEngine = String(items.engine || "auto").trim();
                const savedLLMEngine = String(items.llm_engine || "").trim();
                const migratedLLMEngine = LLM_ENGINES.has(savedEngine)
                    ? savedEngine
                    : "";
                const llmEngine = LLM_ENGINES.has(savedLLMEngine)
                    ? savedLLMEngine
                    : migratedLLMEngine || "openai";
                const uiEngine = LLM_ENGINES.has(savedEngine)
                    ? "llm"
                    : savedEngine || "auto";

                els.enable_select.value = items.enabled;
                els.engine_select.value = uiEngine;
                if (els.llm_engine_select) {
                    els.llm_engine_select.value = llmEngine;
                }
                els.translate_shortcut.value = normalizeShortcut(
                    items.translate_shortcut,
                );
                els.source_lang.value = items.source_lang || "auto";
                els.target_lang.value = items.target_lang || "auto";
                els.openai_api_url.value = items.openai_api_url;
                els.openai_api_key.value = items.openai_api_key;
                const legacyThinkingModel = String(
                    items.openai_thinking_model || "",
                ).trim();
                const unifiedOpenAIModel = String(
                    items.openai_model || "",
                ).trim();
                const savedOpenAIModel =
                    unifiedOpenAIModel || legacyThinkingModel || "gpt-4o-mini";
                els.openai_custom_model.value = items.openai_custom_model || "";
                els.openai_custom_prompt.value =
                    items.openai_custom_prompt || "";
                els.show_thoughts.value = items.show_thoughts
                    ? "true"
                    : "false";
                els.openai_reasoning_effort.value =
                    items.openai_reasoning_effort || "medium";
                els.openai_max_completion_tokens.value = Number.isFinite(
                    Number(items.openai_max_completion_tokens),
                )
                    ? String(
                          Math.floor(
                              Number(items.openai_max_completion_tokens),
                          ),
                      )
                    : "0";
                els.custom_openai_api_url.value =
                    items.custom_openai_api_url ||
                    "https://api.openai.com/v1/chat/completions";
                els.custom_openai_api_key.value =
                    items.custom_openai_api_key || "";
                const savedCustomOpenAIModel =
                    items.custom_openai_model || "gpt-4o-mini";
                els.custom_openai_custom_model.value =
                    items.custom_openai_custom_model || "";
                els.custom_openai_custom_prompt.value =
                    items.custom_openai_custom_prompt || "";
                els.custom_openai_show_thoughts.value =
                    items.custom_openai_show_thoughts ? "true" : "false";
                els.custom_openai_reasoning_effort.value =
                    items.custom_openai_reasoning_effort || "medium";
                els.custom_openai_max_completion_tokens.value = Number.isFinite(
                    Number(items.custom_openai_max_completion_tokens),
                )
                    ? String(
                          Math.floor(
                              Number(items.custom_openai_max_completion_tokens),
                          ),
                      )
                    : "0";
                els.deepseek_api_url.value =
                    items.deepseek_api_url ||
                    "https://api.deepseek.com/chat/completions";
                els.deepseek_api_key.value = items.deepseek_api_key || "";
                const savedDeepSeekModel =
                    items.deepseek_model || "deepseek-chat";
                els.deepseek_custom_model.value =
                    items.deepseek_custom_model || "";
                els.deepseek_custom_prompt.value =
                    items.deepseek_custom_prompt || "";
                els.deepseek_show_thoughts.value = items.deepseek_show_thoughts
                    ? "true"
                    : "false";
                els.qwen_api_url.value =
                    items.qwen_api_url ||
                    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
                els.qwen_api_key.value = items.qwen_api_key || "";
                const savedQwenModel = items.qwen_model || "qwen-plus";
                els.qwen_custom_model.value = items.qwen_custom_model || "";
                els.qwen_custom_prompt.value = items.qwen_custom_prompt || "";
                els.qwen_show_thoughts.value = items.qwen_show_thoughts
                    ? "true"
                    : "false";
                els.qwen_thinking_budget.value = Number.isFinite(
                    Number(items.qwen_thinking_budget),
                )
                    ? String(Math.floor(Number(items.qwen_thinking_budget)))
                    : "0";
                els.qwen_preserve_thinking.value = items.qwen_preserve_thinking
                    ? "true"
                    : "false";
                els.glm_api_url.value =
                    items.glm_api_url ||
                    "https://open.bigmodel.cn/api/paas/v4/chat/completions";
                els.glm_api_key.value = items.glm_api_key || "";
                const savedGLMModel = items.glm_model || "glm-5.1";
                els.glm_custom_model.value = items.glm_custom_model || "";
                els.glm_custom_prompt.value = items.glm_custom_prompt || "";
                els.glm_show_thoughts.value = items.glm_show_thoughts
                    ? "true"
                    : "false";
                els.glm_clear_thinking.value =
                    items.glm_clear_thinking === false ? "false" : "true";
                els.xiaomi_api_url.value =
                    items.xiaomi_api_url ||
                    "https://api.xiaomimimo.com/v1/chat/completions";
                els.xiaomi_api_key.value = items.xiaomi_api_key || "";
                const savedXiaomiModel = items.xiaomi_model || "mimo-v2-pro";
                els.xiaomi_custom_model.value = items.xiaomi_custom_model || "";
                els.xiaomi_custom_prompt.value =
                    items.xiaomi_custom_prompt || "";
                els.xiaomi_show_thoughts.value = items.xiaomi_show_thoughts
                    ? "true"
                    : "false";
                els.xiaomi_max_completion_tokens.value = Number.isFinite(
                    Number(items.xiaomi_max_completion_tokens),
                )
                    ? String(
                          Math.floor(
                              Number(items.xiaomi_max_completion_tokens),
                          ),
                      )
                    : "0";
                els.grok_api_url.value =
                    items.grok_api_url ||
                    "https://api.x.ai/v1/chat/completions";
                els.grok_api_key.value = items.grok_api_key || "";
                const savedGrokModel = items.grok_model || "grok-3-latest";
                els.grok_custom_model.value = items.grok_custom_model || "";
                els.grok_custom_prompt.value = items.grok_custom_prompt || "";
                els.grok_show_thoughts.value = items.grok_show_thoughts
                    ? "true"
                    : "false";
                const openaiCompatSavedModelMap = {
                    openai: savedOpenAIModel,
                    custom_openai: savedCustomOpenAIModel,
                    deepseek: savedDeepSeekModel,
                    qwen: savedQwenModel,
                    glm: savedGLMModel,
                    xiaomi: savedXiaomiModel,
                    grok: savedGrokModel,
                };
                OPENAI_COMPAT_MODEL_ENGINES.forEach((cfg) => {
                    const selectEl = els[cfg.modelId];
                    const customEl = els[cfg.customModelId];
                    const savedModel =
                        openaiCompatSavedModelMap[cfg.name] || cfg.defaultModel;

                    populateOpenAICompatModelSelect(
                        selectEl,
                        customEl,
                        [],
                        savedModel,
                    );
                    modelListLoaded.delete(cfg.name);
                });
                els.claude_api_url.value =
                    items.claude_api_url ||
                    "https://api.anthropic.com/v1/messages";
                els.claude_api_key.value = items.claude_api_key || "";
                const savedClaudeModel =
                    items.claude_model || "claude-sonnet-4-6";
                els.claude_custom_model.value = items.claude_custom_model || "";
                els.claude_custom_prompt.value =
                    items.claude_custom_prompt || "";
                els.claude_show_thoughts.value = items.claude_show_thoughts
                    ? "true"
                    : "false";
                els.claude_max_tokens.value = Number.isFinite(
                    Number(items.claude_max_tokens),
                )
                    ? String(Math.floor(Number(items.claude_max_tokens)))
                    : "4096";
                els.claude_thinking_mode.value =
                    items.claude_thinking_mode || "adaptive";
                els.claude_thinking_budget.value = Number.isFinite(
                    Number(items.claude_thinking_budget),
                )
                    ? String(Math.floor(Number(items.claude_thinking_budget)))
                    : "2048";
                els.claude_thinking_effort.value =
                    items.claude_thinking_effort || "medium";
                populateOpenAICompatModelSelect(
                    els.claude_model,
                    els.claude_custom_model,
                    [],
                    savedClaudeModel,
                );
                modelListLoaded.delete("claude");
                els.gemini_api_url.value =
                    items.gemini_api_url ||
                    "https://generativelanguage.googleapis.com/v1beta/models";
                els.gemini_api_key.value = items.gemini_api_key || "";
                const savedGeminiModel =
                    items.gemini_model || "gemini-2.5-flash";
                els.gemini_custom_model.value = items.gemini_custom_model || "";
                els.gemini_custom_prompt.value =
                    items.gemini_custom_prompt || "";
                els.gemini_show_thoughts.value = items.gemini_show_thoughts
                    ? "true"
                    : "false";
                els.gemini_thinking_level.value =
                    items.gemini_thinking_level || "high";
                els.gemini_thinking_budget.value = Number.isFinite(
                    Number(items.gemini_thinking_budget),
                )
                    ? String(Math.floor(Number(items.gemini_thinking_budget)))
                    : "-1";
                populateOpenAICompatModelSelect(
                    els.gemini_model,
                    els.gemini_custom_model,
                    [],
                    savedGeminiModel,
                );
                modelListLoaded.delete("gemini");
                const savedOllamaModel = items.ollama_model || "";
                els.ollama_api_url.value =
                    items.ollama_api_url || "http://localhost:11434/api/chat";
                els.ollama_custom_model.value = items.ollama_custom_model || "";
                els.ollama_custom_prompt.value =
                    items.ollama_custom_prompt || "";
                els.ollama_show_thoughts.value = items.ollama_show_thoughts
                    ? "true"
                    : "false";
                populateOllamaModelSelect([], savedOllamaModel);
                modelListLoaded.delete("ollama");
                const specialProvider = normalizeSpecialProvider(
                    items.special_translate_provider || SPECIAL_PROVIDER_OLLAMA,
                );
                const savedSpecialModel =
                    items.special_translate_model || "translategemma";
                els.special_translate_provider.value = specialProvider;
                els.special_translate_api_url.value =
                    items.special_translate_api_url ||
                    getSpecialApiDefaultByProvider(specialProvider);
                els.special_translate_api_key.value =
                    items.special_translate_api_key || "";
                els.special_translate_custom_model.value =
                    items.special_translate_custom_model || "";
                els.special_translate_custom_prompt.value =
                    items.special_translate_custom_prompt || "";
                els.special_translate_show_thoughts.value =
                    items.special_translate_show_thoughts ? "true" : "false";
                populateSpecialTranslateModelSelect(
                    RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                    savedSpecialModel,
                );
                modelListLoaded.delete("special_translate");
                const savedModel =
                    items.webllm_model || "Qwen3-0.6B-q4f16_1-MLC";
                els.webllm_custom_model.value = items.webllm_custom_model || "";
                els.webllm_custom_prompt.value =
                    items.webllm_custom_prompt || "";
                els.webllm_show_thoughts.value = items.webllm_show_thoughts
                    ? "true"
                    : "false";
                els.webllm_model_mirror.value =
                    items.webllm_model_mirror || "official";
                els.webllm_custom_mirror.value =
                    items.webllm_custom_mirror || "";
                els.webllm_custom_mirror.disabled =
                    els.webllm_model_mirror.value !== "custom";
                populateWebLLMModelSelect(
                    RECOMMENDED_WEBLLM_MODELS,
                    savedModel,
                );
                modelListLoaded.delete("webllm");
                els.theme_mode.value = items.theme_mode || "auto";
                els.font_family.value = items.font_family || "";
                els.bubble_width_percent.value = clampPercent(
                    items.bubble_width_percent,
                    20,
                );
                els.bubble_height_percent.value = clampPercent(
                    items.bubble_height_percent,
                    40,
                );
                updateEngineDependentUI();
                applyTheme(items.theme_mode || "auto");
            });
        });
    }

    document.getElementById("save").addEventListener("click", async () => {
        const selectedEngine = els.engine_select.value;
        const selectedLlmEngine =
            (els.llm_engine_select?.value || "openai").trim() || "openai";
        const effectiveEngine =
            selectedEngine === "llm" ? selectedLlmEngine : selectedEngine;
        const selectedOpenAIModel = getSelectedOpenAICompatModel(
            els.openai_model,
            els.openai_custom_model,
        );
        const selectedCustomOpenAIModel = getSelectedOpenAICompatModel(
            els.custom_openai_model,
            els.custom_openai_custom_model,
        );
        const selectedDeepSeekModel = getSelectedOpenAICompatModel(
            els.deepseek_model,
            els.deepseek_custom_model,
        );
        const selectedQwenModel = getSelectedOpenAICompatModel(
            els.qwen_model,
            els.qwen_custom_model,
        );
        const selectedGLMModel = getSelectedOpenAICompatModel(
            els.glm_model,
            els.glm_custom_model,
        );
        const selectedXiaomiModel = getSelectedOpenAICompatModel(
            els.xiaomi_model,
            els.xiaomi_custom_model,
        );
        const selectedGrokModel = getSelectedOpenAICompatModel(
            els.grok_model,
            els.grok_custom_model,
        );
        const selectedClaudeModel = getSelectedOpenAICompatModel(
            els.claude_model,
            els.claude_custom_model,
        );
        const selectedGeminiModel = getSelectedOpenAICompatModel(
            els.gemini_model,
            els.gemini_custom_model,
        );
        const data = {
            enabled: els.enable_select.value,
            engine: selectedEngine,
            llm_engine: selectedLlmEngine,
            translate_shortcut: normalizeShortcut(els.translate_shortcut.value),
            source_lang: els.source_lang.value,
            target_lang: els.target_lang.value,
            openai_api_url: els.openai_api_url.value,
            openai_api_key: els.openai_api_key.value,
            openai_model: selectedOpenAIModel,
            openai_custom_model: (els.openai_custom_model.value || "").trim(),
            openai_custom_prompt: els.openai_custom_prompt.value || "",
            show_thoughts: els.show_thoughts.value === "true",
            openai_reasoning_effort: els.openai_reasoning_effort.value,
            openai_max_completion_tokens: Number(
                els.openai_max_completion_tokens.value || 0,
            ),
            custom_openai_api_url: (
                els.custom_openai_api_url.value || ""
            ).trim(),
            custom_openai_api_key: els.custom_openai_api_key.value,
            custom_openai_model: selectedCustomOpenAIModel,
            custom_openai_custom_model: (
                els.custom_openai_custom_model.value || ""
            ).trim(),
            custom_openai_custom_prompt:
                els.custom_openai_custom_prompt.value || "",
            custom_openai_show_thoughts:
                els.custom_openai_show_thoughts.value === "true",
            custom_openai_reasoning_effort:
                els.custom_openai_reasoning_effort.value,
            custom_openai_max_completion_tokens: Number(
                els.custom_openai_max_completion_tokens.value || 0,
            ),
            deepseek_api_url: (els.deepseek_api_url.value || "").trim(),
            deepseek_api_key: els.deepseek_api_key.value,
            deepseek_model: selectedDeepSeekModel,
            deepseek_custom_model: (
                els.deepseek_custom_model.value || ""
            ).trim(),
            deepseek_custom_prompt: els.deepseek_custom_prompt.value || "",
            deepseek_show_thoughts: els.deepseek_show_thoughts.value === "true",
            qwen_api_url: (els.qwen_api_url.value || "").trim(),
            qwen_api_key: els.qwen_api_key.value,
            qwen_model: selectedQwenModel,
            qwen_custom_model: (els.qwen_custom_model.value || "").trim(),
            qwen_custom_prompt: els.qwen_custom_prompt.value || "",
            qwen_show_thoughts: els.qwen_show_thoughts.value === "true",
            qwen_thinking_budget: Number(els.qwen_thinking_budget.value || 0),
            qwen_preserve_thinking: els.qwen_preserve_thinking.value === "true",
            glm_api_url: (els.glm_api_url.value || "").trim(),
            glm_api_key: els.glm_api_key.value,
            glm_model: selectedGLMModel,
            glm_custom_model: (els.glm_custom_model.value || "").trim(),
            glm_custom_prompt: els.glm_custom_prompt.value || "",
            glm_show_thoughts: els.glm_show_thoughts.value === "true",
            glm_clear_thinking: els.glm_clear_thinking.value === "true",
            xiaomi_api_url: (els.xiaomi_api_url.value || "").trim(),
            xiaomi_api_key: els.xiaomi_api_key.value,
            xiaomi_model: selectedXiaomiModel,
            xiaomi_custom_model: (els.xiaomi_custom_model.value || "").trim(),
            xiaomi_custom_prompt: els.xiaomi_custom_prompt.value || "",
            xiaomi_show_thoughts: els.xiaomi_show_thoughts.value === "true",
            xiaomi_max_completion_tokens: Number(
                els.xiaomi_max_completion_tokens.value || 0,
            ),
            grok_api_url: (els.grok_api_url.value || "").trim(),
            grok_api_key: els.grok_api_key.value,
            grok_model: selectedGrokModel,
            grok_custom_model: (els.grok_custom_model.value || "").trim(),
            grok_custom_prompt: els.grok_custom_prompt.value || "",
            grok_show_thoughts: els.grok_show_thoughts.value === "true",
            claude_api_url: (els.claude_api_url.value || "").trim(),
            claude_api_key: els.claude_api_key.value,
            claude_model: selectedClaudeModel,
            claude_custom_model: (els.claude_custom_model.value || "").trim(),
            claude_custom_prompt: els.claude_custom_prompt.value || "",
            claude_show_thoughts: els.claude_show_thoughts.value === "true",
            claude_max_tokens: Number(els.claude_max_tokens.value || 4096),
            claude_thinking_mode: els.claude_thinking_mode.value,
            claude_thinking_budget: Number(
                els.claude_thinking_budget.value || 2048,
            ),
            claude_thinking_effort: els.claude_thinking_effort.value,
            gemini_api_url: (els.gemini_api_url.value || "").trim(),
            gemini_api_key: els.gemini_api_key.value,
            gemini_model: selectedGeminiModel,
            gemini_custom_model: (els.gemini_custom_model.value || "").trim(),
            gemini_custom_prompt: els.gemini_custom_prompt.value || "",
            gemini_show_thoughts: els.gemini_show_thoughts.value === "true",
            gemini_thinking_level: els.gemini_thinking_level.value,
            gemini_thinking_budget: Number(
                els.gemini_thinking_budget.value || -1,
            ),
            ollama_api_url: (els.ollama_api_url.value || "").trim(),
            ollama_model: els.ollama_model_select.value,
            ollama_custom_model: (els.ollama_custom_model.value || "").trim(),
            ollama_custom_prompt: els.ollama_custom_prompt.value || "",
            ollama_show_thoughts: els.ollama_show_thoughts.value === "true",
            special_translate_provider: normalizeSpecialProvider(
                els.special_translate_provider.value,
            ),
            special_translate_api_url: (
                els.special_translate_api_url.value || ""
            ).trim(),
            special_translate_api_key: els.special_translate_api_key.value,
            special_translate_model: els.special_translate_model_select.value,
            special_translate_custom_model: (
                els.special_translate_custom_model.value || ""
            ).trim(),
            special_translate_custom_prompt:
                els.special_translate_custom_prompt.value || "",
            special_translate_show_thoughts:
                els.special_translate_show_thoughts.value === "true",
            webllm_model: els.webllm_model_select.value,
            webllm_custom_model: (els.webllm_custom_model.value || "").trim(),
            webllm_custom_prompt: els.webllm_custom_prompt.value || "",
            webllm_show_thoughts: els.webllm_show_thoughts.value === "true",
            webllm_model_mirror: els.webllm_model_mirror.value,
            webllm_custom_mirror: (els.webllm_custom_mirror.value || "").trim(),
            theme_mode: els.theme_mode.value,
            font_family: els.font_family.value,
            bubble_width_percent: clampPercent(
                els.bubble_width_percent.value,
                20,
            ),
            bubble_height_percent: clampPercent(
                els.bubble_height_percent.value,
                40,
            ),
            config_updated_at: Date.now(),
        };
        if (effectiveEngine === "webllm" && !isWebLLMSupportedBrowser) {
            showToast("当前浏览器不支持 WebLLM，请切换到 Chrome/Edge。");
            return;
        }

        if (effectiveEngine === "custom_openai") {
            if (!data.custom_openai_api_key) {
                showToast("请先填写自定义 OpenAI 兼容 API Key。", true);
                return;
            }
            if (!data.custom_openai_model) {
                showToast("请先填写自定义 OpenAI 兼容模型。", true);
                return;
            }
            if (!data.custom_openai_api_url) {
                data.custom_openai_api_url =
                    "https://api.openai.com/v1/chat/completions";
            }
        }

        if (effectiveEngine === "deepseek") {
            if (!data.deepseek_api_key) {
                showToast("请先填写 DeepSeek API Key。", true);
                return;
            }
            if (!data.deepseek_model) {
                showToast("请先填写 DeepSeek 模型。", true);
                return;
            }
            if (!data.deepseek_api_url) {
                data.deepseek_api_url =
                    "https://api.deepseek.com/chat/completions";
            }
        }

        if (effectiveEngine === "qwen") {
            if (!data.qwen_api_key) {
                showToast("请先填写 Qwen API Key。", true);
                return;
            }
            if (!data.qwen_model) {
                showToast("请先填写 Qwen 模型。", true);
                return;
            }
            if (!data.qwen_api_url) {
                data.qwen_api_url =
                    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
            }
        }

        if (effectiveEngine === "glm") {
            if (!data.glm_api_key) {
                showToast("请先填写 GLM API Key。", true);
                return;
            }
            if (!data.glm_model) {
                showToast("请先填写 GLM 模型。", true);
                return;
            }
            if (!data.glm_api_url) {
                data.glm_api_url =
                    "https://open.bigmodel.cn/api/paas/v4/chat/completions";
            }
        }

        if (effectiveEngine === "xiaomi") {
            if (!data.xiaomi_api_key) {
                showToast("请先填写 Xiaomi API Key。", true);
                return;
            }
            if (!data.xiaomi_model) {
                showToast("请先填写 Xiaomi 模型。", true);
                return;
            }
            if (!data.xiaomi_api_url) {
                data.xiaomi_api_url =
                    "https://api.xiaomimimo.com/v1/chat/completions";
            }
        }

        if (effectiveEngine === "grok") {
            if (!data.grok_api_key) {
                showToast("请先填写 Grok API Key。", true);
                return;
            }
            if (!data.grok_model) {
                showToast("请先填写 Grok 模型。", true);
                return;
            }
            if (!data.grok_api_url) {
                data.grok_api_url = "https://api.x.ai/v1/chat/completions";
            }
        }

        if (effectiveEngine === "claude") {
            if (!data.claude_api_key) {
                showToast("请先填写 Claude API Key。", true);
                return;
            }
            if (!data.claude_model) {
                showToast("请先填写 Claude 模型。", true);
                return;
            }
            if (!data.claude_api_url) {
                data.claude_api_url = "https://api.anthropic.com/v1/messages";
            }
        }

        if (effectiveEngine === "gemini") {
            if (!data.gemini_api_key) {
                showToast("请先填写 Gemini API Key。", true);
                return;
            }
            if (!data.gemini_model) {
                showToast("请先填写 Gemini 模型。", true);
                return;
            }
            if (!data.gemini_api_url) {
                data.gemini_api_url =
                    "https://generativelanguage.googleapis.com/v1beta/models";
            }
        }

        if (effectiveEngine === "ollama") {
            if (!data.ollama_api_url) {
                data.ollama_api_url = "http://localhost:11434/api/chat";
            }
            const selectedOllamaModel =
                data.ollama_model === "custom"
                    ? data.ollama_custom_model
                    : data.ollama_model;
            if (!selectedOllamaModel) {
                showToast("请先选择 Ollama 模型或填写自定义模型名。", true);
                return;
            }
        }

        if (effectiveEngine === "special_translate") {
            data.special_translate_provider = normalizeSpecialProvider(
                data.special_translate_provider,
            );
            if (!data.special_translate_api_url) {
                data.special_translate_api_url = getSpecialApiDefaultByProvider(
                    data.special_translate_provider,
                );
            }

            const selectedSpecialModel =
                data.special_translate_model === "custom"
                    ? data.special_translate_custom_model
                    : data.special_translate_model;

            if (!selectedSpecialModel) {
                showToast("请先选择专用翻译模型或填写自定义模型名。", true);
                return;
            }
        }

        if (
            effectiveEngine === "webllm" &&
            webllmPerfProfile &&
            webllmPerfProfile.isWeak
        ) {
            const ok = window.confirm(
                "设备性能偏弱，继续启用 WebLLM 可能导致卡顿或加载失败，确定继续吗？",
            );
            if (!ok) {
                return;
            }
        }

        const permissionUrls = Object.entries(data)
            .filter(([key, value]) => key.endsWith("_api_url") && value)
            .map(([, value]) => value);
        if (data.webllm_custom_mirror) {
            permissionUrls.push(data.webllm_custom_mirror);
        }
        const granted =
            await syncDataController.requestOptionalHostPermissions(
                permissionUrls,
            );
        if (!granted) {
            showToast(
                "未授予部分自定义接口访问权限，若服务端不支持 CORS，翻译可能失败。",
                true,
            );
        }

        const localApiKeys = extractApiKeyPayload(data);
        const syncData = stripApiKeyPayload(data);

        chrome.storage.local.set(localApiKeys, () => {
            const localErr = chrome.runtime.lastError;
            if (localErr) {
                showToast(`保存失败: ${localErr.message}`, true);
                return;
            }

            chrome.storage.sync.set(syncData, () => {
                const syncErr = chrome.runtime.lastError;
                if (syncErr) {
                    showToast(`保存失败: ${syncErr.message}`, true);
                    return;
                }
                applyTheme(syncData.theme_mode);
                showToast("已保存");
            });
        });
    });

    document.getElementById("reset").addEventListener("click", () => {
        chrome.storage.sync.clear(() => {
            const syncErr = chrome.runtime.lastError;
            if (syncErr) {
                showToast(`恢复失败: ${syncErr.message}`, true);
                return;
            }

            chrome.storage.local.remove(API_KEY_FIELDS, () => {
                const localErr = chrome.runtime.lastError;
                if (localErr) {
                    showToast(`恢复失败: ${localErr.message}`, true);
                    return;
                }

                load();
                showToast("已恢复默认");
            });
        });
    });

    els.translate_shortcut.addEventListener("keydown", (e) => {
        const allowClear = e.key === "Backspace" || e.key === "Delete";
        if (allowClear) {
            e.preventDefault();
            els.translate_shortcut.value = "";
            return;
        }

        e.preventDefault();
        const shortcut = formatShortcutFromEvent(e);
        if (shortcut) {
            els.translate_shortcut.value = shortcut;
        }
    });

    els.translate_shortcut.addEventListener("blur", () => {
        els.translate_shortcut.value = normalizeShortcut(
            els.translate_shortcut.value,
        );
    });

    els.engine_select.addEventListener("change", updateEngineDependentUI);
    els.llm_engine_select?.addEventListener("change", updateEngineDependentUI);

    els.theme_mode.addEventListener("change", () => {
        applyTheme(els.theme_mode.value);
    });

    els.webllm_model_select?.addEventListener("change", () => {
        const isCustom = els.webllm_model_select.value === "custom";
        els.webllm_custom_model.disabled = !isCustom;
    });

    els.ollama_model_select?.addEventListener("change", () => {
        const isCustom = els.ollama_model_select.value === "custom";
        els.ollama_custom_model.disabled = !isCustom;
    });

    els.special_translate_model_select?.addEventListener("change", () => {
        const isCustom = els.special_translate_model_select.value === "custom";
        els.special_translate_custom_model.disabled = !isCustom;
    });

    function refreshOpenAICompatModels(cfg, force) {
        const selectEl = els[cfg.modelId];
        const customEl = els[cfg.customModelId];
        if (!selectEl || !customEl) {
            return Promise.resolve();
        }

        if (!force && modelListLoaded.has(cfg.name)) {
            return Promise.resolve();
        }

        const selectedModel = getSelectedOpenAICompatModel(selectEl, customEl);
        return requestOpenAICompatModelList(
            els[cfg.apiUrlId]?.value,
            els[cfg.apiKeyId]?.value,
        )
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : [];
                populateOpenAICompatModelSelect(
                    selectEl,
                    customEl,
                    modelIds,
                    selectedModel,
                );
                modelListLoaded.add(cfg.name);
            })
            .catch(() => {
                populateOpenAICompatModelSelect(
                    selectEl,
                    customEl,
                    [],
                    selectedModel,
                );
                modelListLoaded.delete(cfg.name);
            });
    }

    function refreshClaudeModels(force) {
        if (!force && modelListLoaded.has("claude")) {
            return Promise.resolve();
        }
        const selectedModel = getSelectedOpenAICompatModel(
            els.claude_model,
            els.claude_custom_model,
        );
        return requestClaudeModelList(
            els.claude_api_url.value,
            els.claude_api_key.value,
        )
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : [];
                populateOpenAICompatModelSelect(
                    els.claude_model,
                    els.claude_custom_model,
                    modelIds,
                    selectedModel,
                );
                modelListLoaded.add("claude");
            })
            .catch(() => {
                populateOpenAICompatModelSelect(
                    els.claude_model,
                    els.claude_custom_model,
                    [],
                    selectedModel,
                );
                modelListLoaded.delete("claude");
            });
    }

    function refreshGeminiModels(force) {
        if (!force && modelListLoaded.has("gemini")) {
            return Promise.resolve();
        }
        const selectedModel = getSelectedOpenAICompatModel(
            els.gemini_model,
            els.gemini_custom_model,
        );
        return requestGeminiModelList(
            els.gemini_api_url.value,
            els.gemini_api_key.value,
        )
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : [];
                populateOpenAICompatModelSelect(
                    els.gemini_model,
                    els.gemini_custom_model,
                    modelIds,
                    selectedModel,
                );
                modelListLoaded.add("gemini");
            })
            .catch(() => {
                populateOpenAICompatModelSelect(
                    els.gemini_model,
                    els.gemini_custom_model,
                    [],
                    selectedModel,
                );
                modelListLoaded.delete("gemini");
            });
    }

    function refreshSpecialTranslateModels(force) {
        if (!force && modelListLoaded.has("special_translate")) {
            return Promise.resolve();
        }
        const selectedModel =
            (els.special_translate_model_select?.value || "").trim() ||
            "translategemma";
        return requestSpecialTranslateModelList(
            els.special_translate_provider?.value,
            els.special_translate_api_url?.value,
            els.special_translate_api_key?.value,
        )
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : RECOMMENDED_SPECIAL_TRANSLATE_MODELS;
                populateSpecialTranslateModelSelect(modelIds, selectedModel);
                modelListLoaded.add("special_translate");
            })
            .catch(() => {
                populateSpecialTranslateModelSelect(
                    RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                    selectedModel,
                );
                modelListLoaded.delete("special_translate");
            });
    }

    function refreshOllamaModels(force) {
        if (!force && modelListLoaded.has("ollama")) {
            return Promise.resolve();
        }
        const selectedModel = (els.ollama_model_select?.value || "").trim();
        return requestOllamaModelList(els.ollama_api_url.value)
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : [];
                populateOllamaModelSelect(modelIds, selectedModel);
                modelListLoaded.add("ollama");
            })
            .catch(() => {
                populateOllamaModelSelect([], selectedModel);
                modelListLoaded.delete("ollama");
            });
    }

    function refreshWebLLMModels(force) {
        if (!isWebLLMSupportedBrowser) {
            return Promise.resolve();
        }
        if (!force && modelListLoaded.has("webllm")) {
            return Promise.resolve();
        }
        const selectedModel = getSelectedWebLLMModelId();
        return requestWebLLMModelList()
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : [];
                if (modelIds.length > 0) {
                    populateWebLLMModelSelect(modelIds, selectedModel);
                }
                modelListLoaded.add("webllm");
            })
            .catch(() => {
                modelListLoaded.delete("webllm");
            });
    }

    function ensureActiveEngineModelListLoaded(engine) {
        const activeEngine = String(
            engine || getCurrentEffectiveEngine() || "auto",
        );

        if (OPENAI_COMPAT_ENGINE_BY_NAME[activeEngine]) {
            void refreshOpenAICompatModels(
                OPENAI_COMPAT_ENGINE_BY_NAME[activeEngine],
                false,
            );
            return;
        }

        if (activeEngine === "auto") {
            void refreshOpenAICompatModels(
                OPENAI_COMPAT_ENGINE_BY_NAME.openai,
                false,
            );
            return;
        }

        if (activeEngine === "claude") {
            void refreshClaudeModels(false);
            return;
        }

        if (activeEngine === "gemini") {
            void refreshGeminiModels(false);
            return;
        }

        if (activeEngine === "ollama") {
            void refreshOllamaModels(false);
            return;
        }

        if (activeEngine === "special_translate") {
            void refreshSpecialTranslateModels(false);
            return;
        }

        if (activeEngine === "webllm") {
            void refreshWebLLMModels(false);
        }
    }

    OPENAI_COMPAT_MODEL_ENGINES.forEach((cfg) => {
        els[cfg.modelId]?.addEventListener("change", () => {
            const isCustom = (els[cfg.modelId]?.value || "") === "custom";
            if (els[cfg.customModelId]) {
                els[cfg.customModelId].disabled = !isCustom;
            }
        });

        els[cfg.apiUrlId]?.addEventListener("change", () => {
            modelListLoaded.delete(cfg.name);
            debounceByKey(`model-${cfg.name}`, () => {
                void refreshOpenAICompatModels(cfg, true);
            });
        });

        els[cfg.apiKeyId]?.addEventListener("change", () => {
            modelListLoaded.delete(cfg.name);
            debounceByKey(`model-${cfg.name}`, () => {
                void refreshOpenAICompatModels(cfg, true);
            });
        });
    });

    els.claude_model?.addEventListener("change", () => {
        const isCustom = els.claude_model.value === "custom";
        els.claude_custom_model.disabled = !isCustom;
    });

    els.gemini_model?.addEventListener("change", () => {
        const isCustom = els.gemini_model.value === "custom";
        els.gemini_custom_model.disabled = !isCustom;
    });

    els.claude_api_url?.addEventListener("change", () => {
        modelListLoaded.delete("claude");
        debounceByKey("model-claude", () => {
            void refreshClaudeModels(true);
        });
    });

    els.claude_api_key?.addEventListener("change", () => {
        modelListLoaded.delete("claude");
        debounceByKey("model-claude", () => {
            void refreshClaudeModels(true);
        });
    });

    els.gemini_api_url?.addEventListener("change", () => {
        modelListLoaded.delete("gemini");
        debounceByKey("model-gemini", () => {
            void refreshGeminiModels(true);
        });
    });

    els.gemini_api_key?.addEventListener("change", () => {
        modelListLoaded.delete("gemini");
        debounceByKey("model-gemini", () => {
            void refreshGeminiModels(true);
        });
    });

    els.special_translate_provider?.addEventListener("change", () => {
        const provider = normalizeSpecialProvider(
            els.special_translate_provider.value,
        );
        if (!String(els.special_translate_api_url.value || "").trim()) {
            els.special_translate_api_url.value =
                getSpecialApiDefaultByProvider(provider);
        }
        modelListLoaded.delete("special_translate");
        debounceByKey("model-special", () => {
            void refreshSpecialTranslateModels(true);
        });
    });

    els.special_translate_api_url?.addEventListener("change", () => {
        modelListLoaded.delete("special_translate");
        debounceByKey("model-special", () => {
            void refreshSpecialTranslateModels(true);
        });
    });

    els.special_translate_api_key?.addEventListener("change", () => {
        if (
            normalizeSpecialProvider(els.special_translate_provider?.value) ===
            SPECIAL_PROVIDER_OPENAI
        ) {
            modelListLoaded.delete("special_translate");
            debounceByKey("model-special", () => {
                void refreshSpecialTranslateModels(true);
            });
        }
    });

    els.ollama_api_url?.addEventListener("change", () => {
        modelListLoaded.delete("ollama");
        debounceByKey("model-ollama", () => {
            void refreshOllamaModels(true);
        });
    });

    els.webllm_model_mirror?.addEventListener("change", () => {
        const isCustom = els.webllm_model_mirror.value === "custom";
        els.webllm_custom_mirror.disabled = !isCustom;
    });

    webllmDownloadBtn?.addEventListener("click", () => {
        if (!isWebLLMSupportedBrowser) {
            setWebLLMStatus("当前浏览器不支持 WebLLM", true);
            return;
        }

        const modelId = getSelectedWebLLMModelId();
        if (!modelId) {
            setWebLLMStatus("请先选择或输入模型 ID", true);
            return;
        }

        const requestId = `webllm-preload-${Date.now()}`;
        setWebLLMButtonsEnabled(false);
        setWebLLMStatus("开始下载/加载模型...", false);

        try {
            const port = ensureWebLLMPort();
            port.postMessage({
                type: MESSAGE_TYPES.WEBLLM_PRELOAD || "WEBLLM_PRELOAD",
                requestId,
                modelId,
                settings: {
                    webllm_model_mirror: els.webllm_model_mirror.value,
                    webllm_custom_mirror: (
                        els.webllm_custom_mirror.value || ""
                    ).trim(),
                },
            });
        } catch (err) {
            setWebLLMButtonsEnabled(true);
            setWebLLMStatus("无法连接后台服务，请重试", true);
        }
    });

    webllmClearCacheBtn?.addEventListener("click", () => {
        const modelId = getSelectedWebLLMModelId();
        if (!modelId) {
            setWebLLMStatus("请先选择或输入模型 ID", true);
            return;
        }

        const requestId = `webllm-clear-${Date.now()}`;
        setWebLLMButtonsEnabled(false);
        setWebLLMStatus("正在清理模型缓存...", false);

        try {
            const port = ensureWebLLMPort();
            port.postMessage({
                type: MESSAGE_TYPES.WEBLLM_CLEAR_CACHE || "WEBLLM_CLEAR_CACHE",
                requestId,
                modelId,
                settings: {
                    webllm_model_mirror: els.webllm_model_mirror.value,
                    webllm_custom_mirror: (
                        els.webllm_custom_mirror.value || ""
                    ).trim(),
                },
            });
        } catch (err) {
            setWebLLMButtonsEnabled(true);
            setWebLLMStatus("无法连接后台服务，请重试", true);
        }
    });

    openLocalPdfBtn?.addEventListener("click", async () => {
        const runtimeBaseUrl = chrome.runtime.getURL("");
        const isFirefoxRuntime = runtimeBaseUrl.startsWith("moz-extension://");

        const activeTab = cachedActiveTab || (await getCurrentActiveTab());
        const activeTabUrl =
            activeTab && typeof activeTab.url === "string" ? activeTab.url : "";
        const currentPdfUrl =
            cachedCurrentPdfUrl || extractPdfUrlFromTabUrl(activeTabUrl);

        let viewerUrl;
        if (currentPdfUrl) {
            const isFilePdf = currentPdfUrl.startsWith("file://");
            if (isFirefoxRuntime && isFilePdf) {
                viewerUrl = chrome.runtime.getURL(
                    "vendor/pdfjs/web/viewer.html?file=&openFilePicker=1",
                );
                showToast(
                    "Firefox 安全策略不允许扩展直接读取 file:// 文件。将打开文件选择器，请选择当前 PDF。",
                );
            } else {
                viewerUrl = chrome.runtime.getURL(
                    `vendor/pdfjs/web/viewer.html?file=${encodeURIComponent(currentPdfUrl)}`,
                );
            }
        } else {
            viewerUrl = chrome.runtime.getURL(
                "vendor/pdfjs/web/viewer.html?file=&openFilePicker=1",
            );
        }

        try {
            const maybePromise = chrome.tabs.create({ url: viewerUrl });
            if (maybePromise && typeof maybePromise.then === "function") {
                await maybePromise;
            }
            window.close();
        } catch (err) {
            showToast("打开内置 PDF 页面失败，请重试");
        }
    });

    glossaryController.bindEvents();
    syncDataController.bindEvents();

    // Listen for system theme changes
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
            if (els.theme_mode.value === "auto") {
                applyTheme("auto");
            }
        });

    load();
    void refreshActivePdfContext();
    syncDataController.init();
    glossaryController.resetEditor();
    void glossaryController.refreshList().catch((err) => {
        glossaryController.setStatus(
            `术语列表加载失败: ${err && err.message ? err.message : String(err)}`,
            true,
        );
    });

    if (window.location.hash === "#glossary-import") {
        setTimeout(() => {
            glossaryImportBtn?.click();
            if (
                window.history &&
                typeof window.history.replaceState === "function"
            ) {
                window.history.replaceState(null, "", "options.html");
            }
        }, 60);
    }

    if (!isWebLLMSupportedBrowser) {
        const webllmOption = els.llm_engine_select?.querySelector(
            'option[value="webllm"]',
        );
        webllmOption?.remove();
        if (els.llm_engine_select?.value === "webllm") {
            els.llm_engine_select.value = "openai";
        }
        updateEngineDependentUI();
    }

    void evaluateWebLLMPerformance().then((profile) => {
        webllmPerfProfile = profile;
        renderWebLLMPerformance(profile);
    });
});
