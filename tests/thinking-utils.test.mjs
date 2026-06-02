import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildCustomOpenAIThinkingPatch,
    buildOpenAIThinkingPatch,
    getThinkingEnabledByEngine,
    isLikelyDeepSeekStyleThinkingModel,
    isLikelyQwenModel,
    pickOpenAIReasoningEffort,
    supportsOpenAIReasoning,
} from "../background/engines/thinking-utils.js";

describe("thinking-utils", () => {
    it("detects OpenAI reasoning models", () => {
        assert.equal(supportsOpenAIReasoning("gpt-5-mini"), true);
        assert.equal(supportsOpenAIReasoning("o3-mini"), true);
        assert.equal(supportsOpenAIReasoning("gpt-4o-mini"), false);
    });

    it("picks valid reasoning effort", () => {
        assert.equal(pickOpenAIReasoningEffort("high", "medium"), "high");
        assert.equal(pickOpenAIReasoningEffort("bogus", "low"), "low");
    });

    it("builds OpenAI thinking patch", () => {
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "gpt-5-mini",
                showThoughts: true,
                settings: { openai_reasoning_effort: "high" },
            }),
            { reasoning_effort: "high" },
        );
        assert.deepEqual(
            buildOpenAIThinkingPatch({
                model: "gpt-5-mini",
                showThoughts: false,
                settings: {},
            }),
            { reasoning_effort: "none" },
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
});
