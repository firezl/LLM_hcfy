import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { streamOpenAICompatRequest } from "./openai-compat-stream.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_GROK_API_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_GROK_MODEL = "grok-4.3";

export async function streamGrokTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.grok_api_url,
        DEFAULT_GROK_API_URL,
    );
    const key = String(settings?.grok_api_key || "").trim();
    const model = String(settings?.grok_model || DEFAULT_GROK_MODEL).trim();
    const showThoughts = getThinkingEnabledByEngine("grok", settings);
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
            "请在设置中配置 Grok API 地址与 Key",
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
        errorPrefix: "Grok",
        includeThoughts: showThoughts,
    });
}
