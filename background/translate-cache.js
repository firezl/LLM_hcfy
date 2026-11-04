import { buildAutoTranslateCandidates } from "../libs/auto-engine.mjs";
import {
    sanitizeTranslateContext,
    resolveContextMode,
} from "../libs/context-collector.mjs";
import {
    getPromptSettingKeys,
    LLM_ENGINE_IDS,
} from "../libs/engine-registry.mjs";

const DEFAULT_MAX_ENTRIES = 200;

const MODEL_KEY_BY_ENGINE = {
    openai: "openai_model",
    custom_openai: "custom_openai_model",
    openrouter: "openrouter_model",
    deepseek: "deepseek_model",
    siliconflow: "siliconflow_model",
    qwen: "qwen_model",
    glm: "glm_model",
    xiaomi: "xiaomi_model",
    grok: "grok_model",
    nim: "nim_model",
    claude: "claude_model",
    gemini: "gemini_model",
    ollama: "ollama_model",
};

const CUSTOM_MODEL_KEY_BY_ENGINE = {
    openai: "openai_custom_model",
    custom_openai: "custom_openai_custom_model",
    openrouter: "openrouter_custom_model",
    deepseek: "deepseek_custom_model",
    siliconflow: "siliconflow_custom_model",
    qwen: "qwen_custom_model",
    glm: "glm_custom_model",
    xiaomi: "xiaomi_custom_model",
    grok: "grok_custom_model",
    nim: "nim_custom_model",
    claude: "claude_custom_model",
    gemini: "gemini_custom_model",
    ollama: "ollama_custom_model",
};

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function asText(value) {
    return value == null ? "" : String(value);
}

function resolveEffectiveModel(settings, engine) {
    const modelKey = MODEL_KEY_BY_ENGINE[engine];
    if (!modelKey) {
        return "";
    }
    const model = String(settings?.[modelKey] || "").trim();
    const customKey = CUSTOM_MODEL_KEY_BY_ENGINE[engine];
    if (model === "custom" && customKey) {
        return String(settings?.[customKey] || "").trim();
    }
    return model;
}

function promptTemplatesFor(settings, engine) {
    const keys = getPromptSettingKeys(engine);
    return {
        legacy: keys.legacy ? String(settings?.[keys.legacy] || "") : "",
        system: keys.system ? String(settings?.[keys.system] || "") : "",
        user: keys.user ? String(settings?.[keys.user] || "") : "",
    };
}

function glossaryForCache(terms) {
    if (!Array.isArray(terms)) {
        return [];
    }
    return terms.map((term) => ({
        sourceTerm: asText(term?.sourceTerm),
        targetTerm: asText(term?.targetTerm),
    }));
}

function requestContextForCache(message, settings, engine) {
    const mode = resolveContextMode(settings);
    if (mode === "off" || !message?.context) {
        return null;
    }
    const engines =
        engine === "auto" ? buildAutoTranslateCandidates(settings) : [engine];
    if (!engines.some((id) => LLM_ENGINE_IDS.includes(id))) {
        return null;
    }
    return sanitizeTranslateContext(message.context, mode);
}

function candidateProfiles(settings, engineIds) {
    return engineIds.map((id) => ({
        engine: id,
        model: resolveEffectiveModel(settings, id),
        prompts: promptTemplatesFor(settings, id),
    }));
}

/**
 * Stable cache identity. The requested engine stays "auto" when that was asked.
 * API keys are not included.
 *
 * @param {{ engine?: string, settings?: object, message?: object, glossaryTerms?: object[] }} input
 */
export function buildCacheMaterial({
    engine,
    settings,
    message,
    glossaryTerms,
} = {}) {
    const requestedEngine = asText(engine).trim() || "auto";
    const profiles =
        requestedEngine === "auto"
            ? candidateProfiles(settings, buildAutoTranslateCandidates(settings))
            : [];
    const usesGemini =
        requestedEngine === "gemini" || profiles.some(({ engine }) => engine === "gemini");
    return {
        engine: requestedEngine,
        model:
            requestedEngine === "auto"
                ? ""
                : resolveEffectiveModel(settings, requestedEngine),
        candidates: profiles,
        ...(usesGemini && {
            geminiThinking: {
                showThoughts: !!settings?.gemini_show_thoughts,
                level: asText(settings?.gemini_thinking_level),
                budget: asText(settings?.gemini_thinking_budget),
            },
        }),
        preferredFrom: asText(message?.preferredFrom),
        preferredTo: asText(message?.preferredTo),
        text: asText(message?.text),
        context: requestContextForCache(message, settings, requestedEngine),
        glossary: glossaryForCache(glossaryTerms),
        prompts:
            requestedEngine === "auto"
                ? profiles.map((item) => ({
                      engine: item.engine,
                      ...item.prompts,
                  }))
                : promptTemplatesFor(settings, requestedEngine),
    };
}

export async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function buildCacheKey(input) {
    return sha256Hex(stableStringify(buildCacheMaterial(input)));
}

export function createTranslateCache({ maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    const limit = Number.isFinite(maxEntries) && maxEntries > 0
        ? Math.floor(maxEntries)
        : DEFAULT_MAX_ENTRIES;
    const entries = new Map();

    return {
        get(key) {
            if (!entries.has(key)) {
                return undefined;
            }
            const value = entries.get(key);
            entries.delete(key);
            entries.set(key, value);
            return value;
        },
        set(key, value) {
            const text = asText(value?.text);
            const engineName = asText(value?.engine).trim();
            if (!text.trim() || !engineName) {
                return false;
            }
            if (entries.has(key)) {
                entries.delete(key);
            }
            const thought = engineName === "gemini" ? asText(value?.thought) : "";
            entries.set(key, { engine: engineName, text, ...(thought && { thought }) });
            while (entries.size > limit) {
                const oldest = entries.keys().next().value;
                entries.delete(oldest);
            }
            return true;
        },
        clear() {
            entries.clear();
        },
        get size() {
            return entries.size;
        },
    };
}

export const translateCache = createTranslateCache();

export function lookupCacheEntry(cache, key, bypassCache) {
    if (bypassCache === true || !cache || key == null) {
        return undefined;
    }
    return cache.get(key);
}

/**
 * Replay a hit without calling upstream.
 * Sends nothing when the request is already cancelled or the port is disconnected.
 */
export function postCachedTranslation(port, state, requestId, entry) {
    if (!entry || !port || typeof port.postMessage !== "function") {
        return false;
    }
    if (state?.connected === false) {
        return false;
    }
    if (state?.cancelled instanceof Set && state.cancelled.has(requestId)) {
        return false;
    }
    const text = asText(entry.text);
    const engineName = asText(entry.engine).trim();
    if (!text.trim() || !engineName) {
        return false;
    }
    const messages = [
        { type: "TRANSLATE_ENGINE_STARTED", requestId, engine: engineName },
        { type: "TRANSLATE_CHUNK", requestId, content: text },
        { type: "TRANSLATE_DONE", requestId },
    ];
    if (engineName === "gemini" && entry.thought) {
        messages.splice(1, 0, {
            type: "TRANSLATE_THOUGHT",
            requestId,
            content: entry.thought,
        });
    }
    try {
        for (const message of messages) {
            port.postMessage(message);
        }
    } catch (_err) {
        if (state) {
            state.connected = false;
        }
        return false;
    }
    return true;
}

/**
 * Forward port messages and remember a completed translation.
 * TRANSLATE_ERROR and TRANSLATE_USE_BROWSER never store a result.
 * A cancel that never posts TRANSLATE_DONE leaves the partial text uncached.
 */
export function createCachingPort(realPort, options = {}) {
    const onResult = typeof options.onResult === "function" ? options.onResult : null;
    let engine = asText(options.initialEngine).trim();
    let text = "";
    let thought = "";
    let skipStore = false;

    return {
        postMessage(message) {
            if (message && typeof message === "object") {
                const type = message.type;
                if (
                    type === "TRANSLATE_ENGINE_STARTED" ||
                    type === "TRANSLATE_FALLBACK"
                ) {
                    engine = asText(message.engine).trim();
                    text = "";
                    thought = "";
                } else if (type === "TRANSLATE_CHUNK") {
                    text += asText(message.content);
                } else if (type === "TRANSLATE_THOUGHT" && engine === "gemini") {
                    thought += asText(message.content);
                } else if (
                    type === "TRANSLATE_USE_BROWSER" ||
                    type === "TRANSLATE_ERROR"
                ) {
                    skipStore = true;
                } else if (type === "TRANSLATE_DONE") {
                    if (!skipStore && engine && text.trim() && onResult) {
                        try {
                            onResult({ engine, text, ...(thought && { thought }) });
                        } catch (_err) {
                            // Cache bookkeeping must not block the real port.
                        }
                    }
                    skipStore = true;
                }
            }
            if (realPort && typeof realPort.postMessage === "function") {
                realPort.postMessage(message);
            }
        },
    };
}
