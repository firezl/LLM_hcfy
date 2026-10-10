import { buildAutoTranslateCandidates } from "../libs/auto-engine.mjs";
import {
    getCustomHeadersSettingKey,
    getCustomPayloadSettingKey,
    getCustomPromptSettingKey,
    getPromptSettingKeys,
    getTranslateHandlerKey,
    isContentOnlyEngine,
    LLM_ENGINE_IDS,
} from "../libs/engine-registry.mjs";
import { sanitizeTranslateContext, resolveContextMode } from "../libs/context-collector.mjs";
import { postTranslateError, safePostMessage } from "./port-utils.js";
import { TRANSLATE_HANDLERS } from "./translate-handlers.js";
import { t } from "./i18n.js";

export const MESSAGE_TYPE_TRANSLATE_FALLBACK = "TRANSLATE_FALLBACK";
export const MESSAGE_TYPE_TRANSLATE_USE_BROWSER = "TRANSLATE_USE_BROWSER";
export const MESSAGE_TYPE_TRANSLATE_ENGINE_STARTED = "TRANSLATE_ENGINE_STARTED";

/**
 * @param {object} message
 * @param {object} settings
 * @param {string} engine
 * @param {object[]} glossaryTerms
 */
export function buildTranslateRequestForEngine(
    message,
    settings,
    engine,
    glossaryTerms,
) {
    const promptSettingKeys = getPromptSettingKeys(engine);
    const customPromptSettingKey = getCustomPromptSettingKey(engine);
    const customHeadersSettingKey = getCustomHeadersSettingKey(engine);
    const customPayloadSettingKey = getCustomPayloadSettingKey(engine);
    const legacyCustomPromptTemplate = customPromptSettingKey
        ? String(settings[customPromptSettingKey] || "")
        : "";
    const systemPromptTemplate = promptSettingKeys.system
        ? String(settings[promptSettingKeys.system] || "")
        : "";
    const userPromptTemplate = promptSettingKeys.user
        ? String(settings[promptSettingKeys.user] || "")
        : "";
    const customHeaders = customHeadersSettingKey
        ? settings[customHeadersSettingKey]
        : [];
    const customPayload = customPayloadSettingKey
        ? settings[customPayloadSettingKey]
        : "";

    const isLlm = LLM_ENGINE_IDS.includes(engine);
    const contextMode = resolveContextMode(settings);
    const context =
        contextMode !== "off" && isLlm && message?.context
            ? sanitizeTranslateContext(message.context, contextMode)
            : null;

    return {
        ...message,
        settings,
        glossaryTerms,
        context,
        customPromptTemplate: legacyCustomPromptTemplate,
        promptTemplates: {
            legacy: legacyCustomPromptTemplate,
            system: systemPromptTemplate,
            user: userPromptTemplate,
        },
        customHeaders,
        customPayload,
    };
}

function isAbortError(err) {
    return Boolean(err && err.name === "AbortError");
}

export function shouldStopAutoChain(state, requestId) {
    if (!state || state.connected === false) {
        return true;
    }
    return state.cancelled instanceof Set && state.cancelled.has(requestId);
}

/**
 * Run one background handler and resolve when TRANSLATE_DONE or TRANSLATE_ERROR is posted.
 * Errors are not forwarded to the real port.
 * A cancelled abort resolves as { ok: false, cancelled: true } instead of an empty response.
 *
 * @returns {Promise<{ ok: true } | { ok: false, cancelled: true } | { ok: false, error: string }>}
 */
export function tryTranslateHandlerOnce(handler, request, port, state) {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (result) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };

        const wrappedPort = {
            postMessage(msg) {
                if (!msg || settled) {
                    return;
                }
                if (msg.type === "TRANSLATE_ERROR") {
                    finish({
                        ok: false,
                        error: String(msg.error || t("common.unknownError")),
                    });
                    return;
                }
                if (msg.type === "TRANSLATE_DONE") {
                    safePostMessage(port, state, msg);
                    finish({ ok: true });
                    return;
                }
                safePostMessage(port, state, msg);
            },
        };

        const requestId = request?.requestId;

        void Promise.resolve(handler(request, wrappedPort, state))
            .then(() => {
                if (!settled) {
                    if (shouldStopAutoChain(state, requestId)) {
                        finish({ ok: false, cancelled: true });
                        return;
                    }
                    finish({
                        ok: false,
                        error: t("translate.router.emptyResponse"),
                    });
                }
            })
            .catch((err) => {
                if (isAbortError(err) && shouldStopAutoChain(state, requestId)) {
                    finish({ ok: false, cancelled: true });
                    return;
                }
                finish({
                    ok: false,
                    error: err && err.message ? err.message : String(err),
                });
            });
    });
}

/**
 * Execute auto-mode candidate chain in background; browser fallback is delegated to content.
 *
 * @param {object} message
 * @param {object} port
 * @param {object} state
 * @param {object} settings
 * @param {object[]} glossaryTerms
 */
export async function runAutoTranslateChain(
    message,
    port,
    state,
    settings,
    glossaryTerms,
) {
    const requestId = message?.requestId;
    const candidates = buildAutoTranslateCandidates(settings);
    let previousError = "";

    for (let index = 0; index < candidates.length; index += 1) {
        if (shouldStopAutoChain(state, requestId)) {
            return;
        }

        const engine = candidates[index];

        if (isContentOnlyEngine(engine)) {
            safePostMessage(port, state, {
                type: MESSAGE_TYPE_TRANSLATE_USE_BROWSER,
                requestId,
                previousError: previousError || undefined,
            });
            return;
        }

        if (index > 0) {
            safePostMessage(port, state, {
                type: MESSAGE_TYPE_TRANSLATE_FALLBACK,
                requestId,
                engine,
                previousError,
            });
        } else {
            safePostMessage(port, state, {
                type: MESSAGE_TYPE_TRANSLATE_ENGINE_STARTED,
                requestId,
                engine,
            });
        }

        const handlerKey = getTranslateHandlerKey(engine);
        const handler = TRANSLATE_HANDLERS[handlerKey];
        if (!handler) {
            previousError = t("translate.router.unsupportedEngine", { engine });
            continue;
        }

        const request = buildTranslateRequestForEngine(
            message,
            settings,
            engine,
            glossaryTerms,
        );
        const result = await tryTranslateHandlerOnce(
            handler,
            request,
            port,
            state,
        );
        if (result.cancelled || shouldStopAutoChain(state, requestId)) {
            return;
        }
        if (result.ok) {
            return;
        }
        previousError = result.error;
    }

    postTranslateError(
        port,
        state,
        requestId,
        previousError || t("translate.router.allAutoCandidatesFailed"),
    );
}
