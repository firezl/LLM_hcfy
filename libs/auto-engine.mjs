/**
 * Auto engine candidate selection and configuration heuristics.
 */

import { LLM_ENGINE_IDS } from "./engine-registry.mjs";

/** @typedef {import("./engine-registry.mjs").EngineDefinition} EngineDefinition */

const TRADITIONAL_CONFIGURED_ENGINES = Object.freeze(["deepl", "deeplx"]);
const TRADITIONAL_FREE_ENGINES = Object.freeze(["google", "bing"]);

const AUTO_CANDIDATE_I18N_PREFIX = "options.engine.auto.candidate";

/**
 * @param {string} engineId
 * @returns {string}
 */
export function getAutoEngineDisplayI18nKey(engineId) {
    const id = String(engineId || "").trim();
    if (!id) {
        return "";
    }
    return `${AUTO_CANDIDATE_I18N_PREFIX}.${id}`;
}

/**
 * @param {object} [settings]
 * @returns {string}
 */
export function resolveAutoLlmEngine(settings) {
    const llmEngine = String(settings?.llm_engine || "openai").trim();
    return LLM_ENGINE_IDS.includes(llmEngine) ? llmEngine : "openai";
}

/**
 * Best-effort check using sync-visible settings (api keys may live in local storage).
 * @param {string} engineId
 * @param {object} [settings]
 */
export function isEngineLikelyConfigured(engineId, settings) {
    const id = String(engineId || "").trim();
    if (!id || id === "auto" || id === "browser") {
        return false;
    }
    if (id === "google" || id === "bing") {
        return true;
    }
    if (id === "openai") {
        return !!String(settings?.openai_api_url || "").trim();
    }
    if (id === "deepl") {
        return !!String(settings?.deepl_api_url || "").trim();
    }
    if (id === "deeplx") {
        return !!String(settings?.deeplx_api_url || "").trim();
    }
    if (LLM_ENGINE_IDS.includes(id)) {
        return !!String(settings?.[`${id}_api_url`] || "").trim();
    }
    return false;
}

/**
 * @param {object} [settings]
 */
export function isLlmAutoCandidate(settings) {
    return isEngineLikelyConfigured(resolveAutoLlmEngine(settings), settings);
}

/**
 * Ordered runtime candidates for auto mode.
 * @param {object} [settings]
 * @returns {string[]}
 */
export function buildAutoTranslateCandidates(settings) {
    /** @type {string[]} */
    const candidates = [];

    if (isLlmAutoCandidate(settings)) {
        candidates.push(resolveAutoLlmEngine(settings));
    }

    for (const engineId of TRADITIONAL_CONFIGURED_ENGINES) {
        if (isEngineLikelyConfigured(engineId, settings)) {
            candidates.push(engineId);
        }
    }

    for (const engineId of TRADITIONAL_FREE_ENGINES) {
        candidates.push(engineId);
    }

    candidates.push("browser");
    return candidates;
}

/**
 * First non-browser candidate for background routing edge cases.
 * @param {object} [settings]
 */
export function resolveAutoBackgroundEngine(settings) {
    for (const engineId of buildAutoTranslateCandidates(settings)) {
        if (engineId !== "browser") {
            return engineId;
        }
    }
    return "google";
}

/**
 * @param {object} [settings]
 */
export function getAutoPrimaryCandidate(settings) {
    const candidates = buildAutoTranslateCandidates(settings);
    return candidates[0] || "browser";
}
