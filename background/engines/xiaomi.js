import { createOpenAICompatTranslate } from "./openai-compat-engine.js";

const DEFAULT_XIAOMI_API_URL = "https://api.xiaomimimo.com/v1/chat/completions";
const DEFAULT_XIAOMI_MODEL = "mimo-v2.5";

export const streamXiaomiTranslate = createOpenAICompatTranslate({
    engine: "xiaomi",
    errorPrefix: "Xiaomi",
    apiUrlKey: "xiaomi_api_url",
    apiKeyKey: "xiaomi_api_key",
    modelKey: "xiaomi_model",
    defaultUrl: DEFAULT_XIAOMI_API_URL,
    defaultModel: DEFAULT_XIAOMI_MODEL,
    buildHeaders: (key) => ({
        "Content-Type": "application/json",
        "api-key": key,
        Authorization: `Bearer ${key}`,
    }),
    buildBody: ({ model, messages, showThoughts, settings }) => {
        const body = {
            model,
            messages,
            temperature: 1.0,
            stream: true,
            thinking: {
                type: showThoughts ? "enabled" : "disabled",
            },
        };

        const maxCompletionTokens = Number(
            settings?.xiaomi_max_completion_tokens,
        );
        if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
            body.max_completion_tokens = Math.floor(maxCompletionTokens);
        }

        return body;
    },
});
