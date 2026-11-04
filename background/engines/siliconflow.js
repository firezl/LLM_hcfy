import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import { detectThinkingModelType } from "./thinking-utils.js";

const DEFAULT_SILICONFLOW_API_URL =
    "https://api.siliconflow.cn/v1/chat/completions";

export const streamSiliconFlowTranslate = createOpenAICompatTranslate({
    engine: "siliconflow",
    errorPrefixKey: "translate.engineName.siliconflow",
    apiUrlKey: "siliconflow_api_url",
    apiKeyKey: "siliconflow_api_key",
    defaultUrl: DEFAULT_SILICONFLOW_API_URL,
    includeThoughts: ({ showThoughts }) => showThoughts,
    missingKeyErrorKey: "translate.engine.siliconflow.missingKey",
    thinkingModelTypeKey: "siliconflow_thinking_model_type",
    buildBody: ({ model, messages, showThoughts, thinkingModelType, url }) => {
        const body = {
            model,
            messages,
            temperature: 1.0,
            stream: true,
        };
        const modelName = model.split("/").at(-1);
        const resolved =
            thinkingModelType === "auto"
                ? detectThinkingModelType(modelName)
                : thinkingModelType;
        if (resolved !== "none") {
            const official = /^api\.siliconflow\.(cn|com)$/.test(new URL(url).hostname);
            if (official || resolved === "qwen_style") {
                body.enable_thinking = showThoughts;
            } else {
                body.thinking = { type: showThoughts ? "enabled" : "disabled" };
            }
        }
        return body;
    },
});
