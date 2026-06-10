globalThis.chrome = {};
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

const { handleTestConnection } = await import("../background/translate-router.js");

describe("handleTestConnection", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("succeeds when fetch returns a mock SSE stream", async () => {
        globalThis.fetch = async (url, options) => {
            assert.equal(url, "https://api.openai.com/v1/chat/completions");
            assert.equal(options.method, "POST");
            assert.ok(options.headers["Authorization"].includes("sk-12345"));

            // Create a mock readable stream
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'));
                    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                    controller.close();
                }
            });

            return {
                ok: true,
                status: 200,
                body: stream
            };
        };

        const result = await handleTestConnection({
            engine: "openai",
            settings: {
                openai_api_url: "https://api.openai.com/v1/chat/completions",
                openai_api_key: "sk-12345",
                openai_model: "gpt-5.4-mini"
            }
        });

        assert.deepEqual(result, { ok: true });
    });

    it("fails when fetch returns an error status code", async () => {
        globalThis.fetch = async () => {
            return {
                ok: false,
                status: 401,
                statusText: "Unauthorized",
                async text() {
                    return "Invalid API Key";
                }
            };
        };

        const result = await handleTestConnection({
            engine: "openai",
            settings: {
                openai_api_url: "https://api.openai.com/v1/chat/completions",
                openai_api_key: "sk-invalid",
                openai_model: "gpt-5.4-mini"
            }
        });

        assert.equal(result.ok, false);
        assert.ok(result.error.includes("Invalid API Key") || result.error.includes("401"));
    });

    it("succeeds when fetch returns a mock SSE stream for siliconflow", async () => {
        globalThis.fetch = async (url, options) => {
            assert.equal(url, "https://api.siliconflow.cn/v1/chat/completions");
            assert.equal(options.method, "POST");
            assert.ok(options.headers["Authorization"].includes("sk-sf-12345"));

            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'));
                    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                    controller.close();
                }
            });

            return {
                ok: true,
                status: 200,
                body: stream
            };
        };

        const result = await handleTestConnection({
            engine: "siliconflow",
            settings: {
                siliconflow_api_url: "https://api.siliconflow.cn/v1/chat/completions",
                siliconflow_api_key: "sk-sf-12345",
                siliconflow_model: "deepseek-ai/DeepSeek-V3"
            }
        });

        assert.deepEqual(result, { ok: true });
    });
});
