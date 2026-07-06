// options/modules/engines.js — engine UI helpers driven by JYT_ENGINE_REGISTRY
(function (global) {
    const registry = global.JYT_ENGINE_REGISTRY || {};
    const ENGINE_DEFINITIONS = registry.ENGINE_DEFINITIONS || [];
    const OPENAI_COMPAT_MODEL_ENGINES =
        registry.OPENAI_COMPAT_MODEL_ENGINES || [];

    const OPENAI_COMPAT_ENGINE_BY_NAME = Object.fromEntries(
        OPENAI_COMPAT_MODEL_ENGINES.map((cfg) => [cfg.name, cfg]),
    );

    function resolveEffectiveEngine(engineSelect, llmEngineSelect) {
        const selectedEngine = String(engineSelect?.value || "auto");
        if (selectedEngine !== "llm") {
            return selectedEngine;
        }
        return String(llmEngineSelect?.value || "openai");
    }

    function shouldShowSharedOpenAiSection(effectiveEngine) {
        const def = ENGINE_DEFINITIONS.find((item) => item.id === effectiveEngine);
        return !!def?.usesSharedOpenAiSection;
    }

    function shouldHideSharedOpenAiSection(effectiveEngine) {
        if (shouldShowSharedOpenAiSection(effectiveEngine)) {
            return false;
        }
        const def = ENGINE_DEFINITIONS.find((item) => item.id === effectiveEngine);
        if (!def) {
            return true;
        }
        if (def.sectionId || def.runtime === "content") {
            return true;
        }
        if (def.kind === "builtin" && def.id !== "auto") {
            return true;
        }
        return false;
    }

    /**
     * Toggles engine-specific option sections.
     * @param {object} options
     * @param {HTMLElement} options.engineSelect
     * @param {HTMLElement} [options.llmEngineSelect]
     * @param {HTMLElement} options.openaiSection
     */
    function updateEngineDependentUI(options) {
        const { engineSelect, llmEngineSelect } = options || {};

        const selectedEngine = engineSelect?.value || "auto";
        const effectiveEngine = resolveEffectiveEngine(
            engineSelect,
            llmEngineSelect,
        );

        const llmEngineSection = document.querySelector('[data-jyt-panel="llm"]');
        if (llmEngineSection) {
            llmEngineSection.classList.toggle(
                "jyt-hidden",
                selectedEngine !== "llm",
            );
        }

        for (const sectionEl of document.querySelectorAll("[data-jyt-engine]")) {
            const engineId = sectionEl.dataset.jytEngine || "";
            const isSharedOpenAi = sectionEl.dataset.jytSharedOpenai === "true";
            const visible = isSharedOpenAi
                ? !shouldHideSharedOpenAiSection(effectiveEngine)
                : engineId === effectiveEngine;
            sectionEl.classList.toggle("jyt-hidden", !visible);
        }
    }

    function applyBrowserEngineOptionUX(options) {
        const {
            engineSelect,
            browserOptionId = "browser_engine_option",
            browserHintId = "browser_engine_hint",
            isFirefox = false,
            t: translate,
        } = options || {};

        const t =
            typeof translate === "function"
                ? translate
                : (key) =>
                      global.JYT_I18N?.t ? global.JYT_I18N.t(key) : key;

        const browserOption = document.getElementById(browserOptionId);
        const browserHint = document.getElementById(browserHintId);

        if (browserOption) {
            browserOption.hidden = isFirefox;
            browserOption.disabled = isFirefox;
        }

        if (browserHint) {
            browserHint.textContent = isFirefox
                ? t("options.general.browserEngine.hintFirefox")
                : t("options.general.browserEngine.hint");
        }

        if (
            isFirefox &&
            engineSelect &&
            engineSelect.value === "browser"
        ) {
            engineSelect.value = "auto";
        }
    }

    function ensureActiveEngineModelListLoaded(engine, callbacks) {
        const activeEngine = String(engine || "auto");
        const cbs = callbacks || {};

        if (activeEngine === "auto") {
            return;
        }

        if (OPENAI_COMPAT_ENGINE_BY_NAME[activeEngine]) {
            if (typeof cbs.refreshOpenAICompat === "function") {
                void cbs.refreshOpenAICompat(
                    OPENAI_COMPAT_ENGINE_BY_NAME[activeEngine],
                    false,
                );
            }
            return;
        }

        const refreshMap = {
            openrouter: cbs.refreshOpenRouter,
            claude: cbs.refreshClaude,
            gemini: cbs.refreshGemini,
            ollama: cbs.refreshOllama,
        };

        const refresh = refreshMap[activeEngine];
        if (typeof refresh === "function") {
            void refresh(false);
        }
    }

    function updateAutoPriorityHint(options) {
        const { engineSelect, priorityHintEl, settings, t } = options || {};
        if (!priorityHintEl) {
            return;
        }
        if (String(engineSelect?.value || "auto") !== "auto") {
            priorityHintEl.textContent = "";
            return;
        }

        const autoEngine = global.JYT_AUTO_ENGINE || {};
        const buildCandidates =
            typeof autoEngine.buildAutoTranslateCandidates === "function"
                ? autoEngine.buildAutoTranslateCandidates
                : null;
        const getDisplayKey =
            typeof autoEngine.getAutoEngineDisplayI18nKey === "function"
                ? autoEngine.getAutoEngineDisplayI18nKey
                : null;
        if (!buildCandidates || !getDisplayKey) {
            priorityHintEl.textContent = "";
            return;
        }

        const primary = buildCandidates(settings || {})[0] || "browser";
        const labelKey = getDisplayKey(primary);
        const label =
            typeof t === "function" ? t(labelKey) : labelKey || primary;
        priorityHintEl.textContent =
            typeof t === "function"
                ? t("options.engine.auto.priorityHint", { engine: label })
                : label;
    }

    global.JYT_OPTION_ENGINES = {
        ENGINE_DEFINITIONS,
        OPENAI_COMPAT_MODEL_ENGINES,
        OPENAI_COMPAT_ENGINE_BY_NAME,
        resolveEffectiveEngine,
        updateEngineDependentUI,
        updateAutoPriorityHint,
        applyBrowserEngineOptionUX,
        ensureActiveEngineModelListLoaded,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
