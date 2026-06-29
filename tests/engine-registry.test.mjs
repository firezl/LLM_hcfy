import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CUSTOM_PROMPT_SETTING_BY_ENGINE,
    CUSTOM_HEADERS_SETTING_BY_ENGINE,
    CUSTOM_PAYLOAD_SETTING_BY_ENGINE,
    getCustomPayloadSettingKey,
    getPromptSettingKeys,
    getTranslateHandlerKey,
    isContentOnlyEngine,
    LLM_ENGINE_IDS,
    OPENAI_COMPAT_MODEL_ENGINES,
    SYSTEM_PROMPT_SETTING_BY_ENGINE,
    USER_PROMPT_SETTING_BY_ENGINE,
    resolveTranslateEngine,
} from "../libs/engine-registry.mjs";

describe("engine-registry", () => {
    it("resolves llm sub-engine", () => {
        assert.equal(
            resolveTranslateEngine({ engine: "llm", llm_engine: "deepseek" }),
            "deepseek",
        );
    });

    it("falls back invalid llm_engine to openai", () => {
        assert.equal(
            resolveTranslateEngine({ engine: "llm", llm_engine: "unknown" }),
            "openai",
        );
    });

    it("maps auto to openai handler", () => {
        assert.equal(getTranslateHandlerKey("auto"), "openai");
    });

    it("marks browser as content-only", () => {
        assert.equal(isContentOnlyEngine("browser"), true);
        assert.equal(isContentOnlyEngine("openai"), false);
    });

    it("includes expected llm engines", () => {
        assert.ok(LLM_ENGINE_IDS.includes("openrouter"));
        assert.ok(LLM_ENGINE_IDS.includes("ollama"));
    });

    it("migrates removed special_translate engine to ollama", () => {
        assert.equal(resolveTranslateEngine({ engine: "special_translate" }), "ollama");
    });

    it("exposes openai compat ui configs", () => {
        const names = OPENAI_COMPAT_MODEL_ENGINES.map((cfg) => cfg.name);
        assert.ok(names.includes("deepseek"));
        assert.ok(names.includes("openai"));
    });

    it("maps custom prompts", () => {
        assert.equal(
            CUSTOM_PROMPT_SETTING_BY_ENGINE.glm,
            "glm_custom_prompt",
        );
        assert.equal(
            CUSTOM_PROMPT_SETTING_BY_ENGINE.auto,
            "openai_custom_prompt",
        );
    });

    it("maps split prompt and custom header settings", () => {
        assert.equal(
            SYSTEM_PROMPT_SETTING_BY_ENGINE.openai,
            "openai_system_prompt",
        );
        assert.equal(USER_PROMPT_SETTING_BY_ENGINE.gemini, "gemini_user_prompt");
        assert.equal(
            CUSTOM_HEADERS_SETTING_BY_ENGINE.custom_openai,
            "custom_openai_custom_headers",
        );
        assert.equal(
            CUSTOM_PAYLOAD_SETTING_BY_ENGINE.openrouter,
            "openrouter_custom_payload",
        );
        assert.deepEqual(getPromptSettingKeys("deepseek"), {
            legacy: "deepseek_custom_prompt",
            system: "deepseek_system_prompt",
            user: "deepseek_user_prompt",
        });
        assert.equal(
            getCustomPayloadSettingKey("qwen"),
            "qwen_custom_payload",
        );
    });

    it("includes custom header keys in OpenAI-compatible model configs", () => {
        const deepseek = OPENAI_COMPAT_MODEL_ENGINES.find(
            (cfg) => cfg.name === "deepseek",
        );
        assert.equal(deepseek.customHeadersKey, "deepseek_custom_headers");
    });
});
