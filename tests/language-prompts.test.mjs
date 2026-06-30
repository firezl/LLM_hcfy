import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildChatPromptParts,
    buildContextBlock,
    buildOpenAIStyleMessages,
} from "../background/language.js";

const glossaryTerms = [
    {
        sourceTerm: "OpenAI",
        targetTerm: "开放人工智能",
    },
];

describe("language prompt builders", () => {
    it("uses mode1 prompt when context is absent", () => {
        const parts = buildChatPromptParts("hello", "zh", {});
        assert.match(
            parts.systemPrompt,
            /Translate the following into Chinese\. Output only the translation\./,
        );
        assert.equal(parts.userPrompt, "hello");
    });

    it("uses legacy prompt as system prompt fallback", () => {
        const parts = buildChatPromptParts("hello", "zh", {
            legacyCustomPromptTemplate: "You are a translator. Target: {targetLang}",
        });
        assert.equal(parts.systemPrompt, "You are a translator. Target: Chinese");
        assert.equal(parts.userPrompt, "hello");
    });

    it("puts glossary constraints in the default system prompt", () => {
        const parts = buildChatPromptParts("OpenAI", "zh", {
            glossaryTerms,
        });
        assert.match(parts.systemPrompt, /Terminology constraints/);
        assert.match(parts.systemPrompt, /OpenAI -> 开放人工智能/);
        assert.equal(parts.userPrompt, "OpenAI");
    });

    it("appends input to user templates that omit text", () => {
        const parts = buildChatPromptParts("hello", "zh", {
            systemPromptTemplate: "Output only the translation",
            userPromptTemplate: "Translate to {targetLang}",
        });
        assert.equal(parts.systemPrompt, "Output only the translation");
        assert.match(parts.userPrompt, /Translate to Chinese/);
        assert.match(parts.userPrompt, /Input:\nhello/);
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

    it("builds context block from structured context", () => {
        const block = buildContextBlock({
            mode: "enhanced",
            selectedText: "selected",
            before: "earlier",
            after: "later",
            block: "full paragraph",
            page: {
                title: "Docs",
                domain: "example.com",
                lang: "en",
            },
        });
        assert.match(block, /Page title: Docs/);
        assert.match(block, /Before: earlier/);
        assert.match(block, /After: later/);
    });

    it("uses lightweight mode prompts with glossary", () => {
        const parts = buildChatPromptParts("selected", "zh", {
            glossaryTerms,
            context: {
                mode: "lightweight",
                selectedText: "selected",
                before: "前文",
                after: "后文",
            },
        });
        assert.match(parts.systemPrompt, /Use surrounding context only for disambiguation/);
        assert.match(parts.systemPrompt, /Terminology constraints/);
        assert.match(parts.userPrompt, /Before: 前文/);
        assert.match(parts.userPrompt, /Selected: selected/);
        assert.match(parts.userPrompt, /After: 后文/);
    });

    it("uses enhanced mode prompts with dynamic target language suffix", () => {
        const parts = buildChatPromptParts("selected", "en", {
            context: {
                mode: "enhanced",
                selectedText: "selected",
                before: "before",
                after: "after",
                block: "block",
                page: {
                    title: "Title",
                    domain: "example.com",
                    lang: "zh",
                },
            },
        });
        assert.match(parts.systemPrompt, /browser selection-translate extension/);
        assert.match(parts.systemPrompt, /Preserve code, variable names, formulas, and URLs/);
        assert.match(parts.userPrompt, /Page title: Title/);
        assert.match(parts.userPrompt, /English translation:/);
    });

    it("replaces custom placeholders in custom templates", () => {
        const parts = buildChatPromptParts("selected", "zh", {
            systemPromptTemplate: "System prompt",
            userPromptTemplate:
                "Title:{page_title}\nBefore:{before_context}\nText:{selected_text}\nBlock:{block_text}",
            context: {
                mode: "enhanced",
                selectedText: "selected",
                before: "前文",
                after: "后文",
                block: "段落",
                page: {
                    title: "标题",
                    domain: "example.com",
                    lang: "zh",
                },
            },
        });
        assert.equal(parts.systemPrompt, "System prompt");
        assert.match(parts.userPrompt, /Title:标题/);
        assert.match(parts.userPrompt, /Before:前文/);
        assert.match(parts.userPrompt, /Text:selected/);
        assert.match(parts.userPrompt, /Block:段落/);
    });

    it("replaces {context} placeholder in custom templates", () => {
        const parts = buildChatPromptParts("selected", "zh", {
            systemPromptTemplate: "System prompt",
            userPromptTemplate: "Context:\n{context}\nTranslate:\n{text}",
            context: {
                mode: "lightweight",
                selectedText: "selected",
                before: "前文",
                after: "后文",
            },
        });
        assert.equal(parts.systemPrompt, "System prompt");
        assert.match(parts.userPrompt, /前文/);
        assert.match(parts.userPrompt, /selected/);
    });

    it("keeps original prompt when context is absent", () => {
        const without = buildChatPromptParts("hello", "zh", {});
        const withEmpty = buildChatPromptParts("hello", "zh", { context: null });
        assert.equal(without.systemPrompt, withEmpty.systemPrompt);
        assert.equal(without.userPrompt, withEmpty.userPrompt);
    });
});
