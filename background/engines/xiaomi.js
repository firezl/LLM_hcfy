import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { streamOpenAICompatRequest } from "./openai-compat-stream.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_XIAOMI_API_URL = "https://api.xiaomimimo.com/v1/chat/completions";
const DEFAULT_XIAOMI_MODEL = "mimo-v2.5";

export async function streamXiaomiTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.xiaomi_api_url,
        DEFAULT_XIAOMI_API_URL,
    );
    const key = String(settings?.xiaomi_api_key || "").trim();
    const model = String(settings?.xiaomi_model || DEFAULT_XIAOMI_MODEL).trim();
    const showThoughts = getThinkingEnabledByEngine("xiaomi", settings);
    const promptContent = buildPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
    });

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    if (!key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 Xiaomi API 地址与 Key",
        );
        return;
    }

    const body = {
        model,
        messages: [
            {
                role: "user",
                content: promptContent,
            },
        ],
        temperature: 1.0,
        stream: true,
        thinking: {
            type: showThoughts ? "enabled" : "disabled",
        },
    };

    const maxCompletionTokens = Number(settings?.xiaomi_max_completion_tokens);
    if (Number.isFinite(maxCompletionTokens) && maxCompletionTokens > 0) {
        body.max_completion_tokens = Math.floor(maxCompletionTokens);
    }

    await streamOpenAICompatRequest({
        requestId,
        port,
        state,
        url: endpoint.url,
        headers: {
            "Content-Type": "application/json",
            "api-key": key,
            Authorization: `Bearer ${key}`,
        },
        body,
        errorPrefix: "Xiaomi",
    });
}
