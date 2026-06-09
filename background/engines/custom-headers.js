const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export const BLOCKED_CUSTOM_HEADER_NAMES = Object.freeze(
    new Set([
        "accept",
        "authorization",
        "content-type",
        "x-api-key",
        "anthropic-version",
    ]),
);

export function normalizeCustomHeaders(value) {
    const input = Array.isArray(value) ? value : [];
    const headers = [];

    for (const item of input) {
        if (!item || typeof item !== "object") {
            continue;
        }

        const name = String(item.name || "").trim();
        const headerValue = String(item.value || "").trim();
        if (!name || !headerValue || !HEADER_NAME_RE.test(name)) {
            continue;
        }

        headers.push({
            name,
            value: headerValue,
            enabled: item.enabled !== false,
        });
    }

    return headers;
}

export function mergeCustomHeaders(baseHeaders, customHeaders) {
    const headers = { ...(baseHeaders || {}) };
    const existingNames = new Set(
        Object.keys(headers).map((name) => name.toLowerCase()),
    );
    const skipped = [];

    for (const item of normalizeCustomHeaders(customHeaders)) {
        if (!item.enabled) {
            continue;
        }

        const normalizedName = item.name.toLowerCase();
        if (
            BLOCKED_CUSTOM_HEADER_NAMES.has(normalizedName) ||
            existingNames.has(normalizedName)
        ) {
            skipped.push(item.name);
            continue;
        }

        headers[item.name] = item.value;
        existingNames.add(normalizedName);
    }

    return { headers, skipped };
}
