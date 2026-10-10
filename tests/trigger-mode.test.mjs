import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldDirectTranslate } from "../libs/trigger-mode.mjs";

describe("shouldDirectTranslate", () => {
    it("never translates directly in button mode", () => {
        assert.equal(
            shouldDirectTranslate({
                mode: "button",
                altKey: true,
                text: "hello",
                inEditable: false,
            }),
            false,
        );
        assert.equal(
            shouldDirectTranslate({
                mode: "BUTTON",
                altKey: true,
                text: "hello",
            }),
            false,
        );
        assert.equal(shouldDirectTranslate({ mode: "other", text: "hello" }), false);
        assert.equal(shouldDirectTranslate({}), false);
    });

    it("auto mode requires two trimmed characters outside editable fields", () => {
        assert.equal(
            shouldDirectTranslate({ mode: "auto", text: " ab ", inEditable: false }),
            true,
        );
        assert.equal(
            shouldDirectTranslate({ mode: "auto", text: "a", inEditable: false }),
            false,
        );
        assert.equal(
            shouldDirectTranslate({ mode: "auto", text: "  ", inEditable: false }),
            false,
        );
        assert.equal(
            shouldDirectTranslate({ mode: "auto", text: "hello", inEditable: true }),
            false,
        );
    });

    it("alt mode requires altKey and non-empty text outside editable fields", () => {
        assert.equal(
            shouldDirectTranslate({
                mode: "alt",
                altKey: true,
                text: " a ",
                inEditable: false,
            }),
            true,
        );
        assert.equal(
            shouldDirectTranslate({
                mode: "alt",
                altKey: false,
                text: "hello",
                inEditable: false,
            }),
            false,
        );
        assert.equal(
            shouldDirectTranslate({
                mode: "alt",
                altKey: 1,
                text: "hello",
                inEditable: false,
            }),
            false,
        );
        assert.equal(
            shouldDirectTranslate({
                mode: "alt",
                altKey: true,
                text: "   ",
                inEditable: false,
            }),
            false,
        );
        assert.equal(
            shouldDirectTranslate({
                mode: "alt",
                altKey: true,
                text: "hello",
                inEditable: true,
            }),
            false,
        );
    });
});
