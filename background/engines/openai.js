import {
    buildPromptWithUserTemplate,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import {
    parseSseJsonLine,
    extractChoiceDelta,
    streamChatToPort,
} from "./openai-compat-stream.js";
import {
    buildOpenAIThinkingPatch,
    getThinkingEnabledByEngine,
} from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

function parseOpenAIDeltaLine(line) {
    const payload = parseSseJsonLine(line);
    if (!payload) {
        return null;
    }
    const delta = extractChoiceDelta(payload);
    if (!delta) {
        return null;
    }
    const out = {};
    if (delta.content) {
        out.content = delta.content;
    }
    if (delta.reasoning_content) {
        out.thought = delta.reasoning_content;
    }
    return out;
}

export async function streamOpenAITranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];
    const endpoint = normalizeOpenAICompatEndpoint(
        settings.openai_api_url,
        DEFAULT_OPENAI_API_URL,
    );
    const key = settings.openai_api_key;

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    if (!key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 OpenAI API 地址与 Key",
        );
        return;
    }

    const model = String(
        settings.openai_model ||
            settings.openai_thinking_model ||
            "gpt-5.4-mini",
    ).trim();
    const showThoughts = getThinkingEnabledByEngine("openai", settings);
    const promptContent = buildPromptWithUserTemplate(text, to, {
        glossaryTerms,
        customPromptTemplate: request?.customPromptTemplate,
    });

    if (!model) {
        postTranslateError(port, state, requestId, "请先配置 OpenAI 模型");
        return;
    }

    const baseBody = {
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

    const thinkingPatch = buildOpenAIThinkingPatch({
        model,
        showThoughts,
        settings,
    });

    const primaryBody = {
        ...baseBody,
        ...thinkingPatch,
    };

    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
    };

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "OpenAI",
        requestStream: async (signal) => {
            const sendBody = (body) =>
                fetch(endpoint.url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(body),
                    signal,
                });

            let res = await sendBody(primaryBody);

            if (!res.ok && Object.keys(thinkingPatch).length > 0) {
                const textErr = await res.text();
                const maybeUnsupportedThinking =
                    res.status === 400 &&
                    /(reasoning|thinking|unsupported|unknown|invalid)/i.test(
                        textErr || "",
                    );

                if (maybeUnsupportedThinking) {
                    res = await sendBody(baseBody);
                } else {
                    return { error: "OpenAI 请求失败: " + textErr };
                }
            }

            return { response: res };
        },
        parseLine: parseOpenAIDeltaLine,
    });
}
