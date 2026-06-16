import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import { detectThinkingModelType } from "./thinking-utils.js";

const DEFAULT_SILICONFLOW_API_URL =
    "https://api.siliconflow.cn/v1/chat/completions";
const DEFAULT_SILICONFLOW_MODEL = "deepseek-ai/DeepSeek-V3";

export const streamSiliconFlowTranslate = createOpenAICompatTranslate({
    engine: "siliconflow",
    errorPrefix: "硅基流动",
    apiUrlKey: "siliconflow_api_url",
    apiKeyKey: "siliconflow_api_key",
    modelKey: "siliconflow_model",
    defaultUrl: DEFAULT_SILICONFLOW_API_URL,
    defaultModel: DEFAULT_SILICONFLOW_MODEL,
    missingKeyError:
        "请在设置中配置硅基流动 API Key（在 cloud.siliconflow.cn 获取）",
    thinkingModelTypeKey: "siliconflow_thinking_model_type",
    buildBody: ({ model, messages, showThoughts, thinkingModelType }) => {
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
        if (resolved !== "none") {
            body.thinking = {
                type: showThoughts ? "enabled" : "disabled",
            };
        }
        return body;
    },
});
