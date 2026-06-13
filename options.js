// options.js — bootstrap entry for the options / popup page
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
    const domModule = globalThis.JYT_OPTION_DOM || {};
    const uiModule = globalThis.JYT_OPTION_UI || {};
    const messagingModule = globalThis.JYT_OPTION_MESSAGING || {};
    const shortcutsModule = globalThis.JYT_OPTION_SHORTCUTS || {};
    const modelListsModule = globalThis.JYT_OPTION_MODEL_LISTS || {};
    const pdfModule = globalThis.JYT_OPTION_PDF || {};
    const onboardingModule = globalThis.JYT_OPTION_ONBOARDING || {};
    const settingsModule = globalThis.JYT_OPTION_SETTINGS || {};

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
    const OPENAI_COMPAT_MODEL_ENGINES =
        enginesModule.OPENAI_COMPAT_MODEL_ENGINES || [];

    const API_KEY_FIELDS =
        typeof storageModule.buildLocalOnlyFields === "function"
            ? storageModule.buildLocalOnlyFields(DEFAULT_SETTINGS)
            : typeof storageModule.buildApiKeyFields === "function"
              ? storageModule.buildApiKeyFields(DEFAULT_SETTINGS)
              : Object.keys(DEFAULT_SETTINGS).filter((key) =>
                    key.endsWith("_api_key") || key.endsWith("_custom_headers"),
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

    const {
        els,
        openaiSection,
        engineSectionsById,
        glossary: glossaryEls,
        history: historyEls,
        onboarding,
        sync: syncEls,
        pdf: pdfEls,
        LLM_ENGINES,
    } = domModule.createDomRefs();

    function extractApiKeyPayload(input) {
        if (typeof storageModule.extractApiKeyPayload === "function") {
            return storageModule.extractApiKeyPayload(API_KEY_FIELDS, input);
        }
        const source = input && typeof input === "object" ? input : {};
        const payload = {};
        for (const key of API_KEY_FIELDS) {
            if (key.endsWith("_custom_headers")) {
                payload[key] = Array.isArray(source[key]) ? source[key] : [];
            } else {
                payload[key] = String(source[key] || "").trim();
            }
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
            if (key.endsWith("_custom_headers")) {
                const localValue = Array.isArray(sourceLocal[key])
                    ? sourceLocal[key]
                    : [];
                const syncValue = Array.isArray(sourceSync[key])
                    ? sourceSync[key]
                    : [];
                if (localValue.length === 0 && syncValue.length > 0) {
                    missing[key] = syncValue;
                }
            } else {
                const localValue = String(sourceLocal[key] || "").trim();
                const syncValue = String(sourceSync[key] || "").trim();
                if (!localValue && syncValue) {
                    missing[key] = syncValue;
                }
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

    const messaging = messagingModule.createMessaging();

    let historyController = null;
    const ui = uiModule.createUiShell({
        onTabActivated(tabId) {
            if (tabId === "tab_history" && historyController) {
                void historyController.refreshList().catch((err) => {
                    historyController.setStatus(
                        `历史记录加载失败: ${err && err.message ? err.message : String(err)}`,
                        true,
                    );
                });
            }
        },
    });
    const { showToast, activateOptionsTab, applyTheme, bindTabs, bindSystemThemeListener } =
        ui;

    ui.bindTabs();

    const modelLists = modelListsModule.createModelListController({
        els,
        MESSAGE_TYPES,
        messaging,
        modelListLoaded,
        debounceByKey,
        OPENAI_COMPAT_MODEL_ENGINES,
        enginesModule,
        getCurrentEffectiveEngine,
    });

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
        modelLists.ensureActiveEngineModelListLoaded(engine);
    }

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

    let settingsForm = null;
    let syncDataController = null;

    const glossaryController = glossaryModule.createGlossaryController({
        messageTypes: MESSAGE_TYPES,
        sendTermMessage: messaging.sendTermMessage,
        readFileAsText,
        shouldOpenImportInNewTab: () => isFirefoxRuntime && isRunningInPopup(),
        openImportInNewTab,
        elements: {
            sourceLang: glossaryEls.sourceLangEl,
            targetLang: glossaryEls.targetLangEl,
            sourceTerm: glossaryEls.sourceTermEl,
            targetTerm: glossaryEls.targetTermEl,
            caseSensitive: glossaryEls.caseSensitiveEl,
            wholeWord: glossaryEls.wholeWordEl,
            saveButton: glossaryEls.saveBtn,
            cancelEditButton: glossaryEls.cancelEditBtn,
            importButton: glossaryEls.importBtn,
            exportButton: glossaryEls.exportBtn,
            clearButton: glossaryEls.clearBtn,
            importFileInput: glossaryEls.importFileInput,
            list: glossaryEls.listEl,
            status: glossaryEls.statusEl,
        },
    });

    historyController = historyModule.createHistoryController({
        messageTypes: MESSAGE_TYPES,
        sendBackgroundMessage: messaging.sendBackgroundMessage,
        showToast,
        elements: {
            search: historyEls.searchEl,
            filter: historyEls.filterEl,
            refreshButton: historyEls.refreshBtn,
            clearButton: historyEls.clearBtn,
            list: historyEls.listEl,
            status: historyEls.statusEl,
        },
    });

    syncDataController = syncDataModule.createSyncDataController({
        defaultSettings: DEFAULT_SETTINGS,
        messageTypes: MESSAGE_TYPES,
        sendBackgroundMessage: messaging.sendBackgroundMessage,
        readFileAsText,
        reloadSettings: () => settingsForm?.load(),
        glossary: glossaryController,
        extractApiKeyPayload,
        stripApiKeyPayload,
        elements: {
            configImportButton: syncEls.configImportBtn,
            configExportButton: syncEls.configExportBtn,
            configImportFileInput: syncEls.configImportFileInput,
            configStatus: syncEls.configStatusEl,
            webdavBaseUrl: syncEls.webdavBaseUrlEl,
            webdavUsername: syncEls.webdavUsernameEl,
            webdavPassword: syncEls.webdavPasswordEl,
            webdavRemoteDir: syncEls.webdavRemoteDirEl,
            webdavSaveLocalButton: syncEls.webdavSaveLocalBtn,
            syncTestButton: syncEls.syncTestBtn,
            syncUploadButton: syncEls.syncUploadBtn,
            syncDownloadButton: syncEls.syncDownloadBtn,
            syncBidirectionalButton: syncEls.syncBidirectionalBtn,
            syncStatus: syncEls.syncStatusEl,
        },
    });

    settingsForm = settingsModule.createSettingsForm({
        els,
        showToast,
        applyTheme,
        DEFAULT_SETTINGS,
        API_KEY_FIELDS,
        LLM_ENGINES,
        OPENAI_COMPAT_MODEL_ENGINES,
        modelLists,
        shortcutsModule,
        modelListLoaded,
        updateEngineDependentUI,
        extractApiKeyPayload,
        collectMissingLocalApiKeys,
        stripApiKeyPayload,
        requestOptionalHostPermissions: (urls) =>
            syncDataController.requestOptionalHostPermissions(urls),
    });

    const pdfContext = pdfModule.createPdfContext({
        pdf: pdfEls,
        showToast,
        isFirefoxRuntime,
    });

    const onboardingController = onboardingModule.createOnboarding({
        overlay: onboarding,
        els,
        modelLists,
        updateEngineDependentUI,
        showToast,
        settingsForm,
    });

    shortcutsModule.bindShortcutInput(els.translate_shortcut);
    settingsForm.bindSaveReset();
    settingsForm.bindGeneralEvents();
    modelLists.bindModelListEvents();
    pdfContext.bindOpenPdfButton();

    glossaryController.bindEvents();
    historyController.bindEvents();
    syncDataController.bindEvents();

    bindSystemThemeListener(els.theme_mode);

    if (typeof enginesModule.applyBrowserEngineOptionUX === "function") {
        enginesModule.applyBrowserEngineOptionUX({
            engineSelect: els.engine_select,
            isFirefox: isFirefoxRuntime,
        });
    }

    settingsForm.load(() => {
        onboardingController.maybeAutoStart();
    });
    void pdfContext.refreshActivePdfContext();
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
            glossaryEls.importBtn?.click();
            if (
                window.history &&
                typeof window.history.replaceState === "function"
            ) {
                window.history.replaceState(null, "", "options.html");
            }
        }, 60);
    }
});
