globalThis.chrome = {};
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it, beforeEach, afterEach } from "node:test";

const { shouldStopAutoChain, tryTranslateHandlerOnce, runAutoTranslateChain } =
    await import("../background/auto-translate-chain.js");
const {
    classifyStreamFailure,
    nextStreamTimerPhase,
    streamChatToPort,
} = await import("../background/engines/openai-compat-stream.js");
const { fetchWithTimeout } = await import("../background/fetch-utils.js");

const LOCALE_CODES = [
    "zh-CN",
    "zh-TW",
    "en",
    "ja",
    "ko",
    "fr",
    "de",
    "es",
    "ru",
    "pt",
];

function abortError() {
    const error = new Error("aborted");
    error.name = "AbortError";
    return error;
}

function hangUntilAbort(signal) {
    return new Promise((resolve, reject) => {
        const fail = () => reject(abortError());
        if (!signal) {
            return;
        }
        if (signal.aborted) {
            fail();
            return;
        }
        signal.addEventListener("abort", fail, { once: true });
    });
}

function mockBingFetch() {
    return async (url, options) => {
        const target = String(url);
        if (target.includes("translate.googleapis.com")) {
            const error = new Error("timed out");
            error.name = "TimeoutError";
            error.code = "FETCH_TIMEOUT";
            throw error;
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
                    return JSON.stringify([{ translations: [{ text: "hello" }] }]);
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

describe("translate cancel and timeout", () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("classifies user abort as silent and timeouts as errors", () => {
        assert.equal(nextStreamTimerPhase("start"), "firstByte");
        assert.equal(nextStreamTimerPhase("headers"), "idle");
        assert.equal(nextStreamTimerPhase("chunk"), "idle");
        assert.equal(nextStreamTimerPhase("done"), null);

        assert.equal(
            classifyStreamFailure({
                timedOut: true,
                timeoutPhase: "firstByte",
            }).errorKey,
            "translate.stream.firstByteTimeout",
        );
        assert.equal(
            classifyStreamFailure({
                timedOut: true,
                timeoutPhase: "idle",
            }).errorKey,
            "translate.stream.idleTimeout",
        );
        assert.equal(
            classifyStreamFailure({
                timedOut: true,
                cancelled: true,
            }).action,
            "silent",
        );
        assert.equal(
            classifyStreamFailure({
                connected: false,
                errorName: "TypeError",
            }).action,
            "silent",
        );
        assert.equal(
            classifyStreamFailure({ errorName: "AbortError" }).action,
            "silent",
        );
        assert.equal(
            classifyStreamFailure({ errorName: "TypeError" }).action,
            "error",
        );
    });

    it("stops the chain when the first handler is cancelled", async () => {
        const calls = [];
        const state = {
            connected: true,
            controllers: new Map(),
            cancelled: new Set(["r1"]),
        };
        const port = { postMessage() {} };
        const result = await tryTranslateHandlerOnce(
            async () => {
                calls.push("first");
                throw abortError();
            },
            { requestId: "r1" },
            port,
            state,
        );
        assert.equal(result.ok, false);
        assert.equal(result.cancelled, true);
        assert.equal(shouldStopAutoChain(state, "r1"), true);

        const swallowed = await tryTranslateHandlerOnce(
            async () => {
                calls.push("swallowed");
            },
            { requestId: "r1" },
            port,
            state,
        );
        assert.equal(swallowed.cancelled, true);
        assert.deepEqual(calls, ["first", "swallowed"]);
    });

    it("does not call the next auto candidate after cancel", async () => {
        let bingCalls = 0;
        let markGoogleStarted;
        const googleStarted = new Promise((resolve) => {
            markGoogleStarted = resolve;
        });

        globalThis.fetch = (url, options) => {
            const target = String(url);
            if (target.includes("translate.googleapis.com")) {
                markGoogleStarted();
                return hangUntilAbort(options?.signal);
            }
            bingCalls += 1;
            return Promise.reject(new Error("next engine should not run"));
        };

        const posted = [];
        const port = {
            postMessage(msg) {
                posted.push(msg);
            },
        };
        const state = {
            connected: true,
            controllers: new Map(),
            cancelled: new Set(),
        };

        const chain = runAutoTranslateChain(
            {
                requestId: "r-cancel",
                text: "hi",
                preferredFrom: "en",
                preferredTo: "zh",
            },
            port,
            state,
            {},
            [],
        );

        await googleStarted;
        state.cancelled.add("r-cancel");
        const controller = state.controllers.get("r-cancel");
        assert.ok(controller, "in-flight fetch should be cancellable");
        controller.abort();

        await chain;
        assert.equal(bingCalls, 0);
        assert.equal(
            posted.some((msg) => msg.type === "TRANSLATE_FALLBACK"),
            false,
        );
        assert.equal(
            posted.some((msg) => msg.type === "TRANSLATE_ERROR"),
            false,
        );
        assert.equal(
            posted.some((msg) => msg.type === "TRANSLATE_USE_BROWSER"),
            false,
        );
    });

    it("falls back when the first handler reports a timeout", async () => {
        globalThis.fetch = mockBingFetch();
        const posted = [];
        const port = {
            postMessage(msg) {
                posted.push(msg);
            },
        };
        const state = {
            connected: true,
            controllers: new Map(),
            cancelled: new Set(),
        };

        await runAutoTranslateChain(
            {
                requestId: "r-timeout",
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
        assert.equal(posted[2].content, "hello");
    });

    it("fetchWithTimeout rejects with TimeoutError", async () => {
        globalThis.fetch = (_url, init) => hangUntilAbort(init?.signal);
        await assert.rejects(
            fetchWithTimeout(
                "https://example.com/translate",
                { method: "GET" },
                {
                    timeoutMs: 30,
                    requestId: "r-fetch",
                    state: {
                        connected: true,
                        controllers: new Map(),
                        cancelled: new Set(),
                    },
                },
            ),
            (err) => err?.name === "TimeoutError" && err?.code === "FETCH_TIMEOUT",
        );
    });

    it("stream first-byte timeout posts TRANSLATE_ERROR", async () => {
        const posted = [];
        const state = {
            connected: true,
            controllers: new Map(),
            cancelled: new Set(),
        };
        await streamChatToPort({
            requestId: "r-stream",
            port: {
                postMessage(msg) {
                    posted.push(msg);
                },
            },
            state,
            firstByteTimeoutMs: 30,
            idleTimeoutMs: 5000,
            requestStream: (signal) => hangUntilAbort(signal),
            parseLine: () => null,
        });
        assert.equal(posted.length, 1);
        assert.equal(posted[0].type, "TRANSLATE_ERROR");
        assert.match(String(posted[0].error), /firstByteTimeout|timed out|超时|逾時/);
    });

    it("stream idle timeout posts TRANSLATE_ERROR", async () => {
        const posted = [];
        await streamChatToPort({
            requestId: "r-idle",
            port: {
                postMessage(msg) {
                    posted.push(msg);
                },
            },
            state: {
                connected: true,
                controllers: new Map(),
                cancelled: new Set(),
            },
            firstByteTimeoutMs: 5000,
            idleTimeoutMs: 30,
            requestStream: async () => ({
                response: {
                    ok: true,
                    status: 200,
                    statusText: "OK",
                    body: {
                        getReader() {
                            return {
                                read() {
                                    return new Promise(() => {});
                                },
                            };
                        },
                    },
                },
            }),
            parseLine: () => null,
        });
        assert.equal(posted.length, 1);
        assert.equal(posted[0].type, "TRANSLATE_ERROR");
        assert.match(String(posted[0].error), /idleTimeout|stalled|超时|逾時/);
    });

    it("user abort during stream does not post TRANSLATE_ERROR", async () => {
        const posted = [];
        const state = {
            connected: true,
            controllers: new Map(),
            cancelled: new Set(),
        };
        const pending = streamChatToPort({
            requestId: "r-user",
            port: {
                postMessage(msg) {
                    posted.push(msg);
                },
            },
            state,
            firstByteTimeoutMs: 5000,
            idleTimeoutMs: 5000,
            requestStream: (signal) => hangUntilAbort(signal),
            parseLine: () => null,
        });
        state.cancelled.add("r-user");
        const controller = state.controllers.get("r-user");
        assert.ok(controller);
        controller.abort();
        await pending;
        assert.equal(posted.length, 0);
    });

    it("keeps new translate error keys aligned across locales", async () => {
        const catalogs = Object.fromEntries(
            await Promise.all(
                LOCALE_CODES.map(async (code) => {
                    const raw = await readFile(
                        resolve("i18n/locales", `${code}.json`),
                        "utf8",
                    );
                    return [code, JSON.parse(raw)];
                }),
            ),
        );
        const required = [
            "translate.fetch.timeout",
            "translate.google.httpFailed",
            "translate.stream.firstByteTimeout",
            "translate.stream.idleTimeout",
            "translate.stream.noReadableBody",
            "translate.stream.requestFailed",
            "translate.stream.requestFailedDetail",
            "translate.history.openFailed",
            "translate.term.fieldsIncomplete",
        ];
        const zh = catalogs["zh-CN"];
        for (const key of required) {
            assert.equal(typeof zh[key], "string", key);
            const placeholders = zh[key].match(/\{[a-zA-Z0-9_]+\}/g) || [];
            for (const code of LOCALE_CODES) {
                const value = catalogs[code][key];
                assert.equal(typeof value, "string", `${code} ${key}`);
                assert.notEqual(value.trim(), "", `${code} ${key}`);
                for (const token of placeholders) {
                    assert.ok(
                        value.includes(token),
                        `${code} ${key} missing ${token}`,
                    );
                }
            }
        }
        for (const code of ["en", "ko", "fr", "de", "es", "ru", "pt"]) {
            for (const key of required) {
                assert.equal(
                    /[\u4e00-\u9fff]/.test(catalogs[code][key]),
                    false,
                    `${code} ${key} still contains Chinese`,
                );
            }
        }
    });
});
