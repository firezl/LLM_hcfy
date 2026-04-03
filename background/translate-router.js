import { streamBingTranslate } from "./engines/bing.js";
import { streamGoogleTranslate } from "./engines/google.js";
import { streamOllamaTranslate } from "./engines/ollama.js";
import { streamOpenAITranslate } from "./engines/openai.js";
import { streamWebLLMTranslate } from "./engines/webllm.js";
import { postTranslateError } from "./port-utils.js";
import { getMatchedGlossaryTerms } from "./term.js";

export async function handleTranslateStart(message, port, state) {
    const engine = message?.settings?.engine || "auto";
    const glossaryTerms = await getMatchedGlossaryTerms({
        from: message?.preferredFrom || message?.from,
        to: message?.preferredTo || message?.to,
        text: message?.text,
        enabled: message?.settings?.glossary_enabled !== false,
        maxTerms: 20,
    });

    const requestWithGlossary = {
        ...message,
        glossaryTerms,
    };

    if (engine === "browser") {
        postTranslateError(
            port,
            state,
            message.requestId,
            "浏览器 Translation API 不支持在扩展 service worker 中运行，请使用 auto 或 openai",
        );
        return;
    }

    if (engine === "webllm") {
        await streamWebLLMTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "google") {
        await streamGoogleTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "bing") {
        await streamBingTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "ollama") {
        await streamOllamaTranslate(requestWithGlossary, port, state);
        return;
    }

    await streamOpenAITranslate(requestWithGlossary, port, state);
}
