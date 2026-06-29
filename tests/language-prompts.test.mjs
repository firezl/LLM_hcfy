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
        assert.match(parts.systemPrompt, /请将以下内容翻译成中文，只输出译文/);
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
            glossaryTerms,
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
        assert.match(block, /网页标题: Docs/);
        assert.match(block, /前文: earlier/);
        assert.match(block, /后文: later/);
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
        assert.match(parts.systemPrompt, /前后文只用于判断含义/);
        assert.match(parts.systemPrompt, /术语约束/);
        assert.match(parts.userPrompt, /前文：前文/);
        assert.match(parts.userPrompt, /划选文本：selected/);
        assert.match(parts.userPrompt, /后文：后文/);
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
        assert.match(parts.systemPrompt, /浏览器划词翻译插件/);
        assert.match(parts.systemPrompt, /保留代码、变量名、公式、URL/);
        assert.match(parts.userPrompt, /网页标题：Title/);
        assert.match(parts.userPrompt, /英文译文：/);
    });

    it("replaces custom placeholders in custom templates", () => {
        const parts = buildChatPromptParts("selected", "zh", {
            systemPromptTemplate: "系统提示",
            userPromptTemplate:
                "标题:{page_title}\n前文:{before_context}\n文本:{selected_text}\n段落:{block_text}",
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
        assert.equal(parts.systemPrompt, "系统提示");
        assert.match(parts.userPrompt, /标题:标题/);
        assert.match(parts.userPrompt, /前文:前文/);
        assert.match(parts.userPrompt, /文本:selected/);
        assert.match(parts.userPrompt, /段落:段落/);
    });

    it("replaces {context} placeholder in custom templates", () => {
        const parts = buildChatPromptParts("selected", "zh", {
            systemPromptTemplate: "系统提示",
            userPromptTemplate: "上下文:\n{context}\n翻译:\n{text}",
            context: {
                mode: "lightweight",
                selectedText: "selected",
                before: "前文",
                after: "后文",
            },
        });
        assert.equal(parts.systemPrompt, "系统提示");
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
