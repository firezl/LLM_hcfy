import {
    getCustomHeadersSettingKey,
    getCustomPayloadSettingKey,
    getCustomPromptSettingKey,
    getPromptSettingKeys,
    getTranslateHandlerKey,
    isContentOnlyEngine,
    LLM_ENGINE_IDS,
    resolveTranslateEngine,
} from "../libs/engine-registry.mjs";
import { sanitizeTranslateContext, resolveContextMode } from "../libs/context-collector.mjs";
import { postTranslateError } from "./port-utils.js";
import { getMatchedGlossaryTerms } from "./term.js";
import { TRANSLATE_HANDLERS } from "./translate-handlers.js";
import { getSettings } from "./settings-cache.js";

const BROWSER_ENGINE_HINT =
    "浏览器 AI 翻译在网页内直接完成（无需后台）。请划词使用；若仍失败，请确认 Chrome/Edge 已启用 Translation API，或改用「大模型翻译」。";

export async function handleTranslateStart(message, port, state) {
    const requestId = message?.requestId;
    try {
        // settings/Key 由后台缓存作为权威来源，不信任 content script 传来的 settings，
        // 防止恶意网页篡改 endpoint/prompt/headers/key 外泄凭据。
        const settings = await getSettings();
        const engine = message?.engine
            ? String(message.engine).trim()
            : resolveTranslateEngine(settings);
        const glossaryTerms = await getMatchedGlossaryTerms({
            from: message?.preferredFrom || message?.from,
            to: message?.preferredTo || message?.to,
            text: message?.text,
            enabled: settings.glossary_enabled !== false,
            maxTerms: 20,
        });

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

        const isLlm =
            engine === "auto" || LLM_ENGINE_IDS.includes(engine);
        const contextMode = resolveContextMode(settings);
        const context =
            contextMode !== "off" && isLlm && message?.context
                ? sanitizeTranslateContext(message.context, contextMode)
                : null;

        const requestWithGlossary = {
            ...message,
            // 覆盖 message 中可能存在的 settings（content 不再发送，但即便发送也不采信）。
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

        if (isContentOnlyEngine(engine)) {
            postTranslateError(port, state, requestId, BROWSER_ENGINE_HINT);
            return;
        }

        const handlerKey = getTranslateHandlerKey(engine);
        const handler = TRANSLATE_HANDLERS[handlerKey];
        if (!handler) {
            postTranslateError(
                port,
                state,
                requestId,
                `未支持的翻译引擎: ${engine}`,
            );
            return;
        }

        await handler(requestWithGlossary, port, state);
    } catch (err) {
        // 任何前置异常（如 settings 缓存加载失败）都回传明确错误，
        // 避免 content 端静默等待超时（曾表现为"需点两次才翻译"）。
        const errMessage = err && err.message ? err.message : String(err);
        postTranslateError(port, state, requestId, `翻译初始化失败: ${errMessage}`);
    }
}

export async function handleTestConnection(message) {
    const { engine, settings } = message;
    const handlerKey = getTranslateHandlerKey(engine);
    const handler = TRANSLATE_HANDLERS[handlerKey];
    if (!handler) {
        return { ok: false, error: `未支持的测试引擎: ${engine}` };
    }

    const requestId = "connection-test-" + Date.now();
    const request = {
        requestId,
        text: "Hello",
        from: "en",
        to: "zh",
        settings,
        glossaryTerms: [],
        customPromptTemplate: "",
        promptTemplates: {
            legacy: "",
            system: "",
            user: "",
        },
        customHeaders: [],
        customPayload: "",
    };

    const responseChunks = [];
    let responseError = null;
    let resolvePromise;
    const promise = new Promise((resolve) => {
        resolvePromise = resolve;
    });

    const mockPort = {
        postMessage(msg) {
            if (!msg) return;
            if (msg.type === "TRANSLATE_CHUNK") {
                responseChunks.push(msg.content);
            } else if (msg.type === "TRANSLATE_ERROR") {
                responseError = msg.error;
                resolvePromise();
            } else if (msg.type === "TRANSLATE_DONE") {
                resolvePromise();
            }
        }
    };

    const mockState = {
        connected: true,
        controllers: new Map()
    };

    const timeoutId = setTimeout(() => {
        if (mockState.connected) {
            const controller = mockState.controllers.get(requestId);
            if (controller) {
                controller.abort();
            }
            responseError = "连接测试超时 (15s)";
            resolvePromise();
        }
    }, 15000);

    try {
        await handler(request, mockPort, mockState);
    } catch (err) {
        responseError = err && err.message ? err.message : String(err);
        resolvePromise();
    }

    clearTimeout(timeoutId);
    await promise;

    if (responseError) {
        return { ok: false, error: responseError };
    }
    return { ok: true };
}
