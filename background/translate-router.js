import { streamBingTranslate } from "./engines/bing.js";
import { streamClaudeTranslate } from "./engines/claude.js";
import { streamCustomOpenAITranslate } from "./engines/custom-openai.js";
import { streamDeepSeekTranslate } from "./engines/deepseek.js";
import { streamGeminiTranslate } from "./engines/gemini.js";
import { streamGLMTranslate } from "./engines/glm.js";
import { streamGoogleTranslate } from "./engines/google.js";
import { streamOllamaTranslate } from "./engines/ollama.js";
import { streamOpenAITranslate } from "./engines/openai.js";
import { streamQwenTranslate } from "./engines/qwen.js";
import { streamSpecialTranslate } from "./engines/special-translate.js";
import { streamWebLLMTranslate } from "./engines/webllm.js";
import { streamXiaomiTranslate } from "./engines/xiaomi.js";
import { postTranslateError } from "./port-utils.js";
import { getMatchedGlossaryTerms } from "./term.js";

const CUSTOM_PROMPT_SETTING_BY_ENGINE = {
    // `*_custom_prompt` is persisted in settings (options page),
    // then mapped to request.customPromptTemplate for engine runtime.
    auto: "openai_custom_prompt",
    openai: "openai_custom_prompt",
    gemini: "gemini_custom_prompt",
    claude: "claude_custom_prompt",
    deepseek: "deepseek_custom_prompt",
    qwen: "qwen_custom_prompt",
    glm: "glm_custom_prompt",
    xiaomi: "xiaomi_custom_prompt",
    custom_openai: "custom_openai_custom_prompt",
    ollama: "ollama_custom_prompt",
    special_translate: "special_translate_custom_prompt",
    webllm: "webllm_custom_prompt",
};

const LLM_ENGINES = new Set([
    "openai",
    "gemini",
    "claude",
    "deepseek",
    "qwen",
    "glm",
    "xiaomi",
    "ollama",
    "webllm",
]);

function resolveEngine(settings) {
    const selectedEngine = String(settings?.engine || "auto").trim();
    if (selectedEngine !== "llm") {
        return selectedEngine || "auto";
    }
    const llmEngine = String(settings?.llm_engine || "openai").trim();
    return LLM_ENGINES.has(llmEngine) ? llmEngine : "openai";
}

export async function handleTranslateStart(message, port, state) {
    const engine = resolveEngine(message?.settings);
    const glossaryTerms = await getMatchedGlossaryTerms({
        from: message?.preferredFrom || message?.from,
        to: message?.preferredTo || message?.to,
        text: message?.text,
        enabled: message?.settings?.glossary_enabled !== false,
        maxTerms: 20,
    });

    const customPromptSettingKey = CUSTOM_PROMPT_SETTING_BY_ENGINE[engine];
    const customPromptTemplate = customPromptSettingKey
        ? String(message?.settings?.[customPromptSettingKey] || "")
        : "";

    const requestWithGlossary = {
        ...message,
        glossaryTerms,
        customPromptTemplate,
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

    if (engine === "claude") {
        await streamClaudeTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "custom_openai") {
        await streamCustomOpenAITranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "deepseek") {
        await streamDeepSeekTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "qwen") {
        await streamQwenTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "glm") {
        await streamGLMTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "xiaomi") {
        await streamXiaomiTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "gemini") {
        await streamGeminiTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "ollama") {
        await streamOllamaTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "special_translate") {
        await streamSpecialTranslate(requestWithGlossary, port, state);
        return;
    }

    await streamOpenAITranslate(requestWithGlossary, port, state);
}
