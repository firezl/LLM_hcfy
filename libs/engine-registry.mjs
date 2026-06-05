/**
 * Canonical engine metadata for routing, options UI, and custom prompts.
 * Background handlers are wired in background/translate-handlers.js.
 */

/** @typedef {'builtin' | 'llm' | 'top'} EngineKind */

/**
 * @typedef {object} OpenAICompatUiConfig
 * @property {string} apiUrlId
 * @property {string} apiKeyId
 * @property {string} modelId
 * @property {string} customModelId
 * @property {string} defaultModel
 */

/**
 * @typedef {object} EngineDefinition
 * @property {string} id
 * @property {EngineKind} kind
 * @property {string} [handler] background handler key (defaults to id)
 * @property {string} [customPromptKey] settings key for custom prompt template
 * @property {string} [sectionId] options.html section element id
 * @property {boolean} [usesSharedOpenAiSection] show #openai_section when active
 * @property {OpenAICompatUiConfig} [openaiCompat] model list UI for OpenAI-compatible APIs
 * @property {'content'} [runtime] translate runs in content script only
 */

/** @type {EngineDefinition[]} */
export const ENGINE_DEFINITIONS = [
    {
        id: "auto",
        kind: "builtin",
        handler: "openai",
        customPromptKey: "openai_custom_prompt",
        usesSharedOpenAiSection: true,
    },
    {
        id: "google",
        kind: "builtin",
        handler: "google",
    },
    {
        id: "bing",
        kind: "builtin",
        handler: "bing",
    },
    {
        id: "deepl",
        kind: "builtin",
        handler: "deepl",
        sectionId: "deepl_section",
    },
    {
        id: "deeplx",
        kind: "builtin",
        handler: "deeplx",
        sectionId: "deeplx_section",
    },
    {
        id: "browser",
        kind: "builtin",
        runtime: "content",
    },
    {
        id: "openai",
        kind: "llm",
        customPromptKey: "openai_custom_prompt",
        usesSharedOpenAiSection: true,
        openaiCompat: {
            apiUrlId: "openai_api_url",
            apiKeyId: "openai_api_key",
            modelId: "openai_model",
            customModelId: "openai_custom_model",
            defaultModel: "gpt-5.4-mini",
        },
    },
    {
        id: "custom_openai",
        kind: "llm",
        customPromptKey: "custom_openai_custom_prompt",
        sectionId: "custom_openai_section",
        openaiCompat: {
            apiUrlId: "custom_openai_api_url",
            apiKeyId: "custom_openai_api_key",
            modelId: "custom_openai_model",
            customModelId: "custom_openai_custom_model",
            defaultModel: "gpt-4o-mini",
        },
    },
    {
        id: "openrouter",
        kind: "llm",
        customPromptKey: "openrouter_custom_prompt",
        sectionId: "openrouter_section",
    },
    {
        id: "gemini",
        kind: "llm",
        customPromptKey: "gemini_custom_prompt",
        sectionId: "gemini_section",
    },
    {
        id: "claude",
        kind: "llm",
        customPromptKey: "claude_custom_prompt",
        sectionId: "claude_section",
    },
    {
        id: "deepseek",
        kind: "llm",
        customPromptKey: "deepseek_custom_prompt",
        sectionId: "deepseek_section",
        openaiCompat: {
            apiUrlId: "deepseek_api_url",
            apiKeyId: "deepseek_api_key",
            modelId: "deepseek_model",
            customModelId: "deepseek_custom_model",
            defaultModel: "deepseek-v4-flash",
        },
    },
    {
        id: "qwen",
        kind: "llm",
        customPromptKey: "qwen_custom_prompt",
        sectionId: "qwen_section",
        openaiCompat: {
            apiUrlId: "qwen_api_url",
            apiKeyId: "qwen_api_key",
            modelId: "qwen_model",
            customModelId: "qwen_custom_model",
            defaultModel: "qwen3.5-plus",
        },
    },
    {
        id: "glm",
        kind: "llm",
        customPromptKey: "glm_custom_prompt",
        sectionId: "glm_section",
        openaiCompat: {
            apiUrlId: "glm_api_url",
            apiKeyId: "glm_api_key",
            modelId: "glm_model",
            customModelId: "glm_custom_model",
            defaultModel: "glm-5.1",
        },
    },
    {
        id: "xiaomi",
        kind: "llm",
        customPromptKey: "xiaomi_custom_prompt",
        sectionId: "xiaomi_section",
        openaiCompat: {
            apiUrlId: "xiaomi_api_url",
            apiKeyId: "xiaomi_api_key",
            modelId: "xiaomi_model",
            customModelId: "xiaomi_custom_model",
            defaultModel: "mimo-v2.5",
        },
    },
    {
        id: "grok",
        kind: "llm",
        customPromptKey: "grok_custom_prompt",
        sectionId: "grok_section",
        openaiCompat: {
            apiUrlId: "grok_api_url",
            apiKeyId: "grok_api_key",
            modelId: "grok_model",
            customModelId: "grok_custom_model",
            defaultModel: "grok-4.3",
        },
    },
    {
        id: "nim",
        kind: "llm",
        customPromptKey: "nim_custom_prompt",
        sectionId: "nim_section",
        openaiCompat: {
            apiUrlId: "nim_api_url",
            apiKeyId: "nim_api_key",
            modelId: "nim_model",
            customModelId: "nim_custom_model",
            defaultModel: "meta/llama-3.1-70b-instruct",
        },
    },
    {
        id: "ollama",
        kind: "llm",
        customPromptKey: "ollama_custom_prompt",
        sectionId: "ollama_section",
    },
    {
        id: "special_translate",
        kind: "top",
        customPromptKey: "special_translate_custom_prompt",
        sectionId: "special_translate_section",
    },
];

export const LLM_ENGINE_IDS = Object.freeze(
    ENGINE_DEFINITIONS.filter((def) => def.kind === "llm").map((def) => def.id),
);

const ENGINE_BY_ID = Object.freeze(
    Object.fromEntries(ENGINE_DEFINITIONS.map((def) => [def.id, def])),
);

export const CUSTOM_PROMPT_SETTING_BY_ENGINE = Object.freeze(
    Object.fromEntries(
        ENGINE_DEFINITIONS.filter((def) => def.customPromptKey).map((def) => [
            def.id,
            def.customPromptKey,
        ]),
    ),
);

/** OpenAI-compat model dropdown configs (options page). */
export const OPENAI_COMPAT_MODEL_ENGINES = Object.freeze(
    ENGINE_DEFINITIONS.filter((def) => def.openaiCompat).map((def) => ({
        name: def.id,
        ...def.openaiCompat,
    })),
);

/** Section ids toggled by effective engine (options page). */
export const ENGINE_SECTION_IDS = Object.freeze(
    ENGINE_DEFINITIONS.filter((def) => def.sectionId).map(
        (def) => def.sectionId,
    ),
);

/**
 * Resolves persisted settings to a concrete engine id.
 * @param {object} [settings]
 * @returns {string}
 */
export function resolveTranslateEngine(settings) {
    const selectedEngine = String(settings?.engine || "auto").trim();
    if (selectedEngine !== "llm") {
        return selectedEngine || "auto";
    }
    const llmEngine = String(settings?.llm_engine || "openai").trim();
    return LLM_ENGINE_IDS.includes(llmEngine) ? llmEngine : "openai";
}

/**
 * @param {string} engineId
 * @returns {EngineDefinition | undefined}
 */
export function getEngineDefinition(engineId) {
    return ENGINE_BY_ID[String(engineId || "").trim()];
}

/**
 * Whether the shared OpenAI section should be visible.
 * @param {string} effectiveEngine
 */
export function shouldShowSharedOpenAiSection(effectiveEngine) {
    const def = getEngineDefinition(effectiveEngine);
    if (def?.usesSharedOpenAiSection) {
        return true;
    }
    if (effectiveEngine === "auto") {
        return true;
    }
    return false;
}

/**
 * Whether a dedicated engine section should be visible.
 * @param {string} sectionId
 * @param {string} effectiveEngine
 */
export function shouldShowEngineSection(sectionId, effectiveEngine) {
    const def = getEngineDefinition(effectiveEngine);
    if (def?.sectionId === sectionId) {
        return true;
    }
    return false;
}

/**
 * Engines that hide the shared OpenAI panel when active.
 * @param {string} effectiveEngine
 */
export function shouldHideSharedOpenAiSection(effectiveEngine) {
    if (shouldShowSharedOpenAiSection(effectiveEngine)) {
        return false;
    }
    const def = getEngineDefinition(effectiveEngine);
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
 * @param {string} engineId
 * @returns {string | null}
 */
export function getCustomPromptSettingKey(engineId) {
    return CUSTOM_PROMPT_SETTING_BY_ENGINE[engineId] || null;
}

/**
 * Background handler key for streaming translate.
 * @param {string} engineId
 */
export function getTranslateHandlerKey(engineId) {
    const def = getEngineDefinition(engineId);
    if (!def) {
        return "openai";
    }
    return def.handler || def.id;
}

export function isContentOnlyEngine(engineId) {
    return getEngineDefinition(engineId)?.runtime === "content";
}
