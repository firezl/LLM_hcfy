import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import { detectThinkingModelType, pickOpenAIReasoningEffort } from "./thinking-utils.js";
import { DEFAULT_MODELS } from "../../libs/default-settings.mjs";

const DEFAULT_NIM_API_URL =
    "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MAX_TOKENS = 4096;

export const streamNimTranslate = createOpenAICompatTranslate({
    engine: "nim",
    errorPrefix: "NVIDIA NIM",
    apiUrlKey: "nim_api_url",
    apiKeyKey: "nim_api_key",
    defaultUrl: DEFAULT_NIM_API_URL,
    includeThoughts: ({ showThoughts }) => showThoughts,
    thinkingModelTypeKey: "nim_thinking_model_type",
    missingKeyErrorKey: "translate.engine.nim.missingKey",
    buildBody: ({ model, messages, settings, showThoughts, thinkingModelType, url }) => {
        if (
            model === "meta/llama-3.1-70b-instruct" &&
            new URL(url).origin === "https://integrate.api.nvidia.com"
        ) {
            model = DEFAULT_MODELS.nim;
        }
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

        const resolved =
            thinkingModelType === "auto"
                ? detectThinkingModelType(model)
                : thinkingModelType;
        if (resolved === "deepseek_style") {
            body.thinking = {
                type: showThoughts ? "enabled" : "disabled",
            };
        } else if (resolved === "openai_reasoning") {
            body.reasoning_effort = showThoughts
                ? pickOpenAIReasoningEffort(
                      settings?.nim_reasoning_effort,
                      "medium",
                  )
                : "none";
        }

        return body;
    },
});
