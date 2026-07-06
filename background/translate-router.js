import { buildAutoTranslateCandidates } from "../libs/auto-engine.mjs";
import {
    getTranslateHandlerKey,
    isContentOnlyEngine,
    resolveTranslateEngine,
} from "../libs/engine-registry.mjs";
import { postTranslateError } from "./port-utils.js";
import { getMatchedGlossaryTerms } from "./term.js";
import { TRANSLATE_HANDLERS } from "./translate-handlers.js";
import { getSettings } from "./settings-cache.js";
import { t } from "./i18n.js";
import {
    buildTranslateRequestForEngine,
    runAutoTranslateChain,
    tryTranslateHandlerOnce,
} from "./auto-translate-chain.js";

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

        if (engine === "auto") {
            await runAutoTranslateChain(
                message,
                port,
                state,
                settings,
                glossaryTerms,
            );
            return;
        }

        const requestWithGlossary = buildTranslateRequestForEngine(
            message,
            settings,
            engine,
            glossaryTerms,
        );

        if (isContentOnlyEngine(engine)) {
            postTranslateError(
                port,
                state,
                requestId,
                t("translate.router.browserHint"),
            );
            return;
        }

        const handlerKey = getTranslateHandlerKey(engine);
        const handler = TRANSLATE_HANDLERS[handlerKey];
        if (!handler) {
            postTranslateError(
                port,
                state,
                requestId,
                t("translate.router.unsupportedEngine", { engine }),
            );
            return;
        }

        await handler(requestWithGlossary, port, state);
    } catch (err) {
        // 任何前置异常（如 settings 缓存加载失败）都回传明确错误，
        // 避免 content 端静默等待超时（曾表现为"需点两次才翻译"）。
        const errMessage = err && err.message ? err.message : String(err);
        postTranslateError(
            port,
            state,
            requestId,
            t("translate.router.initFailed", { error: errMessage }),
        );
    }
}

async function runSingleEngineConnectionTest(engine, settings) {
    const handlerKey = getTranslateHandlerKey(engine);
    const handler = TRANSLATE_HANDLERS[handlerKey];
    if (!handler) {
        return {
            ok: false,
            error: t("translate.router.unsupportedTestEngine", { engine }),
        };
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

    const mockPort = {
        postMessage() {},
    };
    const mockState = {
        connected: true,
        controllers: new Map(),
    };

    const result = await Promise.race([
        tryTranslateHandlerOnce(handler, request, mockPort, mockState),
        new Promise((resolve) => {
            setTimeout(
                () =>
                    resolve({
                        ok: false,
                        error: t("translate.router.testTimeout"),
                    }),
                15000,
            );
        }),
    ]);

    if (result.ok) {
        return { ok: true };
    }
    return { ok: false, error: result.error };
}

export async function handleTestConnection(message) {
    const engine = String(message?.engine || "").trim();
    const settings = message?.settings || {};

    if (engine === "auto") {
        const candidates = buildAutoTranslateCandidates(settings);
        let lastError = "";
        for (const candidate of candidates) {
            if (isContentOnlyEngine(candidate)) {
                continue;
            }
            const result = await runSingleEngineConnectionTest(
                candidate,
                settings,
            );
            if (result.ok) {
                return result;
            }
            lastError = result.error || "";
        }
        return {
            ok: false,
            error: lastError || t("translate.router.allAutoCandidatesFailed"),
        };
    }

    return runSingleEngineConnectionTest(engine, settings);
}
