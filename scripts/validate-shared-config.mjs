import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function diffObjectKeys(left, right) {
    const leftKeys = new Set(Object.keys(left || {}));
    const rightKeys = new Set(Object.keys(right || {}));
    return {
        onlyLeft: [...leftKeys].filter((key) => !rightKeys.has(key)).sort(),
        onlyRight: [...rightKeys].filter((key) => !leftKeys.has(key)).sort(),
    };
}

function assertEqual(name, left, right) {
    if (stableStringify(left) === stableStringify(right)) {
        return;
    }

    const keyDiff = diffObjectKeys(left, right);
    const details = [];
    if (keyDiff.onlyLeft.length > 0) {
        details.push(`only in shared: ${keyDiff.onlyLeft.join(", ")}`);
    }
    if (keyDiff.onlyRight.length > 0) {
        details.push(`only in background: ${keyDiff.onlyRight.join(", ")}`);
    }

    throw new Error(
        `${name} mismatch${details.length ? ` (${details.join("; ")})` : ""}`,
    );
}

async function loadSharedConfig() {
    const sharedPath = resolve("libs/shared-config.js");
    const sharedSource = await readFile(sharedPath, "utf8");
    const sandbox = { globalThis: {} };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(sharedSource, sandbox, { filename: sharedPath });
    if (!sandbox.JYT_SHARED) {
        throw new Error("libs/shared-config.js did not expose JYT_SHARED");
    }
    return sandbox.JYT_SHARED;
}

async function importModule(path) {
    return import(pathToFileURL(resolve(path)).href);
}

const shared = await loadSharedConfig();
const backgroundConfig = await importModule("background/config-defaults.js");
const backgroundConstants = await importModule("background/constants.js");

assertEqual(
    "DEFAULT_SETTINGS",
    shared.DEFAULT_SETTINGS,
    backgroundConfig.DEFAULT_SETTINGS,
);

assertEqual(
    "RECOMMENDED_WEBLLM_MODELS",
    shared.RECOMMENDED_WEBLLM_MODELS,
    backgroundConstants.RECOMMENDED_WEBLLM_MODELS,
);

if (
    shared.DEFAULT_SETTINGS.webllm_model !== backgroundConstants.DEFAULT_WEBLLM_MODEL
) {
    throw new Error(
        `DEFAULT_WEBLLM_MODEL mismatch: shared=${shared.DEFAULT_SETTINGS.webllm_model}, background=${backgroundConstants.DEFAULT_WEBLLM_MODEL}`,
    );
}

console.log("Shared config validation passed");
