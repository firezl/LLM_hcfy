import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { streamQwenTranslate } from "../background/engines/qwen.js";

describe("qwen stream translator", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("rewrites native DashScope URL to compatible-mode URL and uses OpenAI compatible body", async () => {
        let requestedUrl = "";
        let requestedBody = null;

        globalThis.fetch = async (url, options) => {
            requestedUrl = url;
            requestedBody = JSON.parse(options.body);

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

        const messages = [];
        const port = {
            postMessage(payload) {
                messages.push(payload);
            }
        };
        const state = {
            connected: true,
            controllers: new Map()
        };

        await streamQwenTranslate({
            requestId: "qwen-test-1",
            text: "Hello",
            settings: {
                qwen_api_url: "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
                qwen_api_key: "sk-qwen-123",
                qwen_model: "qwen3.5-plus"
            }
        }, port, state);

        // Verify URL was rewritten
        assert.equal(requestedUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");

        // Verify it sent compatible-mode payload (messages directly in top-level, stream: true)
        assert.ok(requestedBody.messages);
        assert.equal(requestedBody.stream, true);
        assert.equal(requestedBody.model, "qwen3.5-plus");

        // Verify output messages
        assert.ok(messages.some(m => m.type === "TRANSLATE_CHUNK" && m.content === "你好"));
        assert.ok(messages.some(m => m.type === "TRANSLATE_DONE"));
    });

    it("handles and propagates SSE error payload", async () => {
        globalThis.fetch = async (url, options) => {
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('id:1\n'));
                    controller.enqueue(new TextEncoder().encode('event:error\n'));
                    controller.enqueue(new TextEncoder().encode(':HTTP_STATUS/400\n'));
                    controller.enqueue(new TextEncoder().encode('data:{"code":"InvalidParameter","message":"url error, please check url！","request_id":"7cc3b1c5"}\n\n'));
                    controller.close();
                }
            });

            return {
                ok: true,
                status: 200,
                body: stream
            };
        };

        const messages = [];
        const port = {
            postMessage(payload) {
                messages.push(payload);
            }
        };
        const state = {
            connected: true,
            controllers: new Map()
        };

        await streamQwenTranslate({
            requestId: "qwen-test-2",
            text: "Hello",
            settings: {
                qwen_api_url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                qwen_api_key: "sk-qwen-123",
                qwen_model: "qwen3.5-plus"
            }
        }, port, state);

        // Verify the error was parsed and posted back
        const errorMsg = messages.find(m => m.type === "TRANSLATE_ERROR");
        assert.ok(errorMsg, "Should have received TRANSLATE_ERROR");
        assert.ok(errorMsg.error.includes("InvalidParameter: url error"), `Error message should contain details, got: ${errorMsg.error}`);
    });
});
