import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { streamClaudeTranslate } from "../background/engines/claude.js";
import { streamDeepSeekTranslate } from "../background/engines/deepseek.js";
import { streamGLMTranslate } from "../background/engines/glm.js";
import { streamGrokTranslate } from "../background/engines/grok.js";
import { streamOpenAITranslate } from "../background/engines/openai.js";
import { streamXiaomiTranslate } from "../background/engines/xiaomi.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = originalFetch;
});

async function request(handler, settings, events, extra = {}) {
    let sent;
    globalThis.fetch = async (url, options) => {
        sent = { url, body: JSON.parse(options.body), headers: options.headers };
        const sse = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
        return {
            ok: true,
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(sse));
                    controller.close();
                },
            }),
        };
    };
    const messages = [];
    await handler(
        { requestId: "test", text: "Hello", from: "en", to: "zh", settings, ...extra },
        { postMessage: (message) => messages.push(message) },
        { connected: true, controllers: new Map() },
    );
    return { ...sent, messages };
}

const responsesEvents = [
    { type: "response.reasoning_summary_text.delta", delta: "摘要" },
    { type: "response.output_text.delta", delta: "你好" },
    { type: "response.completed" },
];
const chatEvents = [{ choices: [{ delta: { content: "你好" } }] }];

it("uses Responses for the default OpenAI model and routes summaries separately", async () => {
    const { url, body, messages } = await request(streamOpenAITranslate, {
        openai_api_key: "test-key",
        show_thoughts: true,
        openai_reasoning_effort: "minimal",
        openai_max_completion_tokens: 1024,
    }, responsesEvents);
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 1024);
    assert.equal(body.input.at(-1).role, "user");
    assert.deepEqual(body.reasoning, { effort: "low", summary: "auto" });
    assert.deepEqual(messages.map(({ type, content }) => [type, content]), [
        ["TRANSLATE_THOUGHT", "摘要"],
        ["TRANSLATE_CHUNK", "你好"],
        ["TRANSLATE_DONE", undefined],
    ]);
});

it("keeps a saved Grok gateway and migrates the legacy official URL", async () => {
    const settings = {
        grok_api_key: "test-key",
        grok_model: "custom",
        grok_custom_model: "grok-4.7",
    };
    const official = await request(streamGrokTranslate, {
        ...settings,
        grok_api_url: "https://api.x.ai/v1/chat/completions",
    }, responsesEvents);
    assert.equal(official.url, "https://api.x.ai/v1/responses");
    assert.equal(official.body.model, "grok-4.7");
    assert.deepEqual(official.body.reasoning, { effort: "low" });
    assert.equal(official.messages.some(({ type }) => type === "TRANSLATE_THOUGHT"), false);

    const proxy = await request(streamGrokTranslate, {
        ...settings,
        grok_api_url: "https://proxy.example/v1/chat/completions",
        grok_custom_model: "proxy-chat",
    }, chatEvents);
    assert.equal(proxy.url, "https://proxy.example/v1/chat/completions");
    assert.equal(proxy.body.model, "proxy-chat");
    assert.ok(proxy.body.messages);
});

it("uses the Claude Sonnet 5.5 thinking modes and current official API version", async () => {
    const settings = { claude_api_key: "test-key", claude_thinking_mode: "enabled" };
    const events = [{ type: "message_stop" }];
    const off = await request(streamClaudeTranslate, settings, events);
    assert.equal(off.body.model, "claude-sonnet-5-5");
    assert.equal(off.headers["anthropic-version"], "2026-10-21");
    assert.deepEqual(off.body.thinking, { type: "between_tools" });

    const on = await request(streamClaudeTranslate, {
        ...settings,
        claude_show_thoughts: true,
        claude_thinking_effort: "low",
    }, events);
    assert.deepEqual(on.body.thinking, { type: "adaptive", display: "summarized" });
    assert.deepEqual(on.body.output_config, { effort: "low" });
});

it("uses GLM's minimum supported reasoning and updates retired official model IDs", async () => {
    const glm = await request(streamGLMTranslate, { glm_api_key: "test-key" }, chatEvents);
    assert.equal(glm.body.model, "glm-5.3");
    assert.equal(glm.body.reasoning_effort, "low");
    assert.deepEqual(glm.body.thinking, { type: "enabled" });

    const deepSeek = await request(streamDeepSeekTranslate, {
        deepseek_api_key: "test-key",
        deepseek_model: "deepseek-v4-flash",
    }, chatEvents);
    assert.equal(deepSeek.body.model, "deepseek-flash");

    const miMo = await request(streamXiaomiTranslate, {
        xiaomi_api_key: "test-key",
        xiaomi_model: "mimo-v2.5",
    }, chatEvents);
    assert.equal(miMo.body.model, "mimo-v2.6-flash");
    assert.equal(miMo.headers.Authorization, "Bearer test-key");
    assert.equal(miMo.headers["api-key"], undefined);
});
