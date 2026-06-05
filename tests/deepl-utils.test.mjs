import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    buildDeepLRequestBody,
    extractDeepLTranslation,
    isOfficialDeepLEndpoint,
    normalizeDeepLLanguage,
} from "../background/engines/deepl-utils.js";

describe("deepl-utils", () => {
    it("normalizes extension language codes", () => {
        assert.equal(normalizeDeepLLanguage("zh"), "ZH");
        assert.equal(normalizeDeepLLanguage("en"), "EN");
        assert.equal(normalizeDeepLLanguage("auto"), "");
    });

    it("builds official and free request bodies", () => {
        assert.deepEqual(
            buildDeepLRequestBody({
                text: "hello",
                from: "en",
                to: "zh",
                official: true,
            }),
            {
                text: ["hello"],
                source_lang: "EN",
                target_lang: "ZH",
            },
        );

        assert.deepEqual(
            buildDeepLRequestBody({
                text: "hello",
                from: "auto",
                to: "de",
                official: false,
            }),
            {
                text: "hello",
                target_lang: "DE",
            },
        );
    });

    it("detects official DeepL endpoint paths", () => {
        assert.equal(
            isOfficialDeepLEndpoint("http://localhost:1188/v2/translate"),
            true,
        );
        assert.equal(
            isOfficialDeepLEndpoint("http://localhost:1188/translate"),
            false,
        );
    });

    it("extracts translations from both response formats", () => {
        assert.equal(
            extractDeepLTranslation({ data: "你好" }),
            "你好",
        );
        assert.equal(
            extractDeepLTranslation({
                translations: [{ text: "你好" }, { text: "世界" }],
            }),
            "你好\n世界",
        );
    });
});
