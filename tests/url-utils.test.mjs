import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    normalizeFixedHttpEndpoint,
    normalizeOpenAICompatEndpoint,
    normalizeOllamaEndpoint,
} from "../background/engines/url-utils.js";

describe("url-utils", () => {
    it("normalizes bare host to https OpenAI chat completions", () => {
        const result = normalizeOpenAICompatEndpoint(
            "api.openai.com",
            "https://api.openai.com/v1/chat/completions",
        );
        assert.equal(result.ok, true);
        assert.ok(result.url.endsWith("/v1/chat/completions"));
        assert.ok(result.modelsUrl.endsWith("/v1/models"));
    });

    it("preserves explicit chat completions path", () => {
        const result = normalizeOpenAICompatEndpoint(
            "https://api.deepseek.com/chat/completions",
            "https://api.deepseek.com/chat/completions",
        );
        assert.equal(result.ok, true);
        assert.equal(
            result.url,
            "https://api.deepseek.com/chat/completions",
        );
    });

    it("rejects non-http protocols", () => {
        const result = normalizeOpenAICompatEndpoint(
            "ftp://example.com/v1",
            "https://api.openai.com/v1/chat/completions",
        );
        assert.equal(result.ok, false);
    });

    it("normalizes ollama chat and tags urls", () => {
        const result = normalizeOllamaEndpoint(
            "localhost:11434",
            "http://localhost:11434/api/chat",
        );
        assert.equal(result.ok, true);
        assert.equal(result.chatUrl, "http://localhost:11434/api/chat");
        assert.equal(result.tagsUrl, "http://localhost:11434/api/tags");
    });

    it("normalizes gemini-style version base paths", () => {
        const result = normalizeFixedHttpEndpoint(
            "https://generativelanguage.googleapis.com/v1beta",
            "https://generativelanguage.googleapis.com/v1beta/models",
            {
                endpointPath: "/v1beta/models",
                suffixOnVersionBase: "/models",
                endpointMatchers: [/\/models$/i],
            },
        );
        assert.equal(result.ok, true);
        assert.ok(String(result.url).includes("/models"));
    });
});
