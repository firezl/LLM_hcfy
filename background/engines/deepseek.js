import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import { detectThinkingModelType } from "./thinking-utils.js";

const DEFAULT_DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export const streamDeepSeekTranslate = createOpenAICompatTranslate({
    engine: "deepseek",
    errorPrefix: "DeepSeek",
    apiUrlKey: "deepseek_api_url",
    apiKeyKey: "deepseek_api_key",
    defaultUrl: DEFAULT_DEEPSEEK_API_URL,
    includeThoughts: ({ showThoughts }) => showThoughts,
    thinkingModelTypeKey: "deepseek_thinking_model_type",
    buildBody: ({ model, messages, showThoughts, thinkingModelType, url }) => {
        if (
            new URL(url).origin === "https://api.deepseek.com" &&
            ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"].includes(model)
        ) {
            model = "deepseek-flash";
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
        return body;
    },
});
