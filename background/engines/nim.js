import { createOpenAICompatTranslate } from "./openai-compat-engine.js";

const DEFAULT_NIM_API_URL =
    "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_NIM_MODEL = "meta/llama-3.1-70b-instruct";
const DEFAULT_MAX_TOKENS = 4096;

export const streamNimTranslate = createOpenAICompatTranslate({
    engine: "nim",
    errorPrefix: "NVIDIA NIM",
    apiUrlKey: "nim_api_url",
    apiKeyKey: "nim_api_key",
    modelKey: "nim_model",
    defaultUrl: DEFAULT_NIM_API_URL,
    defaultModel: DEFAULT_NIM_MODEL,
    missingKeyError:
        "请在设置中配置 NVIDIA NIM API Key（在 build.nvidia.com 获取 nvapi- 密钥）",
    buildBody: ({ model, messages, settings }) => {
        const body = {
            model,
            messages,
            temperature: 0.2,
            stream: true,
            max_tokens: DEFAULT_MAX_TOKENS,
        };

        const maxTokens = Number(settings?.nim_max_tokens);
        if (Number.isFinite(maxTokens) && maxTokens > 0) {
            body.max_tokens = Math.floor(maxTokens);
        }

        return body;
    },
});
