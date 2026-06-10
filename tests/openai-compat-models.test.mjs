import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { handleOpenAICompatGetModels } from "../background/engines/openai-compat-models.js";

describe("handleOpenAICompatGetModels", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("succeeds when fetch returns models list", async () => {
        globalThis.fetch = async (url, options) => {
            assert.equal(url, "https://api.openai.com/v1/models");
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        data: [
                            { id: "gpt-4o" },
                            { id: "gpt-4o-mini" }
                        ]
                    };
                }
            };
        };

        const messages = [];
        const port = {
            postMessage(payload) {
                messages.push(payload);
            }
        };
        const state = { connected: true };

        await handleOpenAICompatGetModels({
            engine: "openai",
            apiUrl: "https://api.openai.com/v1/chat/completions"
        }, port, state);

        assert.equal(messages.length, 1);
        assert.equal(messages[0].type, "OPENAI_COMPAT_MODELS_RESPONSE");
        assert.deepEqual(messages[0].modelIds, ["gpt-4o", "gpt-4o-mini"]);
    });

    it("falls back to predefined list when fetch fails for Qwen engine", async () => {
        globalThis.fetch = async (url) => {
            return {
                ok: false,
                status: 404,
                statusText: "Not Found",
                async text() {
                    return "Not Found";
                }
            };
        };

        const messages = [];
        const port = {
            postMessage(payload) {
                messages.push(payload);
            }
        };
        const state = { connected: true };

        await handleOpenAICompatGetModels({
            engine: "qwen",
            apiUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
        }, port, state);

        assert.equal(messages.length, 1);
        assert.equal(messages[0].type, "OPENAI_COMPAT_MODELS_RESPONSE");
        assert.ok(messages[0].modelIds.includes("qwen3.5-plus"));
        assert.ok(messages[0].modelIds.includes("deepseek-v3"));
    });

    it("falls back to predefined list when fetch fails for DashScope URL regardless of engine name", async () => {
        globalThis.fetch = async (url) => {
            return {
                ok: false,
                status: 404,
                statusText: "Not Found",
                async text() {
                    return "Not Found";
                }
            };
        };

        const messages = [];
        const port = {
            postMessage(payload) {
                messages.push(payload);
            }
        };
        const state = { connected: true };

        await handleOpenAICompatGetModels({
            engine: "custom_openai",
            apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
        }, port, state);

        assert.equal(messages.length, 1);
        assert.equal(messages[0].type, "OPENAI_COMPAT_MODELS_RESPONSE");
        assert.ok(messages[0].modelIds.includes("qwen3.5-plus"));
        assert.ok(messages[0].modelIds.includes("deepseek-r1"));
    });
});
