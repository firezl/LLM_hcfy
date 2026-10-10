/**
 * Match a page hostname against user-written disabled-site rules.
 * Blank lines and lines starting with # are ignored. Invalid lines are skipped.
 */

function normalizeHostname(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\.+$/, "");
}

function isIpv4(host) {
    const parts = host.split(".");
    if (parts.length !== 4) {
        return false;
    }
    return parts.every((part) => {
        if (!/^\d{1,3}$/.test(part)) {
            return false;
        }
        const n = Number(part);
        return n >= 0 && n <= 255;
    });
}

function isAcceptableHost(host) {
    if (!host || host.length > 253) {
        return false;
    }
    if (host.includes("*") || host.includes("/") || host.includes(" ")) {
        return false;
    }
    if (host.includes(":")) {
        return /^[a-f0-9:]+$/.test(host) && host.includes(":");
    }
    if (isIpv4(host)) {
        return true;
    }
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(
        host,
    );
}

function extractHostname(raw) {
    const value = String(raw || "").trim();
    if (!value || /[\s<>]/.test(value)) {
        return "";
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) {
        return "";
    }
    if (!/^https?:\/\//i.test(value) && value.includes("@")) {
        return "";
    }
    try {
        const withScheme = /^https?:\/\//i.test(value)
            ? value
            : `http://${value.replace(/^\/\//, "")}`;
        return normalizeHostname(new URL(withScheme).hostname);
    } catch (_err) {
        return "";
    }
}

function parseRuleLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) {
        return null;
    }

    let wildcard = false;
    let raw = trimmed;
    if (raw.startsWith("*.")) {
        wildcard = true;
        raw = raw.slice(2).trim();
        if (!raw) {
            return null;
        }
    }

    const host = extractHostname(raw);
    if (!host || !isAcceptableHost(host)) {
        return null;
    }
    return { host, wildcard };
}

function hostMatches(hostname, rule) {
    if (hostname === rule.host) {
        return true;
    }
    if (!rule.wildcard) {
        return false;
    }
    return hostname.endsWith(`.${rule.host}`);
}

/**
 * @param {string} hostname
 * @param {string} rulesText
 * @returns {boolean}
 */
export function isSiteDisabled(hostname, rulesText) {
    const host = normalizeHostname(hostname);
    if (!host || !isAcceptableHost(host)) {
        return false;
    }

    const lines = String(rulesText ?? "").split(/\r?\n/);
    for (const line of lines) {
        const rule = parseRuleLine(line);
        if (!rule) {
            continue;
        }
        if (hostMatches(host, rule)) {
            return true;
        }
    }
    return false;
}
