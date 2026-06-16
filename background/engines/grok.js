import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import {
    detectThinkingModelType,
    pickOpenAIReasoningEffort,
} from "./thinking-utils.js";

const DEFAULT_GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-4.3";

export const streamGrokTranslate = createOpenAICompatTranslate({
    engine: "grok",
    errorPrefix: "Grok",
    apiUrlKey: "grok_api_url",
    apiKeyKey: "grok_api_key",
    modelKey: "grok_model",
    defaultUrl: DEFAULT_GROK_API_URL,
    defaultModel: DEFAULT_GROK_MODEL,
    thinkingModelTypeKey: "grok_thinking_model_type",
    includeThoughts: ({ showThoughts }) => showThoughts,
    buildBody: ({ model, messages, showThoughts, settings, thinkingModelType }) => {
        const body = {
            model,
            messages,
            temperature: 1.0,
            stream: true,
        };
        const resolved =
            thinkingModelType === "auto"
                ? detectThinkingModelType(model)
                : thinkingModelType;
        if (resolved === "openai_reasoning") {
            body.reasoning_effort = showThoughts
                ? pickOpenAIReasoningEffort(
                      settings?.grok_reasoning_effort,
                      "medium",
                  )
                : "none";
        } else if (resolved === "deepseek_style") {
            body.thinking = {
                type: showThoughts ? "enabled" : "disabled",
            };
        }
        return body;
    },
});
