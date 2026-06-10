import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    extractChoiceDelta,
    parseSseJsonLine,
} from "../background/engines/openai-compat-stream.js";

describe("openai-compat-stream", () => {
    it("returns null for empty or non-data lines", () => {
        assert.equal(parseSseJsonLine(""), null);
        assert.equal(parseSseJsonLine("event: ping"), null);
    });

    it("returns null for [DONE]", () => {
        assert.equal(parseSseJsonLine("data: [DONE]"), null);
    });

    it("parses valid SSE JSON payloads", () => {
        const payload = parseSseJsonLine(
            'data: {"choices":[{"delta":{"content":"hi"}}]}',
        );
        assert.equal(payload.choices[0].delta.content, "hi");
    });

    it("returns null for malformed JSON", () => {
        assert.equal(parseSseJsonLine("data: {not-json"), null);
    });

    it("extracts choice delta", () => {
        const delta = extractChoiceDelta({
            choices: [{ delta: { content: "x", reasoning_content: "y" } }],
        });
        assert.equal(delta.content, "x");
        assert.equal(delta.reasoning_content, "y");
    });

    it("throws error for error payload in parseSseJsonLine", () => {
        assert.throws(() => {
            parseSseJsonLine('data: {"error":{"message":"API key invalid"}}');
        }, /API key invalid/);

        assert.throws(() => {
            parseSseJsonLine('data: {"code":"InvalidParameter","message":"url error"}');
        }, /InvalidParameter: url error/);
    });
});
