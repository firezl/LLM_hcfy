// options/modules/engines.js — engine UI helpers driven by JYT_ENGINE_REGISTRY
(function (global) {
    const registry = global.JYT_ENGINE_REGISTRY || {};
    const ENGINE_DEFINITIONS = registry.ENGINE_DEFINITIONS || [];
    const OPENAI_COMPAT_MODEL_ENGINES =
        registry.OPENAI_COMPAT_MODEL_ENGINES || [];
    const ENGINE_SECTION_IDS = registry.ENGINE_SECTION_IDS || [];

    const OPENAI_COMPAT_ENGINE_BY_NAME = Object.fromEntries(
        OPENAI_COMPAT_MODEL_ENGINES.map((cfg) => [cfg.name, cfg]),
    );

    const SECTION_ID_BY_ENGINE = Object.fromEntries(
        ENGINE_DEFINITIONS.filter((def) => def.sectionId).map((def) => [
            def.id,
            def.sectionId,
        ]),
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
        if (def?.usesSharedOpenAiSection) {
            return true;
        }
        return effectiveEngine === "auto";
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
     * @param {Map<string, HTMLElement>} [options.sectionsById]
     */
    function updateEngineDependentUI(options) {
        const {
            engineSelect,
            llmEngineSelect,
            openaiSection,
            sectionsById = new Map(),
        } = options || {};

        if (!openaiSection) {
            return;
        }

        const selectedEngine = engineSelect?.value || "auto";
        const effectiveEngine = resolveEffectiveEngine(
            engineSelect,
            llmEngineSelect,
        );

        const llmEngineSection = document.getElementById("llm_engine_section");
        if (llmEngineSection) {
            llmEngineSection.classList.toggle(
                "jyt-hidden",
                selectedEngine !== "llm",
            );
        }

        openaiSection.classList.toggle(
            "jyt-hidden",
            shouldHideSharedOpenAiSection(effectiveEngine),
        );

        for (const sectionId of ENGINE_SECTION_IDS) {
            const sectionEl =
                sectionsById.get(sectionId) ||
                document.getElementById(sectionId);
            if (!sectionEl) {
                continue;
            }
            const ownerEngine = Object.entries(SECTION_ID_BY_ENGINE).find(
                ([, id]) => id === sectionId,
            )?.[0];
            const visible =
                ownerEngine && effectiveEngine === ownerEngine;
            sectionEl.classList.toggle("jyt-hidden", !visible);
        }
    }

    function applyBrowserEngineOptionUX(options) {
        const {
            engineSelect,
            browserOptionId = "browser_engine_option",
            browserHintId = "browser_engine_hint",
            isFirefox = false,
        } = options || {};

        const browserOption = document.getElementById(browserOptionId);
        const browserHint = document.getElementById(browserHintId);

        if (browserOption) {
            browserOption.hidden = isFirefox;
            browserOption.disabled = isFirefox;
        }

        if (browserHint) {
            browserHint.textContent = isFirefox
                ? "Firefox 不支持浏览器内置 Translation API，请改用「大模型翻译」或其他引擎。"
                : "仅在网页划词时生效（页面内调用 Chrome/Edge Translation API，不经过扩展后台）。PDF 阅读器内请改用其他引擎。";
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

        if (OPENAI_COMPAT_ENGINE_BY_NAME[activeEngine]) {
            if (typeof cbs.refreshOpenAICompat === "function") {
                void cbs.refreshOpenAICompat(
                    OPENAI_COMPAT_ENGINE_BY_NAME[activeEngine],
                    false,
                );
            }
            return;
        }

        if (activeEngine === "auto") {
            if (typeof cbs.refreshOpenAICompat === "function") {
                void cbs.refreshOpenAICompat(
                    OPENAI_COMPAT_ENGINE_BY_NAME.openai,
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
            special_translate: cbs.refreshSpecialTranslate,
        };

        const refresh = refreshMap[activeEngine];
        if (typeof refresh === "function") {
            void refresh(false);
        }
    }

    global.JYT_OPTION_ENGINES = {
        ENGINE_DEFINITIONS,
        OPENAI_COMPAT_MODEL_ENGINES,
        OPENAI_COMPAT_ENGINE_BY_NAME,
        ENGINE_SECTION_IDS,
        resolveEffectiveEngine,
        updateEngineDependentUI,
        applyBrowserEngineOptionUX,
        ensureActiveEngineModelListLoaded,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
