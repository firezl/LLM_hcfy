export const BLOCKED_CUSTOM_PAYLOAD_KEYS = Object.freeze(
    new Set([
        "contents",
        "input",
        "messages",
        "model",
        "stream",
        "system",
        "systemInstruction",
    ]),
);

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

export function parseCustomPayload(value) {
    if (!value) {
        return {};
    }
    if (isPlainObject(value)) {
        return value;
    }
    if (typeof value !== "string") {
        return {};
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return {};
    }

    try {
        const parsed = JSON.parse(trimmed);
        return isPlainObject(parsed) ? parsed : {};
    } catch (_err) {
        return {};
    }
}

function deepMerge(base, patch) {
    const next = { ...(base || {}) };
    for (const [key, value] of Object.entries(patch || {})) {
        if (isPlainObject(value) && isPlainObject(next[key])) {
            next[key] = deepMerge(next[key], value);
        } else {
            next[key] = value;
        }
    }
    return next;
}

export function mergeCustomPayload(baseBody, customPayload, options = {}) {
    const blockedKeys = options.blockedKeys || BLOCKED_CUSTOM_PAYLOAD_KEYS;
    const payload = parseCustomPayload(customPayload);
    const allowed = {};
    const skipped = [];

    for (const [key, value] of Object.entries(payload)) {
        if (blockedKeys.has(key)) {
            skipped.push(key);
            continue;
        }
        allowed[key] = value;
    }

    return {
        body: deepMerge(baseBody, allowed),
        skipped,
    };
}
