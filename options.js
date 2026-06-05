// options.js
document.addEventListener("DOMContentLoaded", () => {
    (function markOptionsPopupMode() {
        try {
            const extensionApi =
                (typeof browser !== "undefined" && browser.extension) ||
                (typeof chrome !== "undefined" && chrome.extension);
            if (!extensionApi || typeof extensionApi.getViews !== "function") {
                return;
            }
            const popupViews = extensionApi.getViews({ type: "popup" }) || [];
            if (popupViews.includes(window)) {
                document.documentElement.classList.add("jyt-options--popup-root");
                document.body.classList.add("jyt-options--popup");
            }
        } catch (_err) {
            /* ignore */
        }
    })();

    const shared = globalThis.JYT_SHARED || {};
    const storageModule = globalThis.JYT_OPTION_STORAGE || {};
    const glossaryModule = globalThis.JYT_OPTION_GLOSSARY || {};
    const historyModule = globalThis.JYT_OPTION_HISTORY || {};
    const modelModule = globalThis.JYT_OPTION_MODEL || {};
    const syncDataModule = globalThis.JYT_OPTION_SYNC_DATA || {};
    const enginesModule = globalThis.JYT_OPTION_ENGINES || {};

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
    const RECOMMENDED_SPECIAL_TRANSLATE_MODELS = ["translategemma"];
    const SPECIAL_PROVIDER_OLLAMA = "ollama";
    const SPECIAL_PROVIDER_OPENAI = "openai_compatible";
    const SPECIAL_DEFAULT_URL_BY_PROVIDER = {
        [SPECIAL_PROVIDER_OLLAMA]: "http://localhost:11434/api/chat",
        [SPECIAL_PROVIDER_OPENAI]: "https://api.openai.com/v1/chat/completions",
    };
    const DEFAULT_OPENROUTER_API_URL =
        "https://openrouter.ai/api/v1/chat/completions";
    const DEFAULT_OPENROUTER_FREE_MODEL = "openrouter/free";
    const OPENAI_COMPAT_MODEL_ENGINES =
        enginesModule.OPENAI_COMPAT_MODEL_ENGINES || [];
    const OPENAI_COMPAT_ENGINE_BY_NAME =
        enginesModule.OPENAI_COMPAT_ENGINE_BY_NAME || {};
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
        if (typeof enginesModule.resolveEffectiveEngine === "function") {
            return enginesModule.resolveEffectiveEngine(
                els.engine_select,
                els.llm_engine_select,
            );
        }
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
        "openrouter_api_url",
        "openrouter_api_key",
        "openrouter_model",
        "openrouter_custom_model",
        "openrouter_custom_prompt",
        "openrouter_show_thoughts",
        "openrouter_reasoning_effort",
        "openrouter_max_completion_tokens",
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
        "nim_api_url",
        "nim_api_key",
        "nim_model",
        "nim_custom_model",
        "nim_custom_prompt",
        "nim_show_thoughts",
        "nim_max_tokens",
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
        "deepl_api_url",
        "deepl_api_key",
        "deeplx_api_url",
        "deeplx_api_key",
        "special_translate_provider",
        "special_translate_api_url",
        "special_translate_api_key",
        "special_translate_model_select",
        "special_translate_custom_model",
        "special_translate_custom_prompt",
        "special_translate_show_thoughts",
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
    const openrouterSection = document.getElementById("openrouter_section");
    const deepseekSection = document.getElementById("deepseek_section");
    const qwenSection = document.getElementById("qwen_section");
    const glmSection = document.getElementById("glm_section");
    const xiaomiSection = document.getElementById("xiaomi_section");
    const grokSection = document.getElementById("grok_section");
    const nimSection = document.getElementById("nim_section");
    const claudeSection = document.getElementById("claude_section");
    const geminiSection = document.getElementById("gemini_section");
    const ollamaSection = document.getElementById("ollama_section");
    const deeplSection = document.getElementById("deepl_section");
    const deeplxSection = document.getElementById("deeplx_section");
    const specialTranslateSection = document.getElementById(
        "special_translate_section",
    );
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
    const glossaryCaseSensitiveEl = document.getElementById(
        "glossary_case_sensitive",
    );
    const glossaryWholeWordEl = document.getElementById("glossary_whole_word");
    const historySearchEl = document.getElementById("history_search");
    const historyFilterEl = document.getElementById("history_filter");
    const historyRefreshBtn = document.getElementById("history_refresh");
    const historyClearBtn = document.getElementById("history_clear");
    const historyListEl = document.getElementById("history_list");
    const historyStatusEl = document.getElementById("history_status");
    const setupWizardToggleBtn = document.getElementById(
        "setup_wizard_toggle",
    );
    const setupWizardPanelEl = document.getElementById("setup_wizard_panel");
    const setupWizardStatusEl = document.getElementById("setup_wizard_status");
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
    let backgroundPort = null;
    const ollamaModelRequestResolvers = new Map();
    const openaiCompatModelRequestResolvers = new Map();
    const openrouterModelRequestResolvers = new Map();
    const claudeModelRequestResolvers = new Map();
    const geminiModelRequestResolvers = new Map();
    const specialModelRequestResolvers = new Map();
    const LLM_ENGINES = new Set([
        "openai",
        "custom_openai",
        "openrouter",
        "gemini",
        "claude",
        "qwen",
        "deepseek",
        "glm",
        "xiaomi",
        "grok",
        "nim",
        "ollama",
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
            if (targetId === "tab_history" && historyController) {
                void historyController.refreshList().catch((err) => {
                    historyController.setStatus(
                        `历史记录加载失败: ${err && err.message ? err.message : String(err)}`,
                        true,
                    );
                });
            }
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
        return document.body.classList.contains("jyt-options--popup");
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
            caseSensitive: glossaryCaseSensitiveEl,
            wholeWord: glossaryWholeWordEl,
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

    const historyController =
        typeof historyModule.createHistoryController === "function"
            ? historyModule.createHistoryController({
                  messageTypes: MESSAGE_TYPES,
                  sendBackgroundMessage,
                  showToast,
                  elements: {
                      search: historySearchEl,
                      filter: historyFilterEl,
                      refreshButton: historyRefreshBtn,
                      clearButton: historyClearBtn,
                      list: historyListEl,
                      status: historyStatusEl,
                  },
              })
            : null;

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

    function activateOptionsTab(tabId) {
        tabs.forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.tab === tabId);
        });
        contents.forEach((content) => {
            content.classList.toggle("active", content.id === tabId);
        });
    }

    function setWizardStatus(text, isError) {
        if (!setupWizardStatusEl) return;
        setupWizardStatusEl.textContent = text || "";
        setupWizardStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function applyWizardPreset(preset) {
        const value = String(preset || "");
        if (value === "cloud") {
            els.engine_select.value = "llm";
            els.llm_engine_select.value = "openai";
            els.openai_api_url.value =
                els.openai_api_url.value ||
                "https://api.openai.com/v1/chat/completions";
            populateOpenAICompatModelSelect(
                els.openai_model,
                els.openai_custom_model,
                [],
                els.openai_model.value || "gpt-5.4-mini",
            );
            els.show_thoughts.value = "false";
            setWizardStatus("已套用云端高质量方案，请补全 API Key 后保存。", false);
        } else if (value === "local") {
            els.engine_select.value = "llm";
            els.llm_engine_select.value = "ollama";
            els.ollama_api_url.value =
                els.ollama_api_url.value || "http://localhost:11434/api/chat";
            populateOllamaModelSelect([], els.ollama_model_select.value || "qwen3.5:latest");
            els.ollama_show_thoughts.value = "false";
            setWizardStatus("已套用本地隐私方案，请确认 Ollama 正在运行后保存。", false);
        } else if (value === "free") {
            els.engine_select.value = "llm";
            els.llm_engine_select.value = "openrouter";
            els.openrouter_api_url.value =
                els.openrouter_api_url.value || DEFAULT_OPENROUTER_API_URL;
            populateOpenRouterModelSelect([], DEFAULT_OPENROUTER_FREE_MODEL);
            els.openrouter_show_thoughts.value = "false";
            setWizardStatus("已套用免费保底方案，请填写 OpenRouter API Key 后保存。", false);
        } else if (value === "special") {
            els.engine_select.value = "special_translate";
            els.special_translate_provider.value = SPECIAL_PROVIDER_OLLAMA;
            els.special_translate_api_url.value =
                els.special_translate_api_url.value ||
                SPECIAL_DEFAULT_URL_BY_PROVIDER[SPECIAL_PROVIDER_OLLAMA];
            populateSpecialTranslateModelSelect(
                RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                "translategemma",
            );
            els.special_translate_show_thoughts.value = "false";
            setWizardStatus("已套用专用翻译模型方案，请确认模型可用后保存。", false);
        }

        updateEngineDependentUI();
        activateOptionsTab("tab_engine");
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

    function normalizeOpenRouterModelItems(modelItems) {
        const seen = new Set();
        return (Array.isArray(modelItems) ? modelItems : [])
            .map((item) => ({
                id: String(item?.id || "").trim(),
                name: String(item?.name || item?.id || "").trim(),
                isFree: !!item?.isFree,
                contextLength: Number(item?.contextLength || 0),
                maxCompletionTokens: Number(item?.maxCompletionTokens || 0),
                supportedParameters: Array.isArray(item?.supportedParameters)
                    ? item.supportedParameters
                    : [],
                pricing:
                    item?.pricing && typeof item.pricing === "object"
                        ? item.pricing
                        : {},
            }))
            .filter((item) => {
                if (!item.id || seen.has(item.id)) {
                    return false;
                }
                seen.add(item.id);
                return true;
            });
    }

    function populateOpenRouterModelSelect(modelItems, selectedModel) {
        if (!els.openrouter_model || !els.openrouter_custom_model) return;

        const normalizedItems = normalizeOpenRouterModelItems(modelItems);
        const freeItems = normalizedItems.filter(
            (item) =>
                item.isFree &&
                item.id.toLowerCase() !== DEFAULT_OPENROUTER_FREE_MODEL,
        );
        const paidItems = normalizedItems.filter(
            (item) =>
                !item.isFree &&
                item.id.toLowerCase() !== DEFAULT_OPENROUTER_FREE_MODEL,
        );
        const orderedItems = [...freeItems, ...paidItems];

        els.openrouter_model.innerHTML = "";

        const freeRouterOption = document.createElement("option");
        freeRouterOption.value = DEFAULT_OPENROUTER_FREE_MODEL;
        freeRouterOption.textContent =
            "openrouter/free（自动免费模型）";
        els.openrouter_model.appendChild(freeRouterOption);

        orderedItems.forEach((item) => {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.isFree
                ? `${item.id}（免费）`
                : item.name && item.name !== item.id
                  ? `${item.name} (${item.id})`
                  : item.id;
            els.openrouter_model.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = "自定义模型名";
        els.openrouter_model.appendChild(customOption);

        const orderedIds = [
            DEFAULT_OPENROUTER_FREE_MODEL,
            ...orderedItems.map((item) => item.id),
        ];
        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.openrouter_model.value = selectedModel;
            els.openrouter_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            const savedOption = document.createElement("option");
            savedOption.value = selectedModel;
            savedOption.textContent = `${selectedModel}（已保存）`;
            const firstPaidIndex = 1 + freeItems.length;
            const firstPaidOption =
                els.openrouter_model.options[firstPaidIndex] || customOption;
            els.openrouter_model.insertBefore(savedOption, firstPaidOption);
            els.openrouter_model.value = selectedModel;
            els.openrouter_custom_model.disabled = true;
            return;
        }

        if (selectedModel === "custom") {
            els.openrouter_model.value = "custom";
            els.openrouter_custom_model.disabled = false;
            return;
        }

        els.openrouter_model.value = DEFAULT_OPENROUTER_FREE_MODEL;
        els.openrouter_custom_model.disabled = true;
    }

    function getSelectedOpenRouterModel() {
        const selected = String(els.openrouter_model?.value || "").trim();
        if (selected === "custom") {
            return String(els.openrouter_custom_model?.value || "").trim();
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
                const port = ensureBackgroundPort();
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
                const port = ensureBackgroundPort();
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

    async function requestOpenRouterModelList(apiUrl, apiKey) {
        return new Promise((resolve, reject) => {
            const requestId = `openrouter-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                openrouterModelRequestResolvers.delete(requestId);
                reject(new Error("请求 OpenRouter 模型列表超时"));
            }, 8000);

            openrouterModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureBackgroundPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.OPENROUTER_GET_MODELS ||
                        "OPENROUTER_GET_MODELS",
                    requestId,
                    apiUrl: String(apiUrl || "").trim(),
                    apiKey: String(apiKey || "").trim(),
                });
            } catch (err) {
                clearTimeout(timer);
                openrouterModelRequestResolvers.delete(requestId);
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
                const port = ensureBackgroundPort();
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
                const port = ensureBackgroundPort();
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
                const port = ensureBackgroundPort();
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

    function ensureBackgroundPort() {
        if (backgroundPort) return backgroundPort;

        backgroundPort = chrome.runtime.connect({ name: "jyt-translate" });
        backgroundPort.onMessage.addListener((message) => {
            if (!message) return;

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

            if (message.type === "OPENROUTER_OP_ERROR") {
                const resolvePending = openrouterModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    openrouterModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelItems: [] });
                }
                return;
            }

            if (message.type === "OPENROUTER_MODELS_RESPONSE") {
                const resolvePending = openrouterModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    openrouterModelRequestResolvers.delete(message.requestId);
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

        backgroundPort.onDisconnect.addListener(() => {
            backgroundPort = null;
        });

        return backgroundPort;
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

    const engineSectionsById = new Map(
        [
            ["custom_openai_section", customOpenAISection],
            ["openrouter_section", openrouterSection],
            ["deepseek_section", deepseekSection],
            ["qwen_section", qwenSection],
            ["glm_section", glmSection],
            ["xiaomi_section", xiaomiSection],
            ["grok_section", grokSection],
            ["nim_section", nimSection],
            ["claude_section", claudeSection],
            ["gemini_section", geminiSection],
            ["ollama_section", ollamaSection],
            ["deepl_section", deeplSection],
            ["deeplx_section", deeplxSection],
            ["special_translate_section", specialTranslateSection],
        ].filter(([, el]) => el),
    );

    function updateEngineDependentUI() {
        if (typeof enginesModule.updateEngineDependentUI === "function") {
            enginesModule.updateEngineDependentUI({
                engineSelect: els.engine_select,
                llmEngineSelect: els.llm_engine_select,
                openaiSection,
                sectionsById: engineSectionsById,
            });
        }

        const engine = getCurrentEffectiveEngine();
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
                    : migratedLLMEngine || "openrouter";
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
                    unifiedOpenAIModel || legacyThinkingModel || "gpt-5.4-mini";
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
                els.openrouter_api_url.value =
                    items.openrouter_api_url || DEFAULT_OPENROUTER_API_URL;
                els.openrouter_api_key.value = items.openrouter_api_key || "";
                const savedOpenRouterModel =
                    items.openrouter_model || DEFAULT_OPENROUTER_FREE_MODEL;
                els.openrouter_custom_model.value =
                    items.openrouter_custom_model || "";
                els.openrouter_custom_prompt.value =
                    items.openrouter_custom_prompt || "";
                els.openrouter_show_thoughts.value =
                    items.openrouter_show_thoughts ? "true" : "false";
                els.openrouter_reasoning_effort.value =
                    items.openrouter_reasoning_effort || "medium";
                els.openrouter_max_completion_tokens.value = Number.isFinite(
                    Number(items.openrouter_max_completion_tokens),
                )
                    ? String(
                          Math.floor(
                              Number(items.openrouter_max_completion_tokens),
                          ),
                      )
                    : "0";
                populateOpenRouterModelSelect([], savedOpenRouterModel);
                modelListLoaded.delete("openrouter");
                els.deepseek_api_url.value =
                    items.deepseek_api_url ||
                    "https://api.deepseek.com/chat/completions";
                els.deepseek_api_key.value = items.deepseek_api_key || "";
                const savedDeepSeekModel =
                    items.deepseek_model || "deepseek-v4-flash";
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
                const savedQwenModel = items.qwen_model || "qwen3.5-plus";
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
                const savedXiaomiModel = items.xiaomi_model || "mimo-v2.5";
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
                const savedGrokModel = items.grok_model || "grok-4.3";
                els.grok_custom_model.value = items.grok_custom_model || "";
                els.grok_custom_prompt.value = items.grok_custom_prompt || "";
                els.grok_show_thoughts.value = items.grok_show_thoughts
                    ? "true"
                    : "false";
                els.nim_api_url.value =
                    items.nim_api_url ||
                    "https://integrate.api.nvidia.com/v1/chat/completions";
                els.nim_api_key.value = items.nim_api_key || "";
                const savedNimModel =
                    items.nim_model || "meta/llama-3.1-70b-instruct";
                els.nim_custom_model.value = items.nim_custom_model || "";
                els.nim_custom_prompt.value = items.nim_custom_prompt || "";
                els.nim_show_thoughts.value = items.nim_show_thoughts
                    ? "true"
                    : "false";
                els.nim_max_tokens.value = Number.isFinite(
                    Number(items.nim_max_tokens),
                )
                    ? String(Math.floor(Number(items.nim_max_tokens)))
                    : "0";
                const openaiCompatSavedModelMap = {
                    openai: savedOpenAIModel,
                    custom_openai: savedCustomOpenAIModel,
                    deepseek: savedDeepSeekModel,
                    qwen: savedQwenModel,
                    glm: savedGLMModel,
                    xiaomi: savedXiaomiModel,
                    grok: savedGrokModel,
                    nim: savedNimModel,
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
                    items.gemini_model || "gemini-flash-latest";
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
                const savedOllamaModel =
                    items.ollama_model || "qwen3.5:latest";
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
                els.deepl_api_url.value =
                    items.deepl_api_url ||
                    "https://api-free.deepl.com/v2/translate";
                els.deepl_api_key.value = items.deepl_api_key || "";
                els.deeplx_api_url.value =
                    items.deeplx_api_url || "http://localhost:1188/translate";
                els.deeplx_api_key.value = items.deeplx_api_key || "";
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
        const selectedOpenRouterModel = getSelectedOpenRouterModel();
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
        const selectedNimModel = getSelectedOpenAICompatModel(
            els.nim_model,
            els.nim_custom_model,
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
            openrouter_api_url: (els.openrouter_api_url.value || "").trim(),
            openrouter_api_key: els.openrouter_api_key.value,
            openrouter_model: selectedOpenRouterModel,
            openrouter_custom_model: (
                els.openrouter_custom_model.value || ""
            ).trim(),
            openrouter_custom_prompt: els.openrouter_custom_prompt.value || "",
            openrouter_show_thoughts:
                els.openrouter_show_thoughts.value === "true",
            openrouter_reasoning_effort:
                els.openrouter_reasoning_effort.value,
            openrouter_max_completion_tokens: Number(
                els.openrouter_max_completion_tokens.value || 0,
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
            nim_api_url: (els.nim_api_url.value || "").trim(),
            nim_api_key: els.nim_api_key.value,
            nim_model: selectedNimModel,
            nim_custom_model: (els.nim_custom_model.value || "").trim(),
            nim_custom_prompt: els.nim_custom_prompt.value || "",
            nim_show_thoughts: els.nim_show_thoughts.value === "true",
            nim_max_tokens: Number(els.nim_max_tokens.value || 0),
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
            deepl_api_url: (els.deepl_api_url.value || "").trim(),
            deepl_api_key: els.deepl_api_key.value,
            deeplx_api_url: (els.deeplx_api_url.value || "").trim(),
            deeplx_api_key: els.deeplx_api_key.value,
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

        if (effectiveEngine === "openrouter") {
            if (!data.openrouter_api_key) {
                showToast("请先填写 OpenRouter API Key。", true);
                return;
            }
            if (!data.openrouter_model) {
                showToast("请先选择 OpenRouter 模型或填写自定义模型名。", true);
                return;
            }
            if (!data.openrouter_api_url) {
                data.openrouter_api_url = DEFAULT_OPENROUTER_API_URL;
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

        if (effectiveEngine === "nim") {
            if (!data.nim_api_key) {
                showToast("请先填写 NVIDIA NIM API Key。", true);
                return;
            }
            if (!data.nim_model) {
                showToast("请先填写 NVIDIA NIM 模型。", true);
                return;
            }
            if (!data.nim_api_url) {
                data.nim_api_url =
                    "https://integrate.api.nvidia.com/v1/chat/completions";
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

        if (effectiveEngine === "deepl") {
            if (!data.deepl_api_key) {
                showToast("请先填写 DeepL API Key。", true);
                return;
            }
            if (!data.deepl_api_url) {
                data.deepl_api_url =
                    "https://api-free.deepl.com/v2/translate";
            }
        }

        if (effectiveEngine === "deeplx") {
            if (!data.deeplx_api_url) {
                data.deeplx_api_url = "http://localhost:1188/translate";
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

        const permissionUrls = Object.entries(data)
            .filter(([key, value]) => key.endsWith("_api_url") && value)
            .map(([, value]) => value);
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

    function refreshOpenRouterModels(force) {
        if (!force && modelListLoaded.has("openrouter")) {
            return Promise.resolve();
        }
        const selectedModel = getSelectedOpenRouterModel();
        return requestOpenRouterModelList(
            els.openrouter_api_url.value,
            els.openrouter_api_key.value,
        )
            .then((res) => {
                const modelItems = Array.isArray(res.modelItems)
                    ? res.modelItems
                    : [];
                populateOpenRouterModelSelect(modelItems, selectedModel);
                modelListLoaded.add("openrouter");
            })
            .catch(() => {
                populateOpenRouterModelSelect([], selectedModel);
                modelListLoaded.delete("openrouter");
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

    function ensureActiveEngineModelListLoaded(engine) {
        if (typeof enginesModule.ensureActiveEngineModelListLoaded === "function") {
            enginesModule.ensureActiveEngineModelListLoaded(
                engine || getCurrentEffectiveEngine() || "auto",
                {
                    refreshOpenAICompat: (cfg, force) =>
                        refreshOpenAICompatModels(cfg, force),
                    refreshOpenRouter: (force) =>
                        refreshOpenRouterModels(force),
                    refreshClaude: (force) => refreshClaudeModels(force),
                    refreshGemini: (force) => refreshGeminiModels(force),
                    refreshOllama: (force) => refreshOllamaModels(force),
                    refreshSpecialTranslate: (force) =>
                        refreshSpecialTranslateModels(force),
                },
            );
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

    els.openrouter_model?.addEventListener("change", () => {
        const isCustom = els.openrouter_model.value === "custom";
        els.openrouter_custom_model.disabled = !isCustom;
    });

    els.openrouter_api_url?.addEventListener("change", () => {
        modelListLoaded.delete("openrouter");
        debounceByKey("model-openrouter", () => {
            void refreshOpenRouterModels(true);
        });
    });

    els.openrouter_api_key?.addEventListener("change", () => {
        modelListLoaded.delete("openrouter");
        debounceByKey("model-openrouter", () => {
            void refreshOpenRouterModels(true);
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
    historyController?.bindEvents();
    syncDataController.bindEvents();

    setupWizardToggleBtn?.addEventListener("click", () => {
        setupWizardPanelEl?.classList.toggle("jyt-hidden");
    });

    setupWizardPanelEl?.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-preset]");
        if (!button) return;
        applyWizardPreset(button.dataset.preset);
    });

    // Listen for system theme changes
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
            if (els.theme_mode.value === "auto") {
                applyTheme("auto");
            }
        });

    if (typeof enginesModule.applyBrowserEngineOptionUX === "function") {
        enginesModule.applyBrowserEngineOptionUX({
            engineSelect: els.engine_select,
            isFirefox: isFirefoxRuntime,
        });
    }

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

});
