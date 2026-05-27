const OPENAI_REASONING_EFFORT_VALUES = new Set([
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
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
        normalizedModel.includes("thinking")
    );
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
    if (!supportsOpenAIReasoning(model)) {
        return patch;
    }

    if (showThoughts) {
        patch.reasoning_effort = pickOpenAIReasoningEffort(
            settings?.openai_reasoning_effort,
            "medium",
        );
    } else {
        patch.reasoning_effort = "none";
    }

    const maxCompletionTokens = Number(settings?.openai_max_completion_tokens);
    if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
        patch.max_completion_tokens = Math.floor(maxCompletionTokens);
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
    if (engine === "custom_openai") {
        return !!settings?.custom_openai_show_thoughts;
    }
    if (engine === "openrouter") {
        return !!settings?.openrouter_show_thoughts;
    }
    return !!settings?.show_thoughts;
}
