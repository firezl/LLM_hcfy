import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    mergeCustomHeaders,
    normalizeCustomHeaders,
} from "../background/engines/custom-headers.js";

describe("custom headers", () => {
    it("normalizes enabled custom headers", () => {
        assert.deepEqual(
            normalizeCustomHeaders([
                { name: " X-Route ", value: " test ", enabled: true },
                { name: "", value: "empty" },
                { name: "Bad Header", value: "x" },
            ]),
            [{ name: "X-Route", value: "test", enabled: true }],
        );
    });

    it("merges custom headers without overriding protected headers", () => {
        const result = mergeCustomHeaders(
            {
                "Content-Type": "application/json",
                Authorization: "Bearer key",
            },
            [
                { name: "X-Route", value: "beta", enabled: true },
                { name: "Authorization", value: "bad", enabled: true },
                { name: "Content-Type", value: "text/plain", enabled: true },
                { name: "X-Off", value: "off", enabled: false },
            ],
        );

        assert.equal(result.headers["X-Route"], "beta");
        assert.equal(result.headers.Authorization, "Bearer key");
        assert.equal(result.headers["Content-Type"], "application/json");
        assert.equal(result.headers["X-Off"], undefined);
        assert.deepEqual(result.skipped, ["Authorization", "Content-Type"]);
    });
});
