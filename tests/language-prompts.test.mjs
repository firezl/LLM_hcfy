import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildChatPromptParts,
    buildOpenAIStyleMessages,
} from "../background/language.js";

describe("language prompt builders", () => {
    it("splits default translation instructions into system and source text into user", () => {
        const parts = buildChatPromptParts("hello", "zh", {});
        assert.match(parts.systemPrompt, /翻译为中文/);
        assert.match(parts.systemPrompt, /只输出译文/);
        assert.equal(parts.userPrompt, "hello");
    });

    it("uses legacy prompt as system prompt fallback", () => {
        const parts = buildChatPromptParts("hello", "zh", {
            legacyCustomPromptTemplate: "你是翻译助手，目标是 {targetLang}",
        });
        assert.equal(parts.systemPrompt, "你是翻译助手，目标是 中文");
        assert.equal(parts.userPrompt, "hello");
    });

    it("puts glossary constraints in the default system prompt", () => {
        const parts = buildChatPromptParts("OpenAI", "zh", {
            glossaryTerms: [
                {
                    sourceTerm: "OpenAI",
                    targetTerm: "开放人工智能",
                },
            ],
        });
        assert.match(parts.systemPrompt, /术语约束/);
        assert.match(parts.systemPrompt, /OpenAI => 开放人工智能/);
        assert.equal(parts.userPrompt, "OpenAI");
    });

    it("appends input to user templates that omit text", () => {
        const parts = buildChatPromptParts("hello", "zh", {
            systemPromptTemplate: "只输出译文",
            userPromptTemplate: "翻译到 {targetLang}",
        });
        assert.equal(parts.systemPrompt, "只输出译文");
        assert.match(parts.userPrompt, /翻译到 中文/);
        assert.match(parts.userPrompt, /输入:\nhello/);
    });

    it("builds OpenAI-style system and user messages", () => {
        const messages = buildOpenAIStyleMessages({
            systemPrompt: "sys",
            userPrompt: "user",
        });
        assert.deepEqual(messages, [
            { role: "system", content: "sys" },
            { role: "user", content: "user" },
        ]);
    });
});
