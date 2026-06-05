import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    isMachineTranslateEngine,
    isPdfViewerPage,
    normalizePdfSelectionText,
} from "../libs/pdf-text-normalize.mjs";

describe("pdf-text-normalize", () => {
    it("detects machine translation engines", () => {
        assert.equal(isMachineTranslateEngine("deepl"), true);
        assert.equal(isMachineTranslateEngine("openai"), false);
    });

    it("detects pdf viewer page path", () => {
        assert.equal(
            isPdfViewerPage("/vendor/pdfjs/web/viewer.html"),
            true,
        );
        assert.equal(isPdfViewerPage("/article"), false);
    });

    it("joins english hyphenated line breaks", () => {
        assert.equal(
            normalizePdfSelectionText("The exper-\niment shows"),
            "The experiment shows",
        );
    });

    it("joins wrapped english sentences", () => {
        assert.equal(
            normalizePdfSelectionText(
                "The quick brown\nfox jumps over\nthe lazy dog.",
            ),
            "The quick brown fox jumps over the lazy dog.",
        );
    });

    it("joins wrapped chinese lines", () => {
        assert.equal(
            normalizePdfSelectionText("这是一段\n中文文本"),
            "这是一段中文文本",
        );
    });

    it("preserves paragraph boundaries", () => {
        assert.equal(
            normalizePdfSelectionText("First para line.\n\nSecond para line."),
            "First para line.\n\nSecond para line.",
        );
    });

    it("returns trimmed text without newlines unchanged", () => {
        assert.equal(normalizePdfSelectionText("  plain text  "), "plain text");
    });
});
