import { createOpenAICompatTranslate } from "./openai-compat-engine.js";

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
    includeThoughts: ({ showThoughts }) => showThoughts,
    buildBody: ({ model, promptContent }) => ({
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        temperature: 1.0,
        stream: true,
    }),
});
