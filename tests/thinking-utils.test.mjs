import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildCustomOpenAIThinkingPatch,
    buildOpenAIThinkingPatch,
    detectThinkingModelType,
    getThinkingEnabledByEngine,
    isLikelyDeepSeekStyleThinkingModel,
    isLikelyQwenModel,
    pickOpenAIReasoningEffort,
    pickThinkingModelType,
    resolveCompatThinkingType,
    supportsOpenAIReasoning,
} from "../background/engines/thinking-utils.js";

describe("thinking-utils", () => {
    it("detects OpenAI reasoning models", () => {
        assert.equal(supportsOpenAIReasoning("gpt-5-mini"), true);
        assert.equal(supportsOpenAIReasoning("o3-mini"), true);
        assert.equal(supportsOpenAIReasoning("gpt-4o-mini"), false);
        // New patterns
        assert.equal(supportsOpenAIReasoning("chatgpt-5"), true);
        assert.equal(supportsOpenAIReasoning("chatgpt-5o"), true);
        assert.equal(supportsOpenAIReasoning("some-model-reasoning"), true);
        assert.equal(supportsOpenAIReasoning("my-reasoning-model"), true);
        assert.equal(supportsOpenAIReasoning("o4-mini"), true);
        assert.equal(supportsOpenAIReasoning("gpt-5.4-mini"), true);
        // Should NOT match
        assert.equal(supportsOpenAIReasoning("chatgpt-latest"), false);
        assert.equal(supportsOpenAIReasoning("claude-sonnet-4"), false);
        assert.equal(supportsOpenAIReasoning("deepseek-v4"), false);
    });

    it("picks valid reasoning effort", () => {
        assert.equal(pickOpenAIReasoningEffort("high", "medium"), "high");
        assert.equal(pickOpenAIReasoningEffort("bogus", "low"), "low");
    });

    it("builds OpenAI thinking patch with auto detection", () => {
        // Auto-detect: gpt-5-mini is detected as reasoning model
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "gpt-5-mini",
                showThoughts: true,
                settings: { openai_reasoning_effort: "high" },
            }),
            { reasoning_effort: "high" },
        );
        // Auto-detect: gpt-5-mini with showThoughts=false
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "gpt-5-mini",
                showThoughts: false,
                settings: {},
            }),
            { reasoning_effort: "none" },
        );
        // Auto-detect: gpt-4o-mini is not a reasoning model
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "gpt-4o-mini",
                showThoughts: true,
                settings: {},
            }),
            {},
        );
    });

    it("builds OpenAI thinking patch with user-specified thinking model type", () => {
        // Force openai_reasoning on a model that wouldn't be auto-detected
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "some-custom-model",
                showThoughts: true,
                settings: {
                    openai_thinking_model_type: "openai_reasoning",
                    openai_reasoning_effort: "high",
                },
            }),
            { reasoning_effort: "high" },
        );
        // Force none on a model that would be auto-detected as reasoning
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "o3-mini",
                showThoughts: true,
                settings: { openai_thinking_model_type: "none" },
            }),
            {},
        );
        // Auto with max_completion_tokens
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "o4-mini",
                showThoughts: true,
                settings: {
                    openai_reasoning_effort: "medium",
                    openai_max_completion_tokens: 8192,
                },
            }),
            { reasoning_effort: "medium", max_completion_tokens: 8192 },
        );
    });

    it("builds DeepSeek-style patch for custom OpenAI compat", () => {
        assert.deepEqual(
            buildCustomOpenAIThinkingPatch({
                model: "deepseek-chat",
                showThoughts: true,
                settings: {},
            }),
            { thinking: { type: "enabled" } },
        );
    });

    it("detects vendor families", () => {
        assert.equal(isLikelyQwenModel("Qwen3-Max"), true);
        assert.equal(isLikelyDeepSeekStyleThinkingModel("glm-4"), true);
    });

    it("reads per-engine show_thoughts flags", () => {
        assert.equal(
            getThinkingEnabledByEngine("deepseek", { deepseek_show_thoughts: true }),
            true,
        );
        assert.equal(
            getThinkingEnabledByEngine("openai", { show_thoughts: true }),
            true,
        );
    });

    it("detects thinking model type automatically", () => {
        assert.equal(detectThinkingModelType("o3-mini"), "openai_reasoning");
        assert.equal(detectThinkingModelType("gpt-5-mini"), "openai_reasoning");
        assert.equal(detectThinkingModelType("deepseek-chat"), "deepseek_style");
        assert.equal(detectThinkingModelType("glm-4"), "deepseek_style");
        assert.equal(detectThinkingModelType("mimo-v2.5"), "deepseek_style");
        assert.equal(detectThinkingModelType("qwen3-plus"), "qwen_style");
        assert.equal(detectThinkingModelType("gpt-4o-mini"), "none");
        // New patterns
        assert.equal(detectThinkingModelType("chatgpt-5"), "openai_reasoning");
        assert.equal(detectThinkingModelType("my-reasoning"), "openai_reasoning");
    });

    it("picks valid thinking model type", () => {
        assert.equal(pickThinkingModelType("auto", "auto"), "auto");
        assert.equal(pickThinkingModelType("openai_reasoning", "auto"), "openai_reasoning");
        assert.equal(pickThinkingModelType("deepseek_style", "auto"), "deepseek_style");
        assert.equal(pickThinkingModelType("qwen_style", "auto"), "qwen_style");
        assert.equal(pickThinkingModelType("none", "auto"), "none");
        assert.equal(pickThinkingModelType("invalid", "auto"), "auto");
        assert.equal(pickThinkingModelType("", "auto"), "auto");
    });

    it("builds custom OpenAI patch with user-specified thinking model type", () => {
        assert.deepEqual(
            buildCustomOpenAIThinkingPatch({
                model: "some-custom-model",
                showThoughts: true,
                settings: { custom_openai_thinking_model_type: "deepseek_style" },
            }),
            { thinking: { type: "enabled" } },
        );
        assert.deepEqual(
            buildCustomOpenAIThinkingPatch({
                model: "some-custom-model",
                showThoughts: true,
                settings: { custom_openai_thinking_model_type: "qwen_style" },
            }),
            { enable_thinking: true, chat_template_kwargs: { enable_thinking: true } },
        );
        assert.deepEqual(
            buildCustomOpenAIThinkingPatch({
                model: "some-custom-model",
                showThoughts: true,
                settings: { custom_openai_thinking_model_type: "none" },
            }),
            {},
        );
    });

    it("auto-detects thinking model type when set to auto", () => {
        assert.deepEqual(
            buildCustomOpenAIThinkingPatch({
                model: "deepseek-chat",
                showThoughts: true,
                settings: { custom_openai_thinking_model_type: "auto" },
            }),
            { thinking: { type: "enabled" } },
        );
        assert.deepEqual(
            buildCustomOpenAIThinkingPatch({
                model: "qwen3-plus",
                showThoughts: true,
                settings: { custom_openai_thinking_model_type: "auto" },
            }),
            { enable_thinking: true, chat_template_kwargs: { enable_thinking: true } },
        );
    });

    it("resolves compat thinking type with custom auto default", () => {
        // Explicit value bypasses autoDefault
        assert.equal(
            resolveCompatThinkingType("none", "deepseek-chat", () => "deepseek_style"),
            "none",
        );
        assert.equal(
            resolveCompatThinkingType("openai_reasoning", "some-model", () => "none"),
            "openai_reasoning",
        );
        // Auto calls the autoDefault callback
        assert.equal(
            resolveCompatThinkingType("auto", "deepseek-chat", () => "deepseek_style"),
            "deepseek_style",
        );
        assert.equal(
            resolveCompatThinkingType("auto", "grok-3", () => "none"),
            "none",
        );
        // Invalid value falls back to auto, then calls autoDefault
        assert.equal(
            resolveCompatThinkingType("bogus", "deepseek-chat", () => "deepseek_style"),
            "deepseek_style",
        );
        // Undefined/empty falls back to auto
        assert.equal(
            resolveCompatThinkingType(undefined, "model", () => "none"),
            "none",
        );
    });
});
