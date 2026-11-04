import assert from "node:assert/strict";
import { it } from "node:test";
import { handleGeminiGetModels } from "../background/engines/gemini-models.js";
import { streamGeminiTranslate } from "../background/engines/gemini.js";
import "../content/modules/translate-port.js";

const apiOrigin = "https://generativelanguage.googleapis.com";
const completed = {
    event_type: "interaction.completed",
    interaction: { status: "completed" },
};

function step(delta) {
    return { event_type: "step.delta", index: 0, delta };
}

function mockFetch(t, implementation) {
    const originalFetch = globalThis.fetch;
    const fetch = t.mock.fn(implementation);
    globalThis.fetch = fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    return fetch;
}

async function translate(t, events, overrides = {}) {
    const stream = events.map((event) => `data: ${JSON.stringify(event)}`).join("\r\n\r\n");
    const fetch = mockFetch(t, async () => ({
        ok: true,
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(stream));
                controller.close();
            },
        }),
    }));
    const messages = [];
    const { settings, ...request } = overrides;
    await streamGeminiTranslate(
        {
            requestId: "gemini-test",
            text: "Hello",
            to: "zh",
            settings: { gemini_api_key: "test-key", ...settings },
            ...request,
        },
        { postMessage: (message) => messages.push(message) },
        { connected: true, controllers: new Map() },
    );
    assert.equal(fetch.mock.calls.length, 1);
    const [url, options] = fetch.mock.calls[0].arguments;
    return { url, headers: options.headers, body: JSON.parse(options.body), messages };
}

it("streams Gemini summaries separately from translation using Interactions", async (t) => {
    const { url, headers, body, messages } = await translate(t, [
        step({ type: "thought_summary", content: { type: "text", text: "检查" } }),
        step({ type: "thought_summary", content: { type: "text", text: "语境" } }),
        step({ type: "thought_signature", signature: "encrypted" }),
        step({ type: "text", text: "你好" }),
        completed,
    ], {
        settings: { gemini_show_thoughts: true, gemini_thinking_level: "MEDIUM" },
        promptTemplates: { system: "Translate faithfully", user: "{text}" },
    });

    assert.equal(url, `${apiOrigin}/v1beta/interactions`);
    assert.equal(headers["x-goog-api-key"], "test-key");
    assert.deepEqual(body, {
        model: "gemini-flash-latest",
        input: "Hello",
        system_instruction: "Translate faithfully",
        stream: true,
        store: false,
        generation_config: { thinking_summaries: "auto", thinking_level: "medium" },
    });
    assert.deepEqual(messages.map(({ type, content }) => [type, content]), [
        ["TRANSLATE_THOUGHT", "检查"],
        ["TRANSLATE_THOUGHT", "语境"],
        ["TRANSLATE_CHUNK", "你好"],
        ["TRANSLATE_DONE", undefined],
    ]);
});

it("requests no summary by default and does not treat a truncated interaction as complete", async (t) => {
    const { body, messages } = await translate(t, [step({ type: "text", text: "半截" })], {
        settings: { gemini_model: "gemini-3.8-flash" },
    });
    assert.deepEqual(body.generation_config, {
        thinking_summaries: "none",
        thinking_level: "low",
    });
    assert.deepEqual(messages.map(({ type }) => type), ["TRANSLATE_CHUNK", "TRANSLATE_ERROR"]);
    assert.match(messages.at(-1).error, /stream ended before completion/);
});

it("translates with a manually entered Gemini 4 Argon model and requests summaries", async (t) => {
    const { url, body, messages } = await translate(t, [
        step({ type: "thought_signature", signature: "encrypted" }),
        step({ type: "text", text: "你好" }),
        completed,
    ], {
        settings: {
            gemini_api_url: apiOrigin,
            gemini_model: "custom",
            gemini_custom_model: "models/gemini-4-argon",
            gemini_show_thoughts: true,
            gemini_thinking_level: "minimal",
        },
    });
    assert.equal(url, `${apiOrigin}/v1beta/interactions`);
    assert.equal(body.model, "gemini-4-argon");
    assert.deepEqual(body.generation_config, {
        thinking_summaries: "auto",
        thinking_level: "low",
    });
    assert.deepEqual(messages.map(({ type }) => type), ["TRANSLATE_CHUNK", "TRANSLATE_DONE"]);
});

it("preserves the Gemini 2.5 budget, custom gateway authentication and legacy summaries", async (t) => {
    const { url, body, messages } = await translate(t, [
        { candidates: [{ content: { parts: [
            { text: "摘要", thought: true },
            { text: "你好", thoughtSignature: "encrypted" },
        ] } }] },
    ], {
        settings: {
            gemini_api_url: "https://gateway.example/v1beta/models",
            gemini_model: "gemini-2.5-flash",
            gemini_show_thoughts: true,
            gemini_thinking_budget: 512,
        },
        customPayload: { generationConfig: { temperature: 0.4 } },
    });
    assert.equal(url, "https://gateway.example/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=test-key");
    assert.deepEqual(body.generationConfig, {
        temperature: 0.4,
        thinkingConfig: { includeThoughts: true, thinkingBudget: 512 },
    });
    assert.deepEqual(messages.map(({ type, content }) => [type, content]), [
        ["TRANSLATE_THOUGHT", "摘要"],
        ["TRANSLATE_CHUNK", "你好"],
        ["TRANSLATE_DONE", undefined],
    ]);
});

it("finds Gemini 4 on subsequent model pages when using an explicit Interactions URL", async (t) => {
    const fetch = mockFetch(t, async (url) => ({
        ok: true,
        json: async () => new URL(url).searchParams.has("pageToken")
            ? { models: [{ name: "models/gemini-4-argon" }] }
            : {
                models: [{ name: "models/gemini-3.8-flash" }],
                nextPageToken: "next",
            },
    }));
    const messages = [];
    await handleGeminiGetModels(
        { apiUrl: `${apiOrigin}/v1/interactions`, apiKey: "test-key" },
        { postMessage: (message) => messages.push(message) },
        { connected: true },
    );
    const [url, options] = fetch.mock.calls[0].arguments;
    assert.equal(url, `${apiOrigin}/v1/models`);
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    assert.equal(fetch.mock.calls[1].arguments[0], `${apiOrigin}/v1/models?pageToken=next`);
    assert.deepEqual(messages[0].modelIds, ["gemini-3.8-flash", "gemini-4-argon"]);
});

it("shows streamed summaries in the existing collapsed section and preserves the loading text", (t) => {
    let receive;
    let render;
    const globals = {
        chrome: {
            runtime: {
                connect: () => ({
                    onMessage: { addListener: (listener) => { receive = listener; } },
                    onDisconnect: { addListener() {} },
                }),
            },
        },
        window: { setTimeout: () => 1, clearTimeout() {} },
        requestAnimationFrame: (callback) => { render = callback; return 1; },
    };
    for (const [key, value] of Object.entries(globals)) {
        const previous = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { value, configurable: true });
        t.after(() => {
            if (previous) Object.defineProperty(globalThis, key, previous);
            else delete globalThis[key];
        });
    }

    const streamEl = { innerText: "翻译中", closest: () => null };
    const thoughtEl = { textContent: "" };
    const thoughtDetails = { style: { display: "none" }, open: false };
    const request = {
        requestId: "gemini-test",
        engine: "gemini",
        isThinking: true,
        buffer: "",
        streamEl,
        thoughtEl,
        thoughtDetails,
    };
    const app = {
        state: { activeRequest: request },
        trimEdgeBlankLines: (text) => text.trim(),
        saveTranslationHistory() {},
        setBubbleState() {},
        t: () => "Gemini 本次未返回思考摘要。",
    };
    globalThis.JYT_CS_PORT.install(app);
    app.ensureTranslatePort();

    receive({ type: "TRANSLATE_THOUGHT", requestId: request.requestId, content: "识别术语" });
    render();
    assert.equal(streamEl.innerText, "翻译中");
    assert.equal(thoughtEl.textContent, "识别术语");
    assert.equal(thoughtDetails.style.display, "block");
    assert.equal(thoughtDetails.open, false);

    receive({ type: "TRANSLATE_CHUNK", requestId: request.requestId, content: "你好" });
    render();
    assert.equal(streamEl.innerText, "你好");
    assert.equal(thoughtEl.textContent, "识别术语");

    receive({ type: "TRANSLATE_DONE", requestId: request.requestId });
    assert.equal(thoughtEl.textContent, "识别术语");

    thoughtEl.textContent = "";
    thoughtDetails.style.display = "none";
    app.state.activeRequest = {
        ...request,
        requestId: "gemini-without-summary",
        thoughtBuffer: "",
    };
    receive({ type: "TRANSLATE_DONE", requestId: "gemini-without-summary" });
    assert.equal(streamEl.innerText, "你好");
    assert.equal(thoughtEl.textContent, "Gemini 本次未返回思考摘要。");
    assert.equal(thoughtDetails.style.display, "block");
    assert.equal(thoughtDetails.open, false);
});
