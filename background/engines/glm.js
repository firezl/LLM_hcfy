import { createOpenAICompatTranslate } from "./openai-compat-engine.js";

const DEFAULT_GLM_API_URL =
    "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const DEFAULT_GLM_MODEL = "glm-5.1";

export const streamGLMTranslate = createOpenAICompatTranslate({
    engine: "glm",
    errorPrefix: "GLM",
    apiUrlKey: "glm_api_url",
    apiKeyKey: "glm_api_key",
    modelKey: "glm_model",
    defaultUrl: DEFAULT_GLM_API_URL,
    defaultModel: DEFAULT_GLM_MODEL,
    buildBody: ({ model, promptContent, showThoughts, settings }) => ({
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        stream: true,
        do_sample: false,
        thinking: {
            type: showThoughts ? "enabled" : "disabled",
            clear_thinking: settings?.glm_clear_thinking !== false,
        },
    }),
});
