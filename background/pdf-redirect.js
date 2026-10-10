import { PDF_VIEWER_PATH } from "./constants.js";
import { extensionApi } from "./extension-api.js";
import { isSsrfRiskyHttpUrl } from "./ssrf-utils.js";
import { t } from "./i18n.js";
import { getSettings } from "./settings-cache.js";

const runtimeBaseUrl = extensionApi.runtime.getURL("");
const isFirefoxExtensionRuntime = runtimeBaseUrl.startsWith("moz-extension://");
const redirectingTabs = new Map();
const pendingPdfPrompts = new Map();
const KEEP_IN_BROWSER_TTL_MS = 15 * 1000;
const keepInBrowserUrls = new Map();
const keepInBrowserTabs = new Map();

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

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

function isLikelyPdfRouteUrl(url) {
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

    const pathname = String(parsed.pathname || "").toLowerCase();
    if (/\/(pdf)(\/|$)/i.test(pathname)) {
        return true;
    }

    const search = String(parsed.search || "").toLowerCase();
    if (/([?&](format|type|mime|contenttype)=pdf)(?:$|[&#])/i.test(search)) {
        return true;
    }

    return false;
}

function isLikelyPdfContentType(contentType) {
    const normalized = String(contentType || "").toLowerCase();
    if (!normalized) {
        return null;
    }
    if (normalized.includes("application/pdf")) {
        return true;
    }
    if (
        normalized.includes("text/html") ||
        normalized.includes("application/json") ||
        normalized.includes("text/plain") ||
        normalized.includes("text/xml") ||
        normalized.includes("application/xml")
    ) {
        return false;
    }
    return null;
}

function hasPdfSignature(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < PDF_SIGNATURE.length) {
        return false;
    }
    for (let i = 0; i < PDF_SIGNATURE.length; i += 1) {
        if (bytes[i] !== PDF_SIGNATURE[i]) {
            return false;
        }
    }
    return true;
}

async function safeFetch(url, init) {
    try {
        const response = await fetch(url, init);
        return response;
    } catch (err) {
        return null;
    }
}

// 需要登录或人机验证的站点（如 OpenReview）没有 cookie 时只返回 403 页面；
// 但对返回 `Access-Control-Allow-Origin: *` 的站点，未获主机权限时带凭据会被 CORS 拒绝，因此失败后再不带凭据重试。
async function fetchPreferringCookies(url, init) {
    const withCookies = await safeFetch(url, { ...init, credentials: "include" });
    if (withCookies) {
        return withCookies;
    }
    return safeFetch(url, init);
}

// 许多服务器会忽略 Range 头并返回完整文件，只读取开头若干字节后取消剩余下载。
async function readLeadingBytes(response, maxBytes) {
    const reader = response.body?.getReader?.();
    if (!reader) {
        return new Uint8Array(await response.arrayBuffer()).slice(0, maxBytes);
    }

    const leading = new Uint8Array(maxBytes);
    let filled = 0;
    try {
        while (filled < maxBytes) {
            const { done, value } = await reader.read();
            if (done || !value) {
                break;
            }
            const take = Math.min(value.length, maxBytes - filled);
            leading.set(value.subarray(0, take), filled);
            filled += take;
        }
    } catch (err) {
        // keep whatever was read before the stream failed
    } finally {
        reader.cancel().catch(() => {});
    }
    return leading.subarray(0, filled);
}

async function detectPdfByResponse(url) {
    const headResponse = await fetchPreferringCookies(url, {
        method: "HEAD",
        redirect: "follow",
        cache: "no-store",
    });

    // 非 2xx 的 HEAD 不可信：OpenReview 对 HEAD 一律返回 400 text/html，GET 才返回 PDF。
    if (headResponse?.ok) {
        const contentType = headResponse.headers?.get("content-type") || "";
        const contentTypeVerdict = isLikelyPdfContentType(contentType);
        if (contentTypeVerdict === true) {
            return {
                isPdf: true,
                reason: "content-type",
                contentType,
            };
        }
        if (contentTypeVerdict === false) {
            return {
                isPdf: false,
                reason: "content-type",
                contentType,
            };
        }
    }

    const getResponse = await fetchPreferringCookies(url, {
        method: "GET",
        headers: {
            Range: "bytes=0-7",
        },
        redirect: "follow",
        cache: "no-store",
    });

    if (!getResponse) {
        return {
            isPdf: null,
            reason: "network-failed",
            contentType: "",
        };
    }

    const contentType = getResponse.headers?.get("content-type") || "";
    // 401/403 等错误页（需要登录、人机验证）不能说明目标不是 PDF，只能判定为“未知”。
    if (!getResponse.ok) {
        getResponse.body?.cancel?.().catch(() => {});
        return {
            isPdf: null,
            reason: `http-${getResponse.status}`,
            contentType,
        };
    }

    const typedArray = await readLeadingBytes(getResponse, PDF_SIGNATURE.length);
    if (hasPdfSignature(typedArray)) {
        return {
            isPdf: true,
            reason: "signature",
            contentType,
        };
    }

    const contentTypeVerdict = isLikelyPdfContentType(contentType);
    return {
        isPdf: contentTypeVerdict,
        reason: "signature-miss",
        contentType,
    };
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

async function safeSendTabMessage(tabId, payload) {
    if (!Number.isInteger(tabId) || tabId < 0 || !payload) {
        return false;
    }

    try {
        const maybePromise = extensionApi.tabs.sendMessage(tabId, payload);
        if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
        }
        return true;
    } catch (err) {
        return false;
    }
}

function isHttpUrl(url) {
    try {
        const { protocol } = new URL(url);
        return protocol === "http:" || protocol === "https:";
    } catch (err) {
        return false;
    }
}

function pruneExpired(map, now) {
    for (const [key, expiresAt] of map) {
        if (expiresAt <= now) {
            map.delete(key);
        }
    }
}

function rememberKeepInBrowser({ tabId, url }) {
    const now = Date.now();
    pruneExpired(keepInBrowserUrls, now);
    pruneExpired(keepInBrowserTabs, now);
    if (url) {
        keepInBrowserUrls.set(url, now + KEEP_IN_BROWSER_TTL_MS);
    }
    if (Number.isInteger(tabId)) {
        keepInBrowserTabs.set(tabId, now + KEEP_IN_BROWSER_TTL_MS);
    }
}

// 用户刚选择“保持浏览器打开”后，该次导航（含服务器重定向后的最终 URL）不应再次弹出提示。
function shouldSkipPromptForKeptNavigation(tabId, url) {
    const now = Date.now();
    const urlExpiresAt = keepInBrowserUrls.get(url);
    const tabExpiresAt = keepInBrowserTabs.get(tabId);
    const kept =
        (urlExpiresAt != null && urlExpiresAt > now) ||
        (tabExpiresAt != null && tabExpiresAt > now);
    if (!kept) {
        return false;
    }
    keepInBrowserTabs.set(tabId, now + KEEP_IN_BROWSER_TTL_MS);
    return true;
}

async function openUrlForSender(sender, url, newTab) {
    const tab = sender?.tab;
    if (!newTab) {
        await safeUpdateTabUrl(tab?.id, url);
        return;
    }
    const createProperties = { url, active: true };
    if (Number.isInteger(tab?.index)) {
        createProperties.index = tab.index + 1;
    }
    if (Number.isInteger(tab?.id)) {
        createProperties.openerTabId = tab.id;
    }
    if (Number.isInteger(tab?.windowId)) {
        createProperties.windowId = tab.windowId;
    }
    await extensionApi.tabs.create(createProperties);
}

function buildPromptId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function verifyAndNotify(tabId, promptId, pdfUrl) {
    const verdict = await detectPdfByResponse(pdfUrl);
    const pending = pendingPdfPrompts.get(tabId);
    if (
        !pending ||
        pending.promptId !== promptId ||
        pending.pdfUrl !== pdfUrl
    ) {
        return;
    }

    pending.verdict = verdict.isPdf;
    pending.reason = verdict.reason;
    pending.contentType = verdict.contentType || "";

    await safeSendTabMessage(tabId, {
        type: "PDF_PROMPT_VERDICT",
        promptId,
        pdfUrl,
        isPdf: verdict.isPdf,
        reason: verdict.reason,
        contentType: verdict.contentType || "",
    });
}

async function verifyThenOffer(tabId, promptId, pdfUrl) {
    const verdict = await detectPdfByResponse(pdfUrl);
    const pending = pendingPdfPrompts.get(tabId);
    if (
        !pending ||
        pending.promptId !== promptId ||
        pending.pdfUrl !== pdfUrl
    ) {
        return;
    }

    pending.verdict = verdict.isPdf;
    pending.reason = verdict.reason;
    pending.contentType = verdict.contentType || "";

    if (verdict.isPdf === false) {
        pendingPdfPrompts.delete(tabId);
        return;
    }

    const offered = await safeSendTabMessage(tabId, {
        type: "PDF_PROMPT_OFFER",
        promptId,
        pdfUrl,
    });
    if (!offered) {
        pending.awaitingDelivery = true;
    }

    await safeSendTabMessage(tabId, {
        type: "PDF_PROMPT_VERDICT",
        promptId,
        pdfUrl,
        isPdf: verdict.isPdf,
        reason: verdict.reason,
        contentType: verdict.contentType || "",
    });
}

export function handleTabUpdated(tabId, changeInfo) {
    void handleTabUpdatedAsync(tabId, changeInfo);
}

async function handleTabUpdatedAsync(tabId, changeInfo) {
    const nextUrl = changeInfo?.url;
    if (!nextUrl || typeof nextUrl !== "string") {
        return;
    }

    if (isInternalPdfViewerUrl(nextUrl)) {
        redirectingTabs.delete(tabId);
        pendingPdfPrompts.delete(tabId);
        return;
    }

    const settings = await getSettings();
    if (String(settings?.pdf_prompt_enabled || "on") !== "on") {
        return;
    }

    if (shouldSkipPromptForKeptNavigation(tabId, nextUrl)) {
        pendingPdfPrompts.delete(tabId);
        return;
    }

    const pdfSourceUrl = resolvePdfSourceUrl(nextUrl);
    if (!pdfSourceUrl) {
        if (!isLikelyPdfRouteUrl(nextUrl)) {
            return;
        }

        const pending = pendingPdfPrompts.get(tabId);
        if (pending && pending.pdfUrl === nextUrl) {
            return;
        }

        const promptId = buildPromptId();
        pendingPdfPrompts.set(tabId, {
            promptId,
            pdfUrl: nextUrl,
            targetUrl: toInternalPdfViewerUrl(nextUrl),
            verdict: null,
            reason: "pending",
            awaitingDelivery: true,
        });
        void verifyThenOffer(tabId, promptId, nextUrl);
        return;
    }

    if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfSourceUrl)) {
        return;
    }

    const targetUrl = toInternalPdfViewerUrl(pdfSourceUrl);
    if (nextUrl === targetUrl) {
        return;
    }

    const pending = pendingPdfPrompts.get(tabId);
    if (pending && pending.pdfUrl === pdfSourceUrl) {
        return;
    }

    const promptId = buildPromptId();
    pendingPdfPrompts.set(tabId, {
        promptId,
        pdfUrl: pdfSourceUrl,
        targetUrl,
        verdict: null,
        reason: "pending",
    });

    const offered = safeSendTabMessage(tabId, {
        type: "PDF_PROMPT_OFFER",
        promptId,
        pdfUrl: pdfSourceUrl,
    });
    void offered.then((ok) => {
        if (!ok) {
            const latestPending = pendingPdfPrompts.get(tabId);
            if (latestPending && latestPending.promptId === promptId) {
                latestPending.awaitingDelivery = true;
            }
        }
    });
    void verifyAndNotify(tabId, promptId, pdfSourceUrl);
}

export function handleTabRemoved(tabId) {
    redirectingTabs.delete(tabId);
    pendingPdfPrompts.delete(tabId);
    keepInBrowserTabs.delete(tabId);
}

export async function handlePdfRuntimeMessage(message, sender) {
    const type = String(message?.type || "");

    if (type === "PDF_GET_PENDING_PROMPT") {
        const tabId = sender?.tab?.id;
        if (!Number.isInteger(tabId)) {
            return { ok: true, pending: null };
        }

        const pending = pendingPdfPrompts.get(tabId);
        if (!pending) {
            return { ok: true, pending: null };
        }

        return {
            ok: true,
            pending: {
                promptId: pending.promptId,
                pdfUrl: pending.pdfUrl,
                isPdf: pending.verdict,
                reason: pending.reason || "",
                contentType: pending.contentType || "",
            },
        };
    }

    if (type === "PDF_CHECK_URL") {
        const pdfUrl = String(message?.pdfUrl || "");
        if (!pdfUrl) {
            return { ok: false, error: t("translate.pdf.missingUrl") };
        }
        // 拒绝网页触发的内网/本机/link-local 探测，防止后台被利用做 SSRF。
        // file:// 与公网地址不受此限制；用户自行导航触发的 handleTabUpdated 路径不经过此处。
        if (isSsrfRiskyHttpUrl(pdfUrl)) {
            return { ok: false, error: t("translate.pdf.unsafeUrl") };
        }
        const verdict = await detectPdfByResponse(pdfUrl);
        return {
            ok: true,
            pdfUrl,
            isPdf: verdict.isPdf,
            reason: verdict.reason,
            contentType: verdict.contentType || "",
        };
    }

    if (type === "PDF_OPEN_IN_VIEWER") {
        const pdfUrl = String(message?.pdfUrl || "");
        const tabId = sender?.tab?.id;
        if (!pdfUrl || !Number.isInteger(tabId)) {
            return { ok: false, error: t("translate.pdf.missingParams") };
        }
        if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfUrl)) {
            return {
                ok: false,
                error: t("translate.pdf.firefoxFile"),
            };
        }

        const targetUrl = toInternalPdfViewerUrl(pdfUrl);
        if (message?.newTab === true) {
            await openUrlForSender(sender, targetUrl, true);
            return { ok: true };
        }
        redirectingTabs.set(tabId, targetUrl);
        await safeUpdateTabUrl(tabId, targetUrl);
        return { ok: true };
    }

    if (type === "PDF_OPEN_IN_BROWSER") {
        const pdfUrl = String(message?.pdfUrl || "");
        const tabId = sender?.tab?.id;
        if (!pdfUrl || !Number.isInteger(tabId)) {
            return { ok: false, error: t("translate.pdf.missingParams") };
        }
        if (!isHttpUrl(pdfUrl)) {
            return { ok: false, error: t("translate.pdf.unsupportedMessage") };
        }

        const newTab = message?.newTab === true;
        rememberKeepInBrowser({ tabId: newTab ? null : tabId, url: pdfUrl });
        await openUrlForSender(sender, pdfUrl, newTab);
        return { ok: true };
    }

    if (type === "PDF_PROMPT_DECISION") {
        const tabId = sender?.tab?.id;
        const promptId = String(message?.promptId || "");
        const action = String(message?.action || "");
        const pdfUrlFromMessage = String(message?.pdfUrl || "");

        if (!Number.isInteger(tabId) || !promptId) {
            return { ok: false, error: t("translate.pdf.missingPrompt") };
        }

        const pending = pendingPdfPrompts.get(tabId);
        if (!pending || pending.promptId !== promptId) {
            return { ok: false, error: t("translate.pdf.promptExpired") };
        }

        const pdfUrl = pending.pdfUrl || pdfUrlFromMessage;
        if (action !== "open") {
            pendingPdfPrompts.delete(tabId);
            rememberKeepInBrowser({ tabId, url: pdfUrl });
            return { ok: true };
        }

        if (pending.verdict === false) {
            return { ok: false, error: t("translate.pdf.notPdf") };
        }

        if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfUrl)) {
            return {
                ok: false,
                error: t("translate.pdf.firefoxFile"),
            };
        }

        redirectingTabs.set(tabId, pending.targetUrl);
        pendingPdfPrompts.delete(tabId);
        await safeUpdateTabUrl(tabId, pending.targetUrl);
        return { ok: true };
    }

    return { ok: false, error: t("translate.pdf.unsupportedMessage") };
}
