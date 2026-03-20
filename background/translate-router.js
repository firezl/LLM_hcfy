import { streamBingTranslate } from "./engines/bing.js";
import { streamGoogleTranslate } from "./engines/google.js";
import { streamOpenAITranslate } from "./engines/openai.js";
import { streamWebLLMTranslate } from "./engines/webllm.js";
import { postTranslateError } from "./port-utils.js";

export async function handleTranslateStart(message, port, state) {
    const engine = message?.settings?.engine || "auto";

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
        await streamWebLLMTranslate(message, port, state);
        return;
    }

    if (engine === "google") {
        await streamGoogleTranslate(message, port, state);
        return;
    }

    if (engine === "bing") {
        await streamBingTranslate(message, port, state);
        return;
    }

    await streamOpenAITranslate(message, port, state);
}
