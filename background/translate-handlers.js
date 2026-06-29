import { streamBingTranslate } from "./engines/bing.js";
import { streamClaudeTranslate } from "./engines/claude.js";
import { streamCustomOpenAITranslate } from "./engines/custom-openai.js";
import { streamDeepLTranslate } from "./engines/deepl.js";
import { streamDeepLXTranslate } from "./engines/deeplx.js";
import { streamDeepSeekTranslate } from "./engines/deepseek.js";
import { streamSiliconFlowTranslate } from "./engines/siliconflow.js";
import { streamGeminiTranslate } from "./engines/gemini.js";
import { streamGrokTranslate } from "./engines/grok.js";
import { streamNimTranslate } from "./engines/nim.js";
import { streamGLMTranslate } from "./engines/glm.js";
import { streamGoogleTranslate } from "./engines/google.js";
import { streamOllamaTranslate } from "./engines/ollama.js";
import { streamOpenAITranslate } from "./engines/openai.js";
import { streamOpenRouterTranslate } from "./engines/openrouter.js";
import { streamQwenTranslate } from "./engines/qwen.js";
import { streamXiaomiTranslate } from "./engines/xiaomi.js";

/** @type {Record<string, (request: object, port: object, state: object) => Promise<void>>} */
export const TRANSLATE_HANDLERS = Object.freeze({
    google: streamGoogleTranslate,
    bing: streamBingTranslate,
    deepl: streamDeepLTranslate,
    deeplx: streamDeepLXTranslate,
    claude: streamClaudeTranslate,
    custom_openai: streamCustomOpenAITranslate,
    deepseek: streamDeepSeekTranslate,
    siliconflow: streamSiliconFlowTranslate,
    qwen: streamQwenTranslate,
    glm: streamGLMTranslate,
    xiaomi: streamXiaomiTranslate,
    grok: streamGrokTranslate,
    nim: streamNimTranslate,
    openrouter: streamOpenRouterTranslate,
    gemini: streamGeminiTranslate,
    ollama: streamOllamaTranslate,
    openai: streamOpenAITranslate,
});
