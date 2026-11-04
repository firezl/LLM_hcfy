import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import { detectThinkingModelType } from "./thinking-utils.js";

const DEFAULT_GLM_API_URL =
    "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export const streamGLMTranslate = createOpenAICompatTranslate({
    engine: "glm",
    errorPrefix: "GLM",
    apiUrlKey: "glm_api_url",
    apiKeyKey: "glm_api_key",
    defaultUrl: DEFAULT_GLM_API_URL,
    includeThoughts: ({ showThoughts }) => showThoughts,
    thinkingModelTypeKey: "glm_thinking_model_type",
    buildBody: ({ model, messages, showThoughts, settings, thinkingModelType }) => {
        const body = {
            model,
            messages,
            stream: true,
            do_sample: false,
        };
        const resolved =
            thinkingModelType === "auto"
                ? detectThinkingModelType(model)
                : thinkingModelType;
        if (/^glm-5\.3(?:-|$)/i.test(model)) {
            body.thinking = { type: "enabled" };
            body.reasoning_effort = showThoughts ? "high" : "low";
            delete body.do_sample;
        } else if (resolved !== "none") {
            body.thinking = {
                type: showThoughts ? "enabled" : "disabled",
                clear_thinking: settings?.glm_clear_thinking !== false,
            };
        }
        return body;
    },
});
