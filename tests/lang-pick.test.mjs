import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickDetectedLang } from "../libs/lang-pick.mjs";

describe("pickDetectedLang", () => {
    it("skips a fulfilled null and keeps the later detection", () => {
        assert.equal(
            pickDetectedLang([
                { status: "fulfilled", value: null },
                { status: "fulfilled", value: "en" },
                { status: "fulfilled", value: "zh" },
            ]),
            "en",
        );
    });

    it("skips rejected and empty-string results", () => {
        assert.equal(
            pickDetectedLang([
                { status: "rejected", reason: new Error("detector failed") },
                { status: "fulfilled", value: "" },
                { status: "fulfilled", value: "   " },
                { status: "fulfilled", value: "ja" },
            ]),
            "ja",
        );
    });

    it("returns an empty string when nothing usable is present", () => {
        assert.equal(pickDetectedLang(null), "");
        assert.equal(pickDetectedLang(undefined), "");
        assert.equal(pickDetectedLang([]), "");
        assert.equal(
            pickDetectedLang([
                { status: "fulfilled", value: null },
                { status: "rejected", reason: "x" },
                { status: "fulfilled", value: 12 },
            ]),
            "",
        );
    });
});
