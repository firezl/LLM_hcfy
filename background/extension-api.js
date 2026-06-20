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

export const extensionApi = resolveExtensionApi();
