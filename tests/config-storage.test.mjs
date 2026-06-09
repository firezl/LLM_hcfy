import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import vm from "node:vm";

function loadStorageModule() {
    const code = readFileSync(
        resolve("options/modules/config-storage.js"),
        "utf8",
    );
    const sandbox = { globalThis: {} };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox);
    return sandbox.JYT_OPTION_STORAGE;
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

describe("options config storage", () => {
    it("treats custom headers as local-only fields", () => {
        const storage = loadStorageModule();
        const fields = storage.buildLocalOnlyFields({
            openai_api_key: "",
            openai_custom_headers: [],
            openai_system_prompt: "",
        });
        assert.deepEqual(plain(fields.sort()), [
            "openai_api_key",
            "openai_custom_headers",
        ]);
    });

    it("keeps custom headers structured when extracting local payload", () => {
        const storage = loadStorageModule();
        const payload = storage.extractApiKeyPayload(
            ["openai_api_key", "openai_custom_headers"],
            {
                openai_api_key: " sk ",
                openai_custom_headers: [
                    { name: " X-Route ", value: " beta ", enabled: false },
                    { name: "", value: "bad" },
                ],
            },
        );

        assert.deepEqual(plain(payload), {
            openai_api_key: "sk",
            openai_custom_headers: [
                { name: "X-Route", value: "beta", enabled: false },
            ],
        });
    });

    it("strips local-only fields from sync payload", () => {
        const storage = loadStorageModule();
        assert.deepEqual(
            plain(storage.stripApiKeyPayload(
                ["openai_api_key", "openai_custom_headers"],
                {
                    openai_api_key: "sk",
                    openai_custom_headers: [{ name: "X", value: "1" }],
                    openai_system_prompt: "sys",
                },
            )),
            { openai_system_prompt: "sys" },
        );
    });
});
