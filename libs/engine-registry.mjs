/**
 * Canonical engine metadata for routing, options UI, and custom prompts.
 * Background handlers are wired in background/translate-handlers.js.
 */

import {
    enrichEngineDefinition,
    engineSectionId,
} from "./engine-conventions.mjs";

/** @typedef {'builtin' | 'llm'} EngineKind */

/**
 * @typedef {object} OpenAICompatUiConfig
 * @property {string} [apiUrl]
 * @property {string} [apiKey]
 * @property {string} [model]
 * @property {string} [customModel]
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
 * @property {string} [promptPrefix] settings key prefix (defaults to id; auto → openai)
 * @property {string} [customPromptKey]
 * @property {string} [systemPromptKey]
 * @property {string} [userPromptKey]
 * @property {string} [customHeadersKey]
 * @property {string} [customPayloadKey]
 * @property {string} [sectionId]
 * @property {boolean} [usesSharedOpenAiSection]
 * @property {OpenAICompatUiConfig} [openaiCompat]
 * @property {'content'} [runtime]
 */

/** @type {EngineDefinition[]} */
const RAW_ENGINE_DEFINITIONS = [
    {
        id: "auto",
        kind: "builtin",
        handler: "openai",
        usesSharedOpenAiSection: true,
    },
    { id: "google", kind: "builtin", handler: "google" },
    { id: "bing", kind: "builtin", handler: "bing" },
    { id: "deepl", kind: "builtin", handler: "deepl" },
    { id: "deeplx", kind: "builtin", handler: "deeplx" },
    { id: "browser", kind: "builtin", runtime: "content" },
    {
        id: "openai",
        kind: "llm",
        usesSharedOpenAiSection: true,
        openaiCompat: { defaultModel: "gpt-5.4-mini" },
    },
    {
        id: "custom_openai",
        kind: "llm",
        openaiCompat: { defaultModel: "gpt-4o-mini" },
    },
    { id: "openrouter", kind: "llm" },
    { id: "gemini", kind: "llm" },
    { id: "claude", kind: "llm" },
    {
        id: "deepseek",
        kind: "llm",
        openaiCompat: { defaultModel: "deepseek-v4-flash" },
    },
    {
        id: "siliconflow",
        kind: "llm",
        openaiCompat: { defaultModel: "deepseek-ai/DeepSeek-V3" },
    },
    {
        id: "qwen",
        kind: "llm",
        openaiCompat: { defaultModel: "qwen3.5-plus" },
    },
    {
        id: "glm",
        kind: "llm",
        openaiCompat: { defaultModel: "glm-5.1" },
    },
    {
        id: "xiaomi",
        kind: "llm",
        openaiCompat: { defaultModel: "mimo-v2.5" },
    },
    {
        id: "grok",
        kind: "llm",
        openaiCompat: { defaultModel: "grok-4.3" },
    },
    {
        id: "nim",
        kind: "llm",
        openaiCompat: { defaultModel: "meta/llama-3.1-70b-instruct" },
    },
    { id: "ollama", kind: "llm" },
];

export const ENGINE_DEFINITIONS = Object.freeze(
    RAW_ENGINE_DEFINITIONS.map((def) => enrichEngineDefinition(def)),
);

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

export const SYSTEM_PROMPT_SETTING_BY_ENGINE = Object.freeze(
    Object.fromEntries(
        ENGINE_DEFINITIONS.filter((def) => def.systemPromptKey).map((def) => [
            def.id,
            def.systemPromptKey,
        ]),
    ),
);

export const USER_PROMPT_SETTING_BY_ENGINE = Object.freeze(
    Object.fromEntries(
        ENGINE_DEFINITIONS.filter((def) => def.userPromptKey).map((def) => [
            def.id,
            def.userPromptKey,
        ]),
    ),
);

export const CUSTOM_HEADERS_SETTING_BY_ENGINE = Object.freeze(
    Object.fromEntries(
        ENGINE_DEFINITIONS.filter((def) => def.customHeadersKey).map((def) => [
            def.id,
            def.customHeadersKey,
        ]),
    ),
);

export const CUSTOM_PAYLOAD_SETTING_BY_ENGINE = Object.freeze(
    Object.fromEntries(
        ENGINE_DEFINITIONS.filter((def) => def.customPayloadKey).map((def) => [
            def.id,
            def.customPayloadKey,
        ]),
    ),
);

/** OpenAI-compat model dropdown configs (options page). */
export const OPENAI_COMPAT_MODEL_ENGINES = Object.freeze(
    ENGINE_DEFINITIONS.filter((def) => def.openaiCompat).map((def) => ({
        name: def.id,
        customHeadersKey: def.customHeadersKey,
        ...def.openaiCompat,
    })),
);

/** Section ids toggled by effective engine (options page). */
export const ENGINE_SECTION_IDS = Object.freeze(
    ENGINE_DEFINITIONS.filter((def) => def.sectionId).map(
        (def) => def.sectionId,
    ),
);

export { engineSectionId };

/**
 * Resolves persisted settings to a concrete engine id.
 * @param {object} [settings]
 * @returns {string}
 */
export function resolveTranslateEngine(settings) {
    const selectedEngine = String(settings?.engine || "auto").trim();
    if (selectedEngine === "special_translate") {
        return "ollama";
    }
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

export function getPromptSettingKeys(engineId) {
    return {
        legacy: CUSTOM_PROMPT_SETTING_BY_ENGINE[engineId] || null,
        system: SYSTEM_PROMPT_SETTING_BY_ENGINE[engineId] || null,
        user: USER_PROMPT_SETTING_BY_ENGINE[engineId] || null,
    };
}

export function getCustomHeadersSettingKey(engineId) {
    return CUSTOM_HEADERS_SETTING_BY_ENGINE[engineId] || null;
}

export function getCustomPayloadSettingKey(engineId) {
    return CUSTOM_PAYLOAD_SETTING_BY_ENGINE[engineId] || null;
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
