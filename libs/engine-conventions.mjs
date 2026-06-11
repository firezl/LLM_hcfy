/**
 * Naming conventions for engine settings keys and options UI bindings.
 * Override individual fields via `promptPrefix`, `sectionId: false`, or `fields`.
 */

/** @typedef {Record<string, string>} FieldOverrides */

/**
 * @param {string} engineId
 * @param {object} [def]
 */
export function resolvePromptPrefix(engineId, def = {}) {
    if (def.promptPrefix) {
        return def.promptPrefix;
    }
    if (engineId === "auto") {
        return "openai";
    }
    return engineId;
}

/**
 * @param {string} prefix
 */
export function enginePromptKeys(prefix) {
    return {
        customPromptKey: `${prefix}_custom_prompt`,
        systemPromptKey: `${prefix}_system_prompt`,
        userPromptKey: `${prefix}_user_prompt`,
        customHeadersKey: `${prefix}_custom_headers`,
        customPayloadKey: `${prefix}_custom_payload`,
    };
}

/**
 * @param {string} engineId
 */
export function engineSectionId(engineId) {
    return `${engineId}_section`;
}

/**
 * @param {string} engineId
 * @param {FieldOverrides} [overrides]
 */
export function openAiCompatFieldIds(engineId, overrides = {}) {
    const apiUrl = overrides.apiUrl ?? `${engineId}_api_url`;
    const apiKey = overrides.apiKey ?? `${engineId}_api_key`;
    const model = overrides.model ?? `${engineId}_model`;
    const customModel = overrides.customModel ?? `${engineId}_custom_model`;

    return {
        apiUrl,
        apiKey,
        model,
        customModel,
        apiUrlId: apiUrl,
        apiKeyId: apiKey,
        modelId: model,
        customModelId: customModel,
    };
}

/**
 * @param {object} raw
 */
export function hasDedicatedOptionsSection(raw) {
    const { id, kind } = raw;
    if (raw.sectionId === false) {
        return false;
    }
    if (raw.sectionId) {
        return true;
    }
    if (id === "deepl" || id === "deeplx" || id === "special_translate") {
        return true;
    }
    if (kind === "llm" && id !== "openai") {
        return true;
    }
    return false;
}

/**
 * @param {object} raw
 */
export function supportsPromptSettings(raw) {
    if (raw.promptPrefix === false) {
        return false;
    }
    const { id, kind } = raw;
    if (kind === "llm" || id === "auto" || id === "special_translate") {
        return true;
    }
    return false;
}

/**
 * Expands minimal registry entries with derived setting/UI keys.
 * @param {object} raw
 */
export function enrichEngineDefinition(raw) {
    const { id, kind, openaiCompat: openaiCompatRaw, ...rest } = raw;
    /** @type {Record<string, unknown>} */
    const enriched = { id, kind, ...rest };

    if (supportsPromptSettings(raw)) {
        Object.assign(enriched, enginePromptKeys(resolvePromptPrefix(id, raw)));
    }

    if (hasDedicatedOptionsSection(raw)) {
        enriched.sectionId = raw.sectionId || engineSectionId(id);
    }

    if (openaiCompatRaw) {
        enriched.openaiCompat = {
            ...openAiCompatFieldIds(id, openaiCompatRaw.fields),
            ...openaiCompatRaw,
        };
        delete enriched.openaiCompat.fields;
    }

    return enriched;
}
