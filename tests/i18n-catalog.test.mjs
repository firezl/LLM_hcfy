import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import vm from "node:vm";

const LOCALES_DIR = resolve("i18n/locales");
const BASE_LOCALE = "en";

async function loadLocale(code) {
    const raw = await readFile(resolve(LOCALES_DIR, `${code}.json`), "utf8");
    return JSON.parse(raw);
}

describe("i18n locale catalog", () => {
    it("keeps the same key set across all locales", async () => {
        const codes = [
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
        const catalogs = Object.fromEntries(
            await Promise.all(codes.map(async (code) => [code, await loadLocale(code)])),
        );
        const baseKeys = Object.keys(catalogs[BASE_LOCALE]).sort();

        for (const code of codes) {
            const keys = Object.keys(catalogs[code]).sort();
            assert.deepEqual(
                keys,
                baseKeys,
                `Locale ${code} key set differs from ${BASE_LOCALE}`,
            );
        }
    });

    it("has no empty translation values", async () => {
        const en = await loadLocale(BASE_LOCALE);
        for (const [key, value] of Object.entries(en)) {
            assert.equal(
                typeof value,
                "string",
                `Expected string value for ${key}`,
            );
            assert.notEqual(value.trim(), "", `Empty value for ${key}`);
        }
    });
});

const CONTENT_DIR = resolve("content");
const CONTENT_BUNDLE = resolve("libs/i18n-content-messages.js");
const LITERAL_T_PATTERN =
    /(?:(?<![\w.])t|(?<![\w.])app\.t)\(\s*(['"])([^'"\\]+)\1/g;

async function listContentJsFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listContentJsFiles(full)));
        } else if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(full);
        }
    }
    return files;
}

async function collectLiteralContentKeys() {
    const files = await listContentJsFiles(CONTENT_DIR);
    const keys = new Set();
    for (const file of files) {
        const source = await readFile(file, "utf8");
        for (const match of source.matchAll(LITERAL_T_PATTERN)) {
            keys.add(match[2]);
        }
    }
    return keys;
}

async function loadContentBundle() {
    const source = await readFile(CONTENT_BUNDLE, "utf8");
    const sandbox = vm.createContext({ window: {} });
    vm.runInContext(source, sandbox);
    return {
        source,
        messages: sandbox.JYT_I18N_MESSAGES,
        scope: sandbox.JYT_I18N_SCOPE,
    };
}

describe("content i18n bundle", () => {
    it("sets the content scope before messages", async () => {
        const { source, scope } = await loadContentBundle();
        assert.match(source, /JYT_I18N_SCOPE = "content"/);
        assert.equal(scope, "content");
    });

    it("includes every literal t() key used by content scripts", async () => {
        const { messages } = await loadContentBundle();
        const keys = [...(await collectLiteralContentKeys())].sort();
        assert.ok(keys.length > 0, "expected literal translation keys in content/");
        const en = messages.en || {};
        const zh = messages["zh-CN"] || {};
        for (const key of keys) {
            assert.ok(
                Object.prototype.hasOwnProperty.call(en, key) ||
                    Object.prototype.hasOwnProperty.call(zh, key),
                `content bundle missing literal key ${key}`,
            );
        }
    });

    it("omits settings-page options keys", async () => {
        const { messages } = await loadContentBundle();
        const en = await loadLocale(BASE_LOCALE);
        const sample = "options.actions.saveAll";
        assert.equal(typeof en[sample], "string");
        assert.equal(
            Object.prototype.hasOwnProperty.call(messages.en || {}, sample),
            false,
            `${sample} should stay out of the content bundle`,
        );
        assert.equal(
            typeof messages.en?.["options.engine.auto.candidate.openai"],
            "string",
        );
    });

    it("stays well under the full message bundle", async () => {
        const source = await readFile(CONTENT_BUNDLE);
        assert.ok(
            source.byteLength <= 120 * 1024,
            `content bundle is ${source.byteLength} bytes`,
        );
    });
});
