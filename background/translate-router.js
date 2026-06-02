import {
    getCustomPromptSettingKey,
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

    const customPromptSettingKey = getCustomPromptSettingKey(engine);
    const customPromptTemplate = customPromptSettingKey
        ? String(message?.settings?.[customPromptSettingKey] || "")
        : "";

    const requestWithGlossary = {
        ...message,
        glossaryTerms,
        customPromptTemplate,
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
