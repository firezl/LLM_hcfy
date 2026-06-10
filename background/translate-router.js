import {
    getCustomHeadersSettingKey,
    getCustomPayloadSettingKey,
    getCustomPromptSettingKey,
    getPromptSettingKeys,
    getTranslateHandlerKey,
    isContentOnlyEngine,
    resolveTranslateEngine,
} from "../libs/engine-registry.mjs";
import { postTranslateError } from "./port-utils.js";
import { getMatchedGlossaryTerms } from "./term.js";
import { TRANSLATE_HANDLERS } from "./translate-handlers.js";

const BROWSER_ENGINE_HINT =
    "浏览器 AI 翻译在网页内直接完成（无需后台）。请划词使用；若仍失败，请确认 Chrome/Edge 已启用 Translation API，或改用「大模型翻译」。";

export async function handleTranslateStart(message, port, state) {
    const engine = resolveTranslateEngine(message?.settings);
    const glossaryTerms = await getMatchedGlossaryTerms({
        from: message?.preferredFrom || message?.from,
        to: message?.preferredTo || message?.to,
        text: message?.text,
        enabled: message?.settings?.glossary_enabled !== false,
        maxTerms: 20,
    });

    const promptSettingKeys = getPromptSettingKeys(engine);
    const customPromptSettingKey = getCustomPromptSettingKey(engine);
    const customHeadersSettingKey = getCustomHeadersSettingKey(engine);
    const customPayloadSettingKey = getCustomPayloadSettingKey(engine);
    const legacyCustomPromptTemplate = customPromptSettingKey
        ? String(message?.settings?.[customPromptSettingKey] || "")
        : "";
    const systemPromptTemplate = promptSettingKeys.system
        ? String(message?.settings?.[promptSettingKeys.system] || "")
        : "";
    const userPromptTemplate = promptSettingKeys.user
        ? String(message?.settings?.[promptSettingKeys.user] || "")
        : "";
    const customHeaders = customHeadersSettingKey
        ? message?.settings?.[customHeadersSettingKey]
        : [];
    const customPayload = customPayloadSettingKey
        ? message?.settings?.[customPayloadSettingKey]
        : "";

    const requestWithGlossary = {
        ...message,
        glossaryTerms,
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
        postTranslateError(
            port,
            state,
            message.requestId,
            BROWSER_ENGINE_HINT,
        );
        return;
    }

    const handlerKey = getTranslateHandlerKey(engine);
    const handler = TRANSLATE_HANDLERS[handlerKey];
    if (!handler) {
        postTranslateError(
            port,
            state,
            message.requestId,
            `未支持的翻译引擎: ${engine}`,
        );
        return;
    }

    await handler(requestWithGlossary, port, state);
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
