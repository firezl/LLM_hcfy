import {
    buildChatPromptParts,
    buildOpenAIStyleMessages,
    resolveLanguagePair,
} from "../language.js";
import { t, tDetail } from "../i18n.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload, parseCustomPayload } from "./custom-payload.js";
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
import { isResponsesUrl, streamResponsesRequest } from "./responses-stream.js";
import { resolveConfiguredModel } from "../../libs/default-settings.mjs";

const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

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
    const key = String(settings?.openai_api_key || "").trim();

    if (!endpoint.ok) {
        postTranslateError(port, state, requestId, endpoint.error);
        return;
    }

    if (!key) {
        postTranslateError(
            port,
            state,
            requestId,
            t("translate.engine.openai.missingKey"),
        );
        return;
    }

    const model = resolveConfiguredModel(settings, "openai");
    const showThoughts = getThinkingEnabledByEngine("openai", settings);
    const promptParts = buildChatPromptParts(text, to, {
        glossaryTerms,
        legacyCustomPromptTemplate:
            request?.promptTemplates?.legacy || request?.customPromptTemplate,
        systemPromptTemplate: request?.promptTemplates?.system,
        userPromptTemplate: request?.promptTemplates?.user,
        context: request?.context,
    });

    if (!model) {
        postTranslateError(port, state, requestId, t("translate.engine.openai.missingModel"));
        return;
    }

    const baseBody = {
        model,
        messages: buildOpenAIStyleMessages(promptParts),
        stream: true,
    };

    const thinkingPatch = buildOpenAIThinkingPatch({
        model,
        showThoughts,
        settings,
    });
    const { headers } = mergeCustomHeaders(
        {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        request?.customHeaders,
    );

    const useOfficialResponses =
        endpoint.url === DEFAULT_OPENAI_API_URL &&
        !Object.keys(parseCustomPayload(request?.customPayload)).length &&
        (/^gpt-6/i.test(model) ||
            (!String(settings?.openai_api_url || "").trim() && /^gpt-5/i.test(model)));
    if (useOfficialResponses || isResponsesUrl(endpoint.url)) {
        const effort = thinkingPatch.reasoning_effort;
        return streamResponsesRequest({
            requestId,
            port,
            state,
            url: useOfficialResponses ? OPENAI_RESPONSES_URL : endpoint.url,
            headers,
            model,
            messages: baseBody.messages,
            reasoning: effort && {
                effort,
                ...(showThoughts && effort !== "none" && { summary: "auto" }),
            },
            maxOutputTokens: Number(settings?.openai_max_completion_tokens),
            showThoughts,
            customPayload: request?.customPayload,
            errorPrefix: "OpenAI",
        });
    }

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
                        error: tDetail("translate.engine.openai.requestFailed", {
                            error: textErr,
                        }),
                    };
                }
            }

            return { response: res };
        },
        parseLine: parseOpenAIDeltaLine,
    });
}
