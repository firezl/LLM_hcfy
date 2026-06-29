import {
    buildChatPromptParts,
    buildOpenAIStyleMessages,
    resolveLanguagePair,
} from "../language.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload } from "./custom-payload.js";
import { streamChatToPort } from "./openai-compat-stream.js";
import { getThinkingEnabledByEngine } from "./thinking-utils.js";
import { normalizeFixedHttpEndpoint } from "./url-utils.js";

const DEFAULT_QWEN_API_URL =
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const DEFAULT_QWEN_MODEL = "qwen3.5-plus";

function parseQwenStreamLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
        return null;
    }

    const payload = trimmed.startsWith("data:")
        ? trimmed.substring(5).trim()
        : trimmed;
    if (!payload || payload === "[DONE]") {
        return null;
    }

    try {
        return JSON.parse(payload);
    } catch (err) {
        return null;
    }
}

function parseQwenDeltaLine(line) {
    const payload = parseQwenStreamLine(line);
    if (!payload) {
        return null;
    }
    // Check for error payload
    if (payload.code && payload.message) {
        throw new Error(`${payload.code}: ${payload.message}`);
    }
    if (payload.error) {
        throw new Error(payload.error.message || JSON.stringify(payload.error));
    }
    // Check for native DashScope format
    if (payload?.output?.choices?.[0]?.message) {
        const message = payload.output.choices[0].message;
        return {
            content: String(message.content || ""),
            thought: String(message.reasoning_content || ""),
        };
    }
    // Check for OpenAI compatible format
    if (payload?.choices?.[0]?.delta) {
        const delta = payload.choices[0].delta;
        return {
            content: String(delta.content || ""),
            thought: String(delta.reasoning_content || ""),
        };
    }
    return null;
}

export async function streamQwenTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];

    const endpoint = normalizeFixedHttpEndpoint(
        settings?.qwen_api_url,
        DEFAULT_QWEN_API_URL,
        {
            preferredProtocol: "https",
            errorPrefix: "Qwen ",
            endpointPath: "/compatible-mode/v1/chat/completions",
            suffixOnVersionBase: "/chat/completions",
            endpointMatchers: [/\/chat\/completions$/i, /\/text-generation\/generation$/i],
        },
    );
    const key = String(settings?.qwen_api_key || "").trim();
    const model = String(settings?.qwen_model || DEFAULT_QWEN_MODEL).trim();
    const showThoughts = getThinkingEnabledByEngine("qwen", settings);
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

    if (endpoint.url.includes("dashscope") && endpoint.url.includes("/api/v1/services/aigc/text-generation/generation")) {
        endpoint.url = endpoint.url.replace("/api/v1/services/aigc/text-generation/generation", "/compatible-mode/v1/chat/completions");
    }

    if (!key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 Qwen API 地址与 Key",
        );
        return;
    }

    const isCompatibleMode = endpoint.url.includes("/compatible-mode/") || endpoint.url.includes("/chat/completions");

    let baseBody;
    if (isCompatibleMode) {
        baseBody = {
            model,
            messages: buildOpenAIStyleMessages(promptParts),
            stream: true,
            enable_thinking: showThoughts,
        };
        const thinkingBudget = Number(settings?.qwen_thinking_budget);
        if (showThoughts && Number.isFinite(thinkingBudget) && thinkingBudget > 0) {
            baseBody.thinking_budget = Math.floor(thinkingBudget);
        }
    } else {
        const parameters = {
            result_format: "message",
            incremental_output: true,
            stream: true,
            enable_thinking: showThoughts,
        };
        const thinkingBudget = Number(settings?.qwen_thinking_budget);
        if (showThoughts && Number.isFinite(thinkingBudget) && thinkingBudget > 0) {
            parameters.thinking_budget = Math.floor(thinkingBudget);
        }
        if (showThoughts) {
            parameters.preserve_thinking = !!settings?.qwen_preserve_thinking;
        }
        baseBody = {
            model,
            input: {
                messages: buildOpenAIStyleMessages(promptParts),
            },
            parameters,
        };
    }

    const { body } = mergeCustomPayload(baseBody, request?.customPayload);

    await streamChatToPort({
        requestId,
        port,
        state,
        errorPrefix: "Qwen",
        requestStream: async (signal) => ({
            response: await fetch(endpoint.url, {
                method: "POST",
                headers: mergeCustomHeaders(
                    {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${key}`,
                        Accept: "text/event-stream",
                    },
                    request?.customHeaders,
                ).headers,
                body: JSON.stringify(body),
                signal,
            }),
        }),
        parseLine: parseQwenDeltaLine,
    });
}
