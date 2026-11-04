import { DEFAULT_SETTINGS } from "../../libs/default-settings.mjs";
import { parseCustomPayload } from "./custom-payload.js";
import { createOpenAICompatTranslate } from "./openai-compat-engine.js";
import { streamOpenAICompatRequest } from "./openai-compat-stream.js";
import { isResponsesUrl, streamResponsesRequest } from "./responses-stream.js";
import { detectThinkingModelType, pickOpenAIReasoningEffort } from "./thinking-utils.js";

const LEGACY_GROK_URL = "https://api.x.ai/v1/chat/completions";

export const streamGrokTranslate = createOpenAICompatTranslate({
    engine: "grok",
    errorPrefix: "Grok",
    apiUrlKey: "grok_api_url",
    apiKeyKey: "grok_api_key",
    defaultUrl: DEFAULT_SETTINGS.grok_api_url,
    thinkingModelTypeKey: "grok_thinking_model_type",
    includeThoughts: ({ showThoughts }) => showThoughts,
    buildBody: ({ model, messages, showThoughts, thinkingModelType, settings }) => {
        const body = { model, messages, stream: true };
        const type = thinkingModelType === "auto"
            ? (/^grok-4\.[3-7]$/i.test(model) ? "openai_reasoning" : detectThinkingModelType(model))
            : thinkingModelType;
        if (type === "openai_reasoning") {
            body.reasoning_effort = showThoughts
                ? pickOpenAIReasoningEffort(settings?.grok_reasoning_effort, "medium")
                : /^grok-4\.[5-7]$/i.test(model) ? "low" : "none";
        } else if (type === "deepseek_style") {
            body.thinking = { type: showThoughts ? "enabled" : "disabled" };
        }
        return body;
    },
    streamRequest(options, { model, messages, showThoughts, customPayload }) {
        const migrateLegacy =
            options.url === LEGACY_GROK_URL &&
            /^grok-4\.[3-7]$/i.test(model) &&
            !Object.keys(parseCustomPayload(customPayload)).length;
        if (!migrateLegacy && !isResponsesUrl(options.url)) {
            return streamOpenAICompatRequest(options);
        }
        const effort = options.body.reasoning_effort;
        return streamResponsesRequest({
            ...options,
            url: migrateLegacy ? DEFAULT_SETTINGS.grok_api_url : options.url,
            model,
            messages,
            reasoning: effort && { effort },
            showThoughts,
            customPayload,
        });
    },
});
