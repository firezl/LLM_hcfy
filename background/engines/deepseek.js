import { createOpenAICompatTranslate } from "./openai-compat-engine.js";

const DEFAULT_DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export const streamDeepSeekTranslate = createOpenAICompatTranslate({
    engine: "deepseek",
    errorPrefix: "DeepSeek",
    apiUrlKey: "deepseek_api_url",
    apiKeyKey: "deepseek_api_key",
    modelKey: "deepseek_model",
    defaultUrl: DEFAULT_DEEPSEEK_API_URL,
    defaultModel: DEFAULT_DEEPSEEK_MODEL,
    buildBody: ({ model, messages, showThoughts }) => ({
        model,
        messages,
        temperature: 1.0,
        stream: true,
        thinking: {
            type: showThoughts ? "enabled" : "disabled",
        },
    }),
});
