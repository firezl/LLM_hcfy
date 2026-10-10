import {
    buildChatPromptParts,
    buildOpenAIStyleMessages,
    resolveLanguagePair,
} from "../language.js";
import { t } from "../i18n.js";
import { postTranslateError } from "../port-utils.js";
import { mergeCustomHeaders } from "./custom-headers.js";
import { mergeCustomPayload } from "./custom-payload.js";
import { streamOpenAICompatRequest } from "./openai-compat-stream.js";
import { getThinkingEnabledByEngine, pickThinkingModelType } from "./thinking-utils.js";
import { normalizeOpenAICompatEndpoint } from "./url-utils.js";

/**
 * Builds a translate handler for an OpenAI-compatible chat completions API.
 *
 * Most providers (DeepSeek, GLM, Xiaomi, Grok, ...) only differ in their
 * default endpoint/model, the way thinking is toggled in the request body, and
 * a few extra headers. This factory captures that shape so each engine file is
 * just a small config object instead of duplicated boilerplate.
 *
 * @param {object} config
 * @param {string} config.engine            engine id used for thinking lookup
 * @param {string} config.errorPrefix       label shown in error messages
 * @param {string} [config.errorPrefixKey]  i18n key for the label, resolved per request
 * @param {string} config.apiUrlKey         settings key for the endpoint
 * @param {string} config.apiKeyKey         settings key for the API key
 * @param {string} config.modelKey          settings key for the model
 * @param {string} config.defaultUrl        fallback endpoint
 * @param {string} config.defaultModel      fallback model
 * @param {string} [config.missingKeyError] message when key is missing
 * @param {string} [config.missingKeyErrorKey] i18n key resolved per request
 * @param {(ctx: { model: string, promptContent: string, messages: object[], promptParts: object, showThoughts: boolean, settings: object }) => object} config.buildBody
 * @param {(key: string) => object} [config.buildHeaders]
 * @param {(ctx: { showThoughts: boolean }) => boolean} [config.includeThoughts]
 */
export function createOpenAICompatTranslate(config) {
    const {
        engine,
        errorPrefix,
        errorPrefixKey,
        apiUrlKey,
        apiKeyKey,
        modelKey,
        defaultUrl,
        defaultModel,
        missingKeyError,
        missingKeyErrorKey,
        buildBody,
        buildHeaders = (key) => ({
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        }),
        includeThoughts = () => true,
        thinkingModelTypeKey,
    } = config;

    return async function streamTranslate(request, port, state) {
        const { requestId, text, settings } = request;
        const { to } = resolveLanguagePair(request);
        const glossaryTerms = Array.isArray(request?.glossaryTerms)
            ? request.glossaryTerms
            : [];

        const endpoint = normalizeOpenAICompatEndpoint(
            settings?.[apiUrlKey],
            defaultUrl,
        );
        const key = String(settings?.[apiKeyKey] || "").trim();
        const model = String(settings?.[modelKey] || defaultModel).trim();
        const showThoughts = getThinkingEnabledByEngine(engine, settings);
        const thinkingModelType = thinkingModelTypeKey
            ? pickThinkingModelType(settings?.[thinkingModelTypeKey], "auto")
            : "auto";
        const promptParts = buildChatPromptParts(text, to, {
            glossaryTerms,
            legacyCustomPromptTemplate:
                request?.promptTemplates?.legacy ||
                request?.customPromptTemplate,
            systemPromptTemplate: request?.promptTemplates?.system,
            userPromptTemplate: request?.promptTemplates?.user,
            context: request?.context,
        });
        const messages = buildOpenAIStyleMessages(promptParts);

        if (!endpoint.ok) {
            postTranslateError(port, state, requestId, endpoint.error);
            return;
        }

        const resolvedPrefix = errorPrefixKey ? t(errorPrefixKey) : errorPrefix;
        if (!key) {
            postTranslateError(
                port,
                state,
                requestId,
                missingKeyErrorKey
                    ? t(missingKeyErrorKey)
                    : missingKeyError ||
                      t("translate.engine.missingCredentials", {
                          engine: resolvedPrefix,
                      }),
            );
            return;
        }

        const baseBody = buildBody({
            model,
            promptContent: promptParts.userPrompt,
            messages,
            promptParts,
            showThoughts,
            settings,
            thinkingModelType,
        });
        const { body } = mergeCustomPayload(
            baseBody,
            request?.customPayload,
        );
        const { headers } = mergeCustomHeaders(
            buildHeaders(key),
            request?.customHeaders,
        );

        await streamOpenAICompatRequest({
            requestId,
            port,
            state,
            url: endpoint.url,
            headers,
            body,
            errorPrefix: resolvedPrefix,
            includeThoughts: includeThoughts({ showThoughts }),
        });
    };
}
