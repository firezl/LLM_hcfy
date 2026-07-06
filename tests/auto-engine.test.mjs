import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildAutoTranslateCandidates,
    getAutoEngineDisplayI18nKey,
    getAutoPrimaryCandidate,
    isEngineLikelyConfigured,
    isLlmAutoCandidate,
    resolveAutoBackgroundEngine,
    resolveAutoLlmEngine,
} from "../libs/auto-engine.mjs";

describe("auto-engine", () => {
    it("resolves llm provider from settings", () => {
        assert.equal(
            resolveAutoLlmEngine({ llm_engine: "deepseek" }),
            "deepseek",
        );
        assert.equal(resolveAutoLlmEngine({ llm_engine: "unknown" }), "openai");
    });

    it("treats openai as configured only when api url is set", () => {
        assert.equal(isEngineLikelyConfigured("openai", {}), false);
        assert.equal(
            isEngineLikelyConfigured("openai", { openai_api_url: "https://api.openai.com" }),
            true,
        );
    });

    it("always includes free traditional engines in auto chain", () => {
        const candidates = buildAutoTranslateCandidates({});
        assert.deepEqual(candidates.slice(-3), ["google", "bing", "browser"]);
    });

    it("prefers configured llm provider before traditional engines", () => {
        const candidates = buildAutoTranslateCandidates({
            llm_engine: "openrouter",
            openrouter_api_url: "https://openrouter.ai/api/v1/chat/completions",
        });
        assert.equal(candidates[0], "openrouter");
        assert.ok(candidates.includes("google"));
        assert.equal(candidates.at(-1), "browser");
    });

    it("skips llm candidate when openai url is missing", () => {
        const candidates = buildAutoTranslateCandidates({
            llm_engine: "openai",
            openai_api_url: "",
        });
        assert.notEqual(candidates[0], "openai");
        assert.equal(candidates[0], "google");
    });

    it("includes deepl when api url is present", () => {
        const candidates = buildAutoTranslateCandidates({
            deepl_api_url: "https://api-free.deepl.com/v2/translate",
        });
        assert.equal(candidates[0], "deepl");
    });

    it("resolves background auto engine to first non-browser candidate", () => {
        assert.equal(
            resolveAutoBackgroundEngine({
                llm_engine: "ollama",
                ollama_api_url: "http://localhost:11434/api/chat",
            }),
            "ollama",
        );
        assert.equal(resolveAutoBackgroundEngine({}), "google");
    });

    it("maps display keys for auto candidate labels", () => {
        assert.equal(
            getAutoEngineDisplayI18nKey("custom_openai"),
            "options.engine.auto.candidate.custom_openai",
        );
        assert.equal(
            getAutoEngineDisplayI18nKey("deepl"),
            "options.engine.auto.candidate.deepl",
        );
        assert.equal(
            getAutoEngineDisplayI18nKey("browser"),
            "options.engine.auto.candidate.browser",
        );
    });

    it("reports llm auto candidate from configured provider", () => {
        assert.equal(
            isLlmAutoCandidate({
                llm_engine: "openai",
                openai_api_url: "https://api.openai.com",
            }),
            true,
        );
        assert.equal(
            isLlmAutoCandidate({ llm_engine: "openai", openai_api_url: "" }),
            false,
        );
        assert.equal(
            getAutoPrimaryCandidate({
                llm_engine: "gemini",
                gemini_api_url: "https://generativelanguage.googleapis.com/v1beta/models",
            }),
            "gemini",
        );
    });
});
