import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(root, "options.js"), "utf8");
const lines = src.split("\n");

function slice(start, end) {
    return lines.slice(start - 1, end).join("\n");
}

function indent(code, spaces = 8) {
    const pad = " ".repeat(spaces);
    return code
        .split("\n")
        .map((line) => (line.trim() ? pad + line : line))
        .join("\n");
}

const modelPopulateRequest = slice(583, 1064);

const modelListsFixed = `// options/modules/model-lists.js — model dropdown populate, fetch, refresh
(function (global) {
    const DEFAULT_OPENROUTER_API_URL =
        "https://openrouter.ai/api/v1/chat/completions";
    const DEFAULT_OPENROUTER_FREE_MODEL = "openrouter/free";
    const RECOMMENDED_SPECIAL_TRANSLATE_MODELS = ["translategemma"];
    const SPECIAL_PROVIDER_OLLAMA = "ollama";
    const SPECIAL_PROVIDER_OPENAI = "openai_compatible";
    const SPECIAL_DEFAULT_URL_BY_PROVIDER = {
        [SPECIAL_PROVIDER_OLLAMA]: "http://localhost:11434/api/chat",
        [SPECIAL_PROVIDER_OPENAI]: "https://api.openai.com/v1/chat/completions",
    };

    function createModelListController(deps) {
        const {
            els,
            MESSAGE_TYPES,
            messaging,
            modelListLoaded,
            debounceByKey,
            OPENAI_COMPAT_MODEL_ENGINES,
            enginesModule,
            getCurrentEffectiveEngine,
        } = deps;

        const ensureBackgroundPort = () => messaging.ensureBackgroundPort();
        const ollamaModelRequestResolvers = messaging.resolvers.ollama;
        const openaiCompatModelRequestResolvers = messaging.resolvers.openaiCompat;
        const openrouterModelRequestResolvers = messaging.resolvers.openrouter;
        const claudeModelRequestResolvers = messaging.resolvers.claude;
        const geminiModelRequestResolvers = messaging.resolvers.gemini;
        const specialModelRequestResolvers = messaging.resolvers.special;

${indent(modelPopulateRequest)}

${indent(slice(2297, 2492))}

        function bindModelListEvents() {
${indent(slice(2494, 2612), 12)}
        }

        return {
            populateOllamaModelSelect,
            populateOpenAICompatModelSelect,
            populateOpenRouterModelSelect,
            populateSpecialTranslateModelSelect,
            getSelectedOpenAICompatModel,
            getSelectedOpenRouterModel,
            normalizeSpecialProvider,
            getSpecialApiDefaultByProvider,
            requestOllamaModelList,
            requestOpenAICompatModelList,
            requestOpenRouterModelList,
            requestClaudeModelList,
            requestGeminiModelList,
            requestSpecialTranslateModelList,
            refreshOpenAICompatModels,
            refreshOpenRouterModels,
            refreshClaudeModels,
            refreshGeminiModels,
            refreshSpecialTranslateModels,
            refreshOllamaModels,
            ensureActiveEngineModelListLoaded,
            bindModelListEvents,
            DEFAULT_OPENROUTER_API_URL,
            DEFAULT_OPENROUTER_FREE_MODEL,
            RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
            SPECIAL_PROVIDER_OLLAMA,
            SPECIAL_PROVIDER_OPENAI,
            SPECIAL_DEFAULT_URL_BY_PROVIDER,
        };
    }

    global.JYT_OPTION_MODEL_LISTS = {
        createModelListController,
    };
})(globalThis);
`;

fs.writeFileSync(
    path.join(root, "options/modules/model-lists.js"),
    modelListsFixed,
);

const pdfContextJs = `// options/modules/pdf-context.js — PDF detection and viewer launch
(function (global) {
    function createPdfContext(deps) {
        const { pdf, showToast, isFirefoxRuntime } = deps;
        const { openLocalPdfBtn, currentPdfStatusEl } = pdf;

        let cachedActiveTab = null;
        let cachedCurrentPdfUrl = "";

${indent(slice(1311, 1439))}

        function bindOpenPdfButton() {
${indent(slice(2614, 2654), 12)}
        }

        return {
            refreshActivePdfContext,
            getCurrentActiveTab,
            bindOpenPdfButton,
            getCachedActiveTab: () => cachedActiveTab,
            getCachedCurrentPdfUrl: () => cachedCurrentPdfUrl,
        };
    }

    global.JYT_OPTION_PDF = {
        createPdfContext,
    };
})(globalThis);
`;

fs.writeFileSync(path.join(root, "options/modules/pdf-context.js"), pdfContextJs);

// onboarding.js is maintained manually (first-install overlay flow).

const settingsFormJs = `// options/modules/settings-form.js — load, save, reset settings form
(function (global) {
    function createSettingsForm(deps) {
        const {
            els,
            showToast,
            applyTheme,
            DEFAULT_SETTINGS,
            API_KEY_FIELDS,
            LLM_ENGINES,
            OPENAI_COMPAT_MODEL_ENGINES,
            modelLists,
            shortcutsModule,
            updateEngineDependentUI,
            extractApiKeyPayload,
            collectMissingLocalApiKeys,
            stripApiKeyPayload,
            requestOptionalHostPermissions,
        } = deps;

        const {
            populateOllamaModelSelect,
            populateOpenAICompatModelSelect,
            populateOpenRouterModelSelect,
            populateSpecialTranslateModelSelect,
            getSelectedOpenAICompatModel,
            getSelectedOpenRouterModel,
            normalizeSpecialProvider,
            getSpecialApiDefaultByProvider,
            DEFAULT_OPENROUTER_API_URL,
            DEFAULT_OPENROUTER_FREE_MODEL,
            RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
            SPECIAL_PROVIDER_OLLAMA,
        } = modelLists;

        const { normalizeShortcut } = shortcutsModule;
        const modelListLoaded = deps.modelListLoaded;

        function clampPercent(value, fallback) {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return fallback;
            }
            return Math.max(5, Math.min(95, Math.round(n)));
        }

${indent(slice(1441, 1803))}

        function bindSaveReset() {
${indent(slice(1805, 2257), 12)}
        }

        function bindGeneralEvents() {
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
        }

        return {
            load,
            bindSaveReset,
            bindGeneralEvents,
            clampPercent,
        };
    }

    global.JYT_OPTION_SETTINGS = {
        createSettingsForm,
    };
})(globalThis);
`;

fs.writeFileSync(
    path.join(root, "options/modules/settings-form.js"),
    settingsFormJs,
);

console.log("Generated options modules");
