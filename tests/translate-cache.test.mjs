globalThis.chrome = globalThis.chrome || {};
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildCacheKey,
    buildCacheMaterial,
    createCachingPort,
    createTranslateCache,
    lookupCacheEntry,
    postCachedTranslation,
} from "../background/translate-cache.js";

function baseSettings(extra = {}) {
    return {
        context_translate_mode: "enhanced",
        llm_engine: "openai",
        openai_api_url: "",
        openai_api_key: "",
        openai_model: "gpt-test",
        openai_custom_model: "",
        openai_custom_prompt: "",
        openai_system_prompt: "",
        openai_user_prompt: "translate {text}",
        deepl_api_url: "",
        deeplx_api_url: "",
        ...extra,
    };
}

function baseMessage(extra = {}) {
    return {
        text: "hello",
        preferredFrom: "en",
        preferredTo: "zh",
        context: {
            selectedText: "hello",
            before: "before",
            after: "after",
        },
        ...extra,
    };
}

describe("translate cache", () => {
    it("returns the full cached text for the same key and misses a different text", async () => {
        const cache = createTranslateCache();
        const settings = baseSettings();
        const key = await buildCacheKey({
            engine: "google",
            settings,
            message: baseMessage(),
            glossaryTerms: [],
        });
        assert.equal(
            cache.set(key, { engine: "google", text: "你好" }),
            true,
        );
        assert.deepEqual(cache.get(key), { engine: "google", text: "你好" });

        const other = await buildCacheKey({
            engine: "google",
            settings,
            message: baseMessage({ text: "world" }),
            glossaryTerms: [],
        });
        assert.notEqual(other, key);
        assert.equal(cache.get(other), undefined);
    });

    it("does not read the old value when bypass is set, and does not refresh LRU", () => {
        const cache = createTranslateCache({ maxEntries: 2 });
        cache.set("a", { engine: "google", text: "A" });
        cache.set("b", { engine: "google", text: "B" });
        assert.equal(lookupCacheEntry(cache, "a", true), undefined);
        cache.set("c", { engine: "google", text: "C" });
        assert.equal(cache.get("a"), undefined);
        assert.equal(cache.get("b").text, "B");
        assert.equal(cache.get("c").text, "C");
    });

    it("evicts the oldest entry at 201 and refreshes on read", () => {
        const cache = createTranslateCache();
        for (let i = 0; i <= 200; i += 1) {
            cache.set(String(i), { engine: "google", text: `t${i}` });
        }
        assert.equal(cache.size, 200);
        assert.equal(cache.get("0"), undefined);
        assert.equal(cache.get("1").text, "t1");
        assert.equal(cache.get("200").text, "t200");

        const small = createTranslateCache({ maxEntries: 2 });
        small.set("a", { engine: "google", text: "A" });
        small.set("b", { engine: "google", text: "B" });
        assert.equal(small.get("a").text, "A");
        small.set("c", { engine: "google", text: "C" });
        assert.equal(small.get("a").text, "A");
        assert.equal(small.get("b"), undefined);
    });

    it("does not store empty text, errors, browser fallback, or a cancel without DONE", () => {
        const cache = createTranslateCache();
        assert.equal(cache.set("empty", { engine: "google", text: "  " }), false);
        assert.equal(cache.size, 0);

        const stored = [];
        const port = createCachingPort(
            { postMessage() {} },
            {
                initialEngine: "google",
                onResult(entry) {
                    stored.push(entry);
                },
            },
        );
        port.postMessage({ type: "TRANSLATE_CHUNK", content: "半截" });
        port.postMessage({ type: "TRANSLATE_ERROR", error: "nope" });
        port.postMessage({ type: "TRANSLATE_DONE" });
        assert.deepEqual(stored, []);

        const browser = [];
        const browserPort = createCachingPort(
            { postMessage() {} },
            {
                initialEngine: "",
                onResult(entry) {
                    browser.push(entry);
                },
            },
        );
        browserPort.postMessage({
            type: "TRANSLATE_ENGINE_STARTED",
            engine: "google",
        });
        browserPort.postMessage({ type: "TRANSLATE_CHUNK", content: "partial" });
        browserPort.postMessage({ type: "TRANSLATE_USE_BROWSER" });
        browserPort.postMessage({ type: "TRANSLATE_DONE" });
        assert.deepEqual(browser, []);

        const cancelled = [];
        const cancelPort = createCachingPort(
            { postMessage() {} },
            {
                initialEngine: "openai",
                onResult(entry) {
                    cancelled.push(entry);
                },
            },
        );
        cancelPort.postMessage({ type: "TRANSLATE_CHUNK", content: "半截" });
        assert.deepEqual(cancelled, []);
    });

    it("keeps only the successful engine text after fallback", () => {
        const stored = [];
        const forwarded = [];
        const port = createCachingPort(
            {
                postMessage(message) {
                    forwarded.push(message);
                },
            },
            {
                onResult(entry) {
                    stored.push(entry);
                },
            },
        );
        port.postMessage({
            type: "TRANSLATE_ENGINE_STARTED",
            engine: "openai",
        });
        port.postMessage({ type: "TRANSLATE_CHUNK", content: "坏" });
        port.postMessage({ type: "TRANSLATE_FALLBACK", engine: "google" });
        port.postMessage({ type: "TRANSLATE_CHUNK", content: "你好" });
        port.postMessage({ type: "TRANSLATE_DONE" });
        assert.deepEqual(stored, [{ engine: "google", text: "你好" }]);
        assert.equal(forwarded.at(-1).type, "TRANSLATE_DONE");
    });

    it("replays a hit as engine started, one full chunk, and done", () => {
        const messages = [];
        const port = {
            postMessage(message) {
                messages.push(message);
            },
        };
        const sent = postCachedTranslation(
            port,
            { connected: true, cancelled: new Set() },
            "r1",
            { engine: "google", text: "你好" },
        );
        assert.equal(sent, true);
        assert.deepEqual(messages, [
            { type: "TRANSLATE_ENGINE_STARTED", requestId: "r1", engine: "google" },
            { type: "TRANSLATE_CHUNK", requestId: "r1", content: "你好" },
            { type: "TRANSLATE_DONE", requestId: "r1" },
        ]);

        const skipped = [];
        assert.equal(
            postCachedTranslation(
                { postMessage: (message) => skipped.push(message) },
                { connected: true, cancelled: new Set(["r2"]) },
                "r2",
                { engine: "google", text: "你好" },
            ),
            false,
        );
        assert.equal(
            postCachedTranslation(
                { postMessage: (message) => skipped.push(message) },
                { connected: false, cancelled: new Set() },
                "r3",
                { engine: "google", text: "你好" },
            ),
            false,
        );
        assert.deepEqual(skipped, []);
    });

    it("builds a stable key without api keys and changes when prompt, model, or text changes", async () => {
        const settings = baseSettings({
            openai_api_url: "https://api.openai.com/v1/chat/completions",
            openai_api_key: "sk-secret-xyz",
            openai_model: "gpt-test",
        });
        const message = baseMessage();
        const glossaryTerms = [
            { sourceTerm: "hello", targetTerm: "你好", sourceLang: "en", targetLang: "zh" },
        ];
        const input = {
            engine: "openai",
            settings,
            message,
            glossaryTerms,
        };
        const material = buildCacheMaterial(input);
        assert.equal(material.engine, "openai");
        assert.equal(material.model, "gpt-test");
        assert.equal(material.context.before, "before");
        assert.deepEqual(material.glossary, [
            { sourceTerm: "hello", targetTerm: "你好" },
        ]);
        assert.equal(JSON.stringify(material).includes("sk-secret-xyz"), false);

        const key = await buildCacheKey(input);
        assert.equal(await buildCacheKey(input), key);

        const google = buildCacheMaterial({
            ...input,
            engine: "google",
        });
        assert.equal(google.context, null);

        const auto = buildCacheMaterial({
            ...input,
            engine: "auto",
        });
        assert.equal(auto.engine, "auto");
        assert.equal(auto.model, "");
        assert.equal(auto.context.before, "before");
        assert.equal(auto.candidates[0].engine, "openai");
        assert.equal(auto.prompts[0].engine, "openai");
        assert.equal(auto.prompts[0].user, "translate {text}");

        const changedPrompt = await buildCacheKey({
            ...input,
            settings: { ...settings, openai_user_prompt: "other" },
        });
        const changedModel = await buildCacheKey({
            ...input,
            settings: { ...settings, openai_model: "gpt-other" },
        });
        const changedKey = await buildCacheKey({
            ...input,
            settings: { ...settings, openai_api_key: "sk-other" },
        });
        assert.notEqual(changedPrompt, key);
        assert.notEqual(changedModel, key);
        assert.equal(changedKey, key);

        const customModel = buildCacheMaterial({
            ...input,
            settings: {
                ...settings,
                openai_model: "custom",
                openai_custom_model: "my-model",
            },
        });
        assert.equal(customModel.model, "my-model");
    });
});

function storageGet(store, keys) {
    if (Array.isArray(keys)) {
        const out = {};
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(store, key)) {
                out[key] = store[key];
            }
        }
        return out;
    }
    if (keys && typeof keys === "object") {
        const out = {};
        for (const key of Object.keys(keys)) {
            out[key] = Object.prototype.hasOwnProperty.call(store, key)
                ? store[key]
                : keys[key];
        }
        return out;
    }
    return { ...store };
}

function installFakeIndexedDb() {
    if (typeof indexedDB !== "undefined" && typeof indexedDB.open === "function") {
        return;
    }
    globalThis.indexedDB = {
        open() {
            const request = {
                result: {
                    objectStoreNames: { contains: () => true },
                },
                error: null,
            };
            queueMicrotask(() => {
                if (typeof request.onsuccess === "function") {
                    request.onsuccess();
                }
            });
            return request;
        },
    };
}

describe("handleTranslateStart cache", () => {
    it("hits memory cache without a second upstream request", async () => {
        installFakeIndexedDb();
        const syncStore = {
            engine: "google",
            translate_cache_enabled: true,
            glossary_enabled: false,
        };
        const localStore = { glossary_migrated_v1: true };
        globalThis.chrome = {
            runtime: { getURL: () => "chrome-extension://test/" },
            storage: {
                sync: {
                    get: (keys) => Promise.resolve(storageGet(syncStore, keys)),
                    set: (items) => {
                        Object.assign(syncStore, items);
                        return Promise.resolve();
                    },
                },
                local: {
                    get: (keys) => Promise.resolve(storageGet(localStore, keys)),
                    set: (items) => {
                        Object.assign(localStore, items);
                        return Promise.resolve();
                    },
                },
                onChanged: { addListener() {} },
            },
        };

        const { refreshSettings } = await import("../background/settings-cache.js");
        const { handleTranslateStart } = await import("../background/translate-router.js");
        const { translateCache } = await import("../background/translate-cache.js");
        translateCache.clear();
        await refreshSettings();

        let fetches = 0;
        globalThis.fetch = async () => {
            fetches += 1;
            return {
                ok: true,
                status: 200,
                async json() {
                    return [[["你好", "hello"]]];
                },
            };
        };

        const state = {
            connected: true,
            cancelled: new Set(),
            controllers: new Map(),
        };
        const first = [];
        await handleTranslateStart(
            {
                requestId: "r1",
                text: "hello cache",
                preferredFrom: "en",
                preferredTo: "zh",
                engine: "google",
            },
            { postMessage: (message) => first.push(message) },
            state,
        );
        assert.equal(fetches, 1);
        assert.equal(first.some((message) => message.type === "TRANSLATE_DONE"), true);

        const second = [];
        await handleTranslateStart(
            {
                requestId: "r2",
                text: "hello cache",
                preferredFrom: "en",
                preferredTo: "zh",
                engine: "google",
            },
            { postMessage: (message) => second.push(message) },
            state,
        );
        assert.equal(fetches, 1);
        assert.deepEqual(
            second.map((message) => message.type),
            ["TRANSLATE_ENGINE_STARTED", "TRANSLATE_CHUNK", "TRANSLATE_DONE"],
        );
        assert.equal(second[1].content, "你好");

        const bypassed = [];
        await handleTranslateStart(
            {
                requestId: "r3",
                text: "hello cache",
                preferredFrom: "en",
                preferredTo: "zh",
                engine: "google",
                bypassCache: true,
            },
            { postMessage: (message) => bypassed.push(message) },
            state,
        );
        assert.equal(fetches, 2);
        assert.equal(
            bypassed.some((message) => message.type === "TRANSLATE_ENGINE_STARTED"),
            false,
        );

        const errored = [];
        globalThis.fetch = async () => {
            fetches += 1;
            return {
                ok: false,
                status: 500,
                async text() {
                    return "upstream down";
                },
                async json() {
                    return {};
                },
            };
        };
        await handleTranslateStart(
            {
                requestId: "r4",
                text: "unique failure",
                preferredFrom: "en",
                preferredTo: "zh",
                engine: "google",
            },
            { postMessage: (message) => errored.push(message) },
            state,
        );
        const fetchesAfterError = fetches;
        await handleTranslateStart(
            {
                requestId: "r5",
                text: "unique failure",
                preferredFrom: "en",
                preferredTo: "zh",
                engine: "google",
            },
            { postMessage() {} },
            state,
        );
        assert.equal(fetches, fetchesAfterError + 1);
        assert.equal(errored.some((message) => message.type === "TRANSLATE_ERROR"), true);
        assert.equal(errored.some((message) => message.type === "TRANSLATE_DONE"), false);

        const cancelledMessages = [];
        state.cancelled.add("r6");
        const fetchesBeforeCancel = fetches;
        globalThis.fetch = async () => {
            fetches += 1;
            return {
                ok: true,
                status: 200,
                async json() {
                    return [[["缓存", "hello"]]];
                },
            };
        };
        await handleTranslateStart(
            {
                requestId: "r6",
                text: "hello cache",
                preferredFrom: "en",
                preferredTo: "zh",
                engine: "google",
            },
            { postMessage: (message) => cancelledMessages.push(message) },
            state,
        );
        assert.deepEqual(cancelledMessages, []);
        assert.equal(fetches, fetchesBeforeCancel);
    });
});
