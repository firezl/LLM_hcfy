const OPENAI_REASONING_EFFORT_VALUES = new Set([
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
]);

export const THINKING_MODEL_TYPES = new Set([
    "auto",
    "openai_reasoning",
    "deepseek_style",
    "qwen_style",
    "none",
]);

function normalizeModel(model) {
    return String(model || "")
        .trim()
        .toLowerCase();
}

export function supportsOpenAIReasoning(model) {
    const normalizedModel = normalizeModel(model);
    if (!normalizedModel) {
        return false;
    }
    return (
        /^o[0-9]/.test(normalizedModel) ||
        normalizedModel.startsWith("gpt-5") ||
        /^chatgpt-[0-9]/.test(normalizedModel) ||
        normalizedModel.includes("-reasoning")
    );
}

export function isLikelyQwenModel(model) {
    return /qwen/i.test(normalizeModel(model));
}

export function isLikelyGemmaThinkingModel(model) {
    const normalizedModel = normalizeModel(model);
    if (!normalizedModel) {
        return false;
    }
    if (
        normalizedModel === "translategemma" ||
        normalizedModel.startsWith("translategemma:")
    ) {
        return false;
    }
    return /^gemma/i.test(normalizedModel);
}

export function isLikelyDeepSeekStyleThinkingModel(model) {
    const normalizedModel = normalizeModel(model);
    if (!normalizedModel) {
        return false;
    }
    return (
        /^deepseek/i.test(normalizedModel) ||
        /^glm/i.test(normalizedModel) ||
        /^mimo/i.test(normalizedModel) ||
        /^kimi/i.test(normalizedModel)
    );
}

export function detectThinkingModelType(model) {
    if (supportsOpenAIReasoning(model)) {
        return "openai_reasoning";
    }
    if (isLikelyDeepSeekStyleThinkingModel(model)) {
        return "deepseek_style";
    }
    if (isLikelyQwenModel(model) || isLikelyGemmaThinkingModel(model)) {
        return "qwen_style";
    }
    return "none";
}

export function pickThinkingModelType(rawValue, fallback = "auto") {
    const value = String(rawValue || "").toLowerCase();
    if (THINKING_MODEL_TYPES.has(value)) {
        return value;
    }
    return fallback;
}

function isLikelyNonThinkingChatModel(model) {
    const normalizedModel = normalizeModel(model);
    if (!normalizedModel) {
        return true;
    }
    if (
        normalizedModel === "translategemma" ||
        normalizedModel.startsWith("translategemma:")
    ) {
        return true;
    }
    return (
        /^gpt-[34](?:$|[-./_])/i.test(normalizedModel) ||
        /^gpt-4o/i.test(normalizedModel) ||
        /^claude/i.test(normalizedModel) ||
        /^llama/i.test(normalizedModel) ||
        /^mistral/i.test(normalizedModel) ||
        /^phi(?:$|[-./_])/i.test(normalizedModel)
    );
}

function buildDeepSeekStyleThinkingPatch(showThoughts) {
    return {
        thinking: {
            type: showThoughts ? "enabled" : "disabled",
        },
    };
}

function buildQwenStyleThinkingPatch(showThoughts) {
    return {
        enable_thinking: showThoughts,
        chat_template_kwargs: {
            enable_thinking: showThoughts,
        },
    };
}

function shouldUseDeepSeekStyleThinkingFallback(model, showThoughts) {
    if (!showThoughts) {
        return false;
    }
    return !isLikelyNonThinkingChatModel(model);
}

function appendMaxCompletionTokens(patch, settings, settingsKey) {
    const maxCompletionTokens = Number(settings?.[settingsKey]);
    if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
        patch.max_completion_tokens = Math.floor(maxCompletionTokens);
    }
    return patch;
}

export function pickOpenAIReasoningEffort(rawValue, fallback) {
    const value = String(rawValue || "").toLowerCase();
    if (OPENAI_REASONING_EFFORT_VALUES.has(value)) {
        return value;
    }
    return fallback;
}

export function buildOpenAIThinkingPatch({ model, showThoughts, settings }) {
    const patch = {};
    const thinkingModelType = pickThinkingModelType(
        settings?.openai_thinking_model_type,
        "auto",
    );

    let resolvedType = thinkingModelType;
    if (resolvedType === "auto") {
        resolvedType = supportsOpenAIReasoning(model)
            ? "openai_reasoning"
            : "none";
    }

    if (resolvedType === "none") {
        return patch;
    }

    if (resolvedType === "openai_reasoning") {
        patch.reasoning_effort = showThoughts
            ? pickOpenAIReasoningEffort(
                  settings?.openai_reasoning_effort,
                  "medium",
              )
            : "none";

        const maxCompletionTokens = Number(
            settings?.openai_max_completion_tokens,
        );
        if (
            Number.isFinite(maxCompletionTokens) &&
            maxCompletionTokens > 0
        ) {
            patch.max_completion_tokens = Math.floor(maxCompletionTokens);
        }
    }

    return patch;
}

export function buildCustomOpenAIThinkingPatch({ model, showThoughts, settings }) {
    const patch = {};
    const thinkingModelType = pickThinkingModelType(
        settings?.custom_openai_thinking_model_type,
        "auto",
    );

    let resolvedType = thinkingModelType;
    if (resolvedType === "auto") {
        resolvedType = detectThinkingModelType(model);
    }

    if (resolvedType === "none") {
        return patch;
    }

    if (resolvedType === "openai_reasoning") {
        patch.reasoning_effort = showThoughts
            ? pickOpenAIReasoningEffort(
                  settings?.custom_openai_reasoning_effort,
                  "medium",
              )
            : "none";
        return appendMaxCompletionTokens(
            patch,
            settings,
            "custom_openai_max_completion_tokens",
        );
    }

    if (resolvedType === "deepseek_style") {
        return buildDeepSeekStyleThinkingPatch(showThoughts);
    }

    if (resolvedType === "qwen_style") {
        return buildQwenStyleThinkingPatch(showThoughts);
    }

    return patch;
}

export function getThinkingEnabledByEngine(engine, settings) {
    if (engine === "ollama") {
        return !!settings?.ollama_show_thoughts;
    }
    if (engine === "claude") {
        return !!settings?.claude_show_thoughts;
    }
    if (engine === "gemini") {
        return !!settings?.gemini_show_thoughts;
    }
    if (engine === "deepseek") {
        return !!settings?.deepseek_show_thoughts;
    }
    if (engine === "siliconflow") {
        return !!settings?.siliconflow_show_thoughts;
    }
    if (engine === "qwen") {
        return !!settings?.qwen_show_thoughts;
    }
    if (engine === "glm") {
        return !!settings?.glm_show_thoughts;
    }
    if (engine === "xiaomi") {
        return !!settings?.xiaomi_show_thoughts;
    }
    if (engine === "grok") {
        return !!settings?.grok_show_thoughts;
    }
    if (engine === "nim") {
        return !!settings?.nim_show_thoughts;
    }
    if (engine === "custom_openai") {
        return !!settings?.custom_openai_show_thoughts;
    }
    if (engine === "openrouter") {
        return !!settings?.openrouter_show_thoughts;
    }
    return !!settings?.show_thoughts;
}

/**
 * Resolves a thinking model type for OpenAI-compat engines.
 *
 * When the user sets a type explicitly (e.g. "deepseek_style", "none"),
 * that value is returned directly.  When the value is "auto" the
 * `autoDefault` callback is invoked with the model name so each engine
 * can decide its own auto-detect logic.
 *
 * @param {string | undefined} rawValue  settings[`${engine}_thinking_model_type`]
 * @param {string} model                 current model name
 * @param {(model: string) => string} autoDefault  returns resolved type for "auto"
 * @returns {string}  one of the THINKING_MODEL_TYPES values
 */
export function resolveCompatThinkingType(rawValue, model, autoDefault) {
    const type = pickThinkingModelType(rawValue, "auto");
    if (type !== "auto") {
        return type;
    }
    return typeof autoDefault === "function"
        ? autoDefault(model)
        : "none";
}
