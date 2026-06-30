import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

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
