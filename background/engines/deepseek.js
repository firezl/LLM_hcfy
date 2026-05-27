import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { streamOpenAICompatRequest } from "./openai-compat-stream.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export async function streamDeepSeekTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.deepseek_api_url,
        DEFAULT_DEEPSEEK_API_URL,
    );
    const key = String(settings?.deepseek_api_key || "").trim();
    const model = String(
        settings?.deepseek_model || DEFAULT_DEEPSEEK_MODEL,
    ).trim();
    const showThoughts = getThinkingEnabledByEngine("deepseek", settings);
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
            "请在设置中配置 DeepSeek API 地址与 Key",
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

    await streamOpenAICompatRequest({
        requestId,
        port,
        state,
        url: endpoint.url,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body,
        errorPrefix: "DeepSeek",
    });
}
