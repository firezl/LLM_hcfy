globalThis.chrome = {};
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

const {
    buildTranslateRequestForEngine,
    runAutoTranslateChain,
    tryTranslateHandlerOnce,
} = await import("../background/auto-translate-chain.js");

function mockBingFetch() {
    return async (url, options) => {
        const target = String(url);
        if (target.includes("translate.googleapis.com")) {
            return {
                ok: false,
                status: 503,
                async text() {
                    return "google down";
                },
            };
        }
        if (target.includes("bing.com") && (!options || options.method === "GET")) {
            return {
                ok: true,
                status: 200,
                url: "https://www.bing.com/translator",
                async text() {
                    return 'IG:"abc" data-iid="translator.5028" params_AbusePreventionHelper = [123,"token123"]';
                },
            };
        }
        if (target.includes("ttranslatev3")) {
            return {
                ok: true,
                status: 200,
                async text() {
                    return JSON.stringify([
                        { translations: [{ text: "hello" }] },
                    ]);
                },
            };
        }
        return {
            ok: false,
            status: 500,
            async text() {
                return "unexpected fetch";
            },
        };
    };
}

describe("auto-translate-chain", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("forwards chunks and resolves on TRANSLATE_DONE", async () => {
        const posted = [];
        const port = {
            postMessage(msg) {
                posted.push(msg);
            },
        };
        const state = { connected: true };

        const handler = async (_request, handlerPort) => {
            handlerPort.postMessage({
                type: "TRANSLATE_CHUNK",
                requestId: "r1",
                content: "你好",
            });
            handlerPort.postMessage({ type: "TRANSLATE_DONE", requestId: "r1" });
        };

        const result = await tryTranslateHandlerOnce(
            handler,
            { requestId: "r1" },
            port,
            state,
        );

        assert.equal(result.ok, true);
        assert.deepEqual(
            posted.map((msg) => msg.type),
            ["TRANSLATE_CHUNK", "TRANSLATE_DONE"],
        );
    });

    it("does not forward TRANSLATE_ERROR to the real port", async () => {
        const posted = [];
        const port = {
            postMessage(msg) {
                posted.push(msg);
            },
        };
        const state = { connected: true };

        const handler = async (_request, handlerPort) => {
            handlerPort.postMessage({
                type: "TRANSLATE_ERROR",
                requestId: "r1",
                error: "boom",
            });
        };

        const result = await tryTranslateHandlerOnce(
            handler,
            { requestId: "r1" },
            port,
            state,
        );

        assert.equal(result.ok, false);
        assert.equal(result.error, "boom");
        assert.equal(posted.length, 0);
    });

    it("falls back through auto candidates in background", async () => {
        globalThis.fetch = mockBingFetch();

        const posted = [];
        const port = {
            postMessage(msg) {
                posted.push(msg);
            },
        };
        const state = { connected: true };

        await runAutoTranslateChain(
            {
                requestId: "r1",
                text: "hi",
                preferredFrom: "en",
                preferredTo: "zh",
            },
            port,
            state,
            {},
            [],
        );

        assert.deepEqual(
            posted.map((msg) => msg.type),
            [
                "TRANSLATE_ENGINE_STARTED",
                "TRANSLATE_FALLBACK",
                "TRANSLATE_CHUNK",
                "TRANSLATE_DONE",
            ],
        );
        assert.equal(posted[0].engine, "google");
        assert.equal(posted[1].engine, "bing");
        assert.ok(String(posted[1].previousError).includes("503"));
    });

    it("delegates browser candidate to content after backend failures", async () => {
        globalThis.fetch = async () => ({
            ok: false,
            status: 503,
            async text() {
                return "unavailable";
            },
        });

        const posted = [];
        const port = {
            postMessage(msg) {
                posted.push(msg);
            },
        };
        const state = { connected: true };

        await runAutoTranslateChain(
            {
                requestId: "r2",
                text: "hi",
                preferredFrom: "en",
                preferredTo: "zh",
            },
            port,
            state,
            {
                llm_engine: "openai",
                openai_api_url: "",
                deepl_api_url: "",
                deeplx_api_url: "",
            },
            [],
        );

        assert.equal(posted.at(-1)?.type, "TRANSLATE_USE_BROWSER");
        assert.equal(posted.at(-1)?.requestId, "r2");
        assert.ok(posted.at(-1)?.previousError);
    });

    it("builds per-engine prompt settings in requests", () => {
        const request = buildTranslateRequestForEngine(
            { requestId: "r1", text: "hello", context: { title: "x" } },
            {
                openai_system_prompt: "sys",
                openai_user_prompt: "user",
            },
            "openai",
            [],
        );

        assert.equal(request.promptTemplates.system, "sys");
        assert.equal(request.promptTemplates.user, "user");
        assert.equal(request.glossaryTerms.length, 0);
    });
});
