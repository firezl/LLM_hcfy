import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CUSTOM_PROMPT_SETTING_BY_ENGINE,
    getTranslateHandlerKey,
    isContentOnlyEngine,
    LLM_ENGINE_IDS,
    OPENAI_COMPAT_MODEL_ENGINES,
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
        assert.ok(!LLM_ENGINE_IDS.includes("special_translate"));
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
});
