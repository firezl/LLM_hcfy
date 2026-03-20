import { PDF_VIEWER_PATH } from "./constants.js";
import { extensionApi } from "./extension-api.js";

const runtimeBaseUrl = extensionApi.runtime.getURL("");
const isFirefoxExtensionRuntime = runtimeBaseUrl.startsWith("moz-extension://");
const redirectingTabs = new Map();

function isInternalPdfViewerUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }
    return url.startsWith(extensionApi.runtime.getURL(PDF_VIEWER_PATH));
}

function isLikelyDirectPdfUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return false;
    }

    if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
        return false;
    }

    if (/\.pdf$/i.test(parsed.pathname)) {
        return true;
    }

    let decodedSearch = parsed.search || "";
    try {
        decodedSearch = decodeURIComponent(decodedSearch);
    } catch (err) {
        // keep raw search when decoding fails
    }
    if (/\.pdf(?:$|[&#?])/i.test(decodedSearch)) {
        return true;
    }

    return false;
}

function extractPdfUrlFromViewerParam(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return null;
    }

    const fileParam = parsed.searchParams.get("file");
    if (!fileParam) {
        return null;
    }

    let decoded = fileParam;
    try {
        decoded = decodeURIComponent(fileParam);
    } catch (err) {
        // keep raw value when decoding fails
    }

    if (isInternalPdfViewerUrl(decoded)) {
        return null;
    }

    if (isLikelyDirectPdfUrl(decoded)) {
        return decoded;
    }

    return null;
}

function resolvePdfSourceUrl(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    if (isInternalPdfViewerUrl(url)) {
        return null;
    }

    if (isLikelyDirectPdfUrl(url)) {
        return url;
    }

    return extractPdfUrlFromViewerParam(url);
}

function toInternalPdfViewerUrl(pdfUrl) {
    return extensionApi.runtime.getURL(
        `${PDF_VIEWER_PATH}?file=${encodeURIComponent(pdfUrl)}`,
    );
}

function isFileProtocolUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }
    try {
        return new URL(url).protocol === "file:";
    } catch (err) {
        return false;
    }
}

async function safeUpdateTabUrl(tabId, targetUrl) {
    if (!Number.isInteger(tabId) || tabId < 0 || !targetUrl) {
        return;
    }

    try {
        const maybePromise = extensionApi.tabs.update(tabId, {
            url: targetUrl,
        });
        if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
        }
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (/Invalid tab ID/i.test(message)) {
            return;
        }
        console.warn("Failed to update tab URL", { tabId, targetUrl, err });
    }
}

export function handleTabUpdated(tabId, changeInfo) {
    const nextUrl = changeInfo?.url;
    if (!nextUrl || typeof nextUrl !== "string") {
        return;
    }

    if (isInternalPdfViewerUrl(nextUrl)) {
        redirectingTabs.delete(tabId);
        return;
    }

    const pdfSourceUrl = resolvePdfSourceUrl(nextUrl);
    if (!pdfSourceUrl) {
        return;
    }

    if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfSourceUrl)) {
        return;
    }

    const targetUrl = toInternalPdfViewerUrl(pdfSourceUrl);
    if (nextUrl === targetUrl) {
        return;
    }

    const lastTargetUrl = redirectingTabs.get(tabId);
    if (lastTargetUrl === targetUrl) {
        return;
    }

    redirectingTabs.set(tabId, targetUrl);
    void safeUpdateTabUrl(tabId, targetUrl);
}

export function handleTabRemoved(tabId) {
    redirectingTabs.delete(tabId);
}
