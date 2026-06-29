import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import vm from "node:vm";

function loadSettingsFormModule() {
    const code = readFileSync(
        resolve("options/modules/settings-form.js"),
        "utf8",
    );
    const sandbox = {
        globalThis: {},
        JYT_ENGINE_REGISTRY: { ENGINE_DEFINITIONS: [] }
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox);
    return sandbox.JYT_OPTION_SETTINGS;
}

describe("isDeepEqual in settings-form", () => {
    it("compares primitive values and deep objects/arrays correctly", () => {
        const settingsModule = loadSettingsFormModule();
        const deps = {
            els: {},
            showToast: () => {},
            applyTheme: () => {},
            DEFAULT_SETTINGS: {},
            API_KEY_FIELDS: [],
            LLM_ENGINES: new Set(),
            OPENAI_COMPAT_MODEL_ENGINES: [],
            modelLists: {
                populateOllamaModelSelect: () => {},
                populateOpenAICompatModelSelect: () => {},
                populateOpenRouterModelSelect: () => {},
                getSelectedOpenAICompatModel: () => {},
                getSelectedOpenRouterModel: () => {},
            },
            shortcutsModule: {
                normalizeShortcut: (x) => x,
            },
            updateEngineDependentUI: () => {},
            extractApiKeyPayload: () => {},
            collectMissingLocalApiKeys: () => {},
            stripApiKeyPayload: () => {},
            requestOptionalHostPermissions: () => {},
            modelListLoaded: new Set(),
        };

        const formInstance = settingsModule.createSettingsForm(deps);
        const isDeepEqual = formInstance.isDeepEqual;

        // Simple values
        assert.ok(isDeepEqual(1, 1));
        assert.ok(!isDeepEqual(1, 2));
        assert.ok(isDeepEqual("hello", "hello"));
        assert.ok(!isDeepEqual("hello", "world"));
        assert.ok(isDeepEqual(true, true));
        assert.ok(!isDeepEqual(true, false));
        assert.ok(isDeepEqual(null, null));
        assert.ok(!isDeepEqual(null, undefined));

        // Objects
        assert.ok(isDeepEqual({ a: 1, b: "2" }, { a: 1, b: "2" }));
        assert.ok(!isDeepEqual({ a: 1, b: "2" }, { a: 1, b: "3" }));
        assert.ok(!isDeepEqual({ a: 1, b: "2" }, { a: 1 }));

        // Nested objects
        assert.ok(isDeepEqual({ a: { b: 1 } }, { a: { b: 1 } }));
        assert.ok(!isDeepEqual({ a: { b: 1 } }, { a: { b: 2 } }));

        // Arrays of objects (like custom headers)
        const arr1 = [{ name: "h1", value: "v1", enabled: true }];
        const arr2 = [{ name: "h1", value: "v1", enabled: true }];
        const arr3 = [{ name: "h1", value: "v1", enabled: false }];
        const arr4 = [{ name: "h1", value: "v2", enabled: true }];
        const arr5 = [{ name: "h1", value: "v1", enabled: true }, { name: "h2", value: "v2" }];

        assert.ok(isDeepEqual(arr1, arr2));
        assert.ok(!isDeepEqual(arr1, arr3));
        assert.ok(!isDeepEqual(arr1, arr4));
        assert.ok(!isDeepEqual(arr1, arr5));
    });
});
