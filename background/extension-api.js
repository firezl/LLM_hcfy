function getRuntimeBaseUrl() {
    try {
        if (typeof browser !== "undefined" && browser.runtime?.getURL) {
            return browser.runtime.getURL("");
        }
        if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
            return chrome.runtime.getURL("");
        }
    } catch {
        // ignore
    }
    return "";
}

/** Firefox 使用 browser.*；Chromium（Chrome / Edge）应优先使用 chrome.*。 */
export function isFirefoxExtension() {
    return getRuntimeBaseUrl().startsWith("moz-extension://");
}

function resolveExtensionApi() {
    if (isFirefoxExtension() && typeof browser !== "undefined") {
        return browser;
    }
    if (typeof chrome !== "undefined") {
        return chrome;
    }
    if (typeof browser !== "undefined") {
        return browser;
    }
    throw new Error("Extension API unavailable");
}

let resolvedExtensionApi;

function getExtensionApi() {
    if (!resolvedExtensionApi) {
        resolvedExtensionApi = resolveExtensionApi();
    }
    return resolvedExtensionApi;
}

// Resolve on first use so unit tests can import background modules
// before a browser API exists. Service worker startup still touches it immediately.
export const extensionApi = new Proxy(
    {},
    {
        get(_target, prop) {
            const api = getExtensionApi();
            const value = api[prop];
            if (typeof value === "function") {
                return value.bind(api);
            }
            return value;
        },
        has(_target, prop) {
            return prop in getExtensionApi();
        },
    },
);
