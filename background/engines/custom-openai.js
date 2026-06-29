import {
    buildChatPromptParts,
    buildOpenAIStyleMessages,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload } from "./custom-payload.js";
import {
    parseSseJsonLine,
    extractChoiceDelta,
    streamChatToPort,
} from "./openai-compat-stream.js";
import {
    buildCustomOpenAIThinkingPatch,
    getThinkingEnabledByEngine,
} from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_CUSTOM_OPENAI_API_URL =
    "https://api.openai.com/v1/chat/completions";
const DEFAULT_CUSTOM_OPENAI_MODEL = "gpt-4o-mini";

function parseCustomOpenAIDeltaLine(line) {
    const payload = parseSseJsonLine(line);
    if (!payload) {
        return null;
    }
    const delta = extractChoiceDelta(payload);
    if (!delta) {
        return null;
    }
    const out = {};
    const thought = delta.reasoning_content || delta.reasoning;
    if (thought) {
        out.thought = thought;
    }
    if (delta.content) {
        out.content = delta.content;
    }
    return out;
}

export async function streamCustomOpenAITranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeOpenAICompatEndpoint(
        settings?.custom_openai_api_url,
        DEFAULT_CUSTOM_OPENAI_API_URL,
    );
    const apiKey = String(settings?.custom_openai_api_key || "").trim();
    const model = String(
        settings?.custom_openai_model || DEFAULT_CUSTOM_OPENAI_MODEL,
    ).trim();
    const showThoughts = getThinkingEnabledByEngine("custom_openai", settings);
    const promptParts = buildChatPromptParts(text, to, {
        glossaryTerms,
        legacyCustomPromptTemplate:
            request?.promptTemplates?.legacy || request?.customPromptTemplate,
        systemPromptTemplate: request?.promptTemplates?.system,
        userPromptTemplate: request?.promptTemplates?.user,
        context: request?.context,
    });

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    if (!apiKey) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置自定义 OpenAI 兼容 API 地址与 Key",
        );
        return;
    }

    const baseBody = {
        model,
        messages: buildOpenAIStyleMessages(promptParts),
        temperature: 1.0,
        stream: true,
    };

    const thinkingPatch = buildCustomOpenAIThinkingPatch({
        model,
        showThoughts,
        settings,
    });
    const primaryBody = {
        ...baseBody,
        ...thinkingPatch,
    };
    const { body: primaryBodyWithCustomPayload } = mergeCustomPayload(
        primaryBody,
        request?.customPayload,
    );
    const { body: fallbackBodyWithCustomPayload } = mergeCustomPayload(
        baseBody,
        request?.customPayload,
    );

    const { headers } = mergeCustomHeaders(
        {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        request?.customHeaders,
    );

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "自定义 OpenAI 兼容",
        requestStream: async (signal) => {
            const sendBody = (body) =>
                fetch(endpoint.url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(body),
                    signal,
                });

            let res = await sendBody(primaryBodyWithCustomPayload);

            if (!res.ok && Object.keys(thinkingPatch).length > 0) {
                const textErr = await res.text();
                const maybeUnsupportedThinking =
                    res.status === 400 &&
                    /(reasoning|thinking|unsupported|unknown|invalid)/i.test(
                        textErr || "",
                    );

                if (maybeUnsupportedThinking) {
                    res = await sendBody(fallbackBodyWithCustomPayload);
                } else {
                    return {
                        error: "自定义 OpenAI 兼容 请求失败: " + textErr,
                    };
                }
            }

            return { response: res };
        },
        parseLine: parseCustomOpenAIDeltaLine,
    });
}
