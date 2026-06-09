import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    mergeCustomPayload,
    parseCustomPayload,
} from "../background/engines/custom-payload.js";

describe("custom payload", () => {
    it("parses only JSON objects", () => {
        assert.deepEqual(parseCustomPayload('{"temperature":0.2}'), {
            temperature: 0.2,
        });
        assert.deepEqual(parseCustomPayload("[1,2]"), {});
        assert.deepEqual(parseCustomPayload("not json"), {});
    });

    it("merges sampling params and nested provider params", () => {
        const result = mergeCustomPayload(
            {
                model: "m",
                stream: true,
                temperature: 1,
                parameters: {
                    result_format: "message",
                    enable_thinking: false,
                },
            },
            {
                temperature: 0.2,
                parameters: {
                    top_k: 40,
                },
            },
        );

        assert.deepEqual(result.body, {
            model: "m",
            stream: true,
            temperature: 0.2,
            parameters: {
                result_format: "message",
                enable_thinking: false,
                top_k: 40,
            },
        });
        assert.deepEqual(result.skipped, []);
    });

    it("skips protected top-level payload keys", () => {
        const result = mergeCustomPayload(
            {
                model: "safe",
                messages: [{ role: "user", content: "x" }],
                stream: true,
            },
            {
                model: "unsafe",
                messages: [],
                stream: false,
                temperature: 0.5,
            },
        );

        assert.equal(result.body.model, "safe");
        assert.deepEqual(result.body.messages, [
            { role: "user", content: "x" },
        ]);
        assert.equal(result.body.stream, true);
        assert.equal(result.body.temperature, 0.5);
        assert.deepEqual(result.skipped, ["model", "messages", "stream"]);
    });
});
