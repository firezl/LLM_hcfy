import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { streamOpenAICompatRequest } from "./openai-compat-stream.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_GLM_API_URL =
    "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const DEFAULT_GLM_MODEL = "glm-5.1";

export async function streamGLMTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.glm_api_url,
        DEFAULT_GLM_API_URL,
    );
    const key = String(settings?.glm_api_key || "").trim();
    const model = String(settings?.glm_model || DEFAULT_GLM_MODEL).trim();
    const showThoughts = getThinkingEnabledByEngine("glm", settings);
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
            "请在设置中配置 GLM API 地址与 Key",
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
        stream: true,
        do_sample: false,
        thinking: {
            type: showThoughts ? "enabled" : "disabled",
            clear_thinking: settings?.glm_clear_thinking !== false,
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
        errorPrefix: "GLM",
    });
}
