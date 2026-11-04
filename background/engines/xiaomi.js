import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import { detectThinkingModelType } from "./thinking-utils.js";

const DEFAULT_XIAOMI_API_URL = "https://api.xiaomimimo.com/v1/chat/completions";

export const streamXiaomiTranslate = createOpenAICompatTranslate({
    engine: "xiaomi",
    errorPrefix: "Xiaomi",
    apiUrlKey: "xiaomi_api_url",
    apiKeyKey: "xiaomi_api_key",
    defaultUrl: DEFAULT_XIAOMI_API_URL,
    includeThoughts: ({ showThoughts }) => showThoughts,
    buildHeaders: (key, url) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(new URL(url).hostname !== "api.xiaomimimo.com" && { "api-key": key }),
    }),
    thinkingModelTypeKey: "xiaomi_thinking_model_type",
    buildBody: ({ model, messages, showThoughts, settings, thinkingModelType, url }) => {
        if (new URL(url).origin === "https://api.xiaomimimo.com") {
            if (model === "mimo-v2.5") model = "mimo-v2.6-flash";
            if (model === "mimo-v2.5-pro") model = "mimo-v2.6-pro";
        }
        const body = {
            model,
            messages,
            stream: true,
        };
        const resolved =
            thinkingModelType === "auto"
                ? detectThinkingModelType(model)
                : thinkingModelType;
        if (resolved !== "none") {
            body.thinking = {
                type: showThoughts ? "enabled" : "disabled",
            };
        }

        const maxCompletionTokens = Number(
            settings?.xiaomi_max_completion_tokens,
        );
        if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
            body.max_completion_tokens = Math.floor(maxCompletionTokens);
        }

        return body;
    },
});
