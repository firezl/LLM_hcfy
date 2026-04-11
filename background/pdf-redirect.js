import { PDF_VIEWER_PATH } from "./constants.js";
import { extensionApi } from "./extension-api.js";

const runtimeBaseUrl = extensionApi.runtime.getURL("");
const isFirefoxExtensionRuntime = runtimeBaseUrl.startsWith("moz-extension://");
const redirectingTabs = new Map();
const pendingPdfPrompts = new Map();

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

async function detectPdfByResponse(url) {
    const headResponse = await safeFetch(url, {
        method: "HEAD",
        redirect: "follow",
        cache: "no-store",
    });

    if (headResponse) {
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

    const getResponse = await safeFetch(url, {
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
    const typedArray = new Uint8Array(await getResponse.arrayBuffer());
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
    const nextUrl = changeInfo?.url;
    if (!nextUrl || typeof nextUrl !== "string") {
        return;
    }

    if (isInternalPdfViewerUrl(nextUrl)) {
        redirectingTabs.delete(tabId);
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
            return { ok: false, error: "缺少 pdfUrl" };
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
            return { ok: false, error: "缺少参数" };
        }
        if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfUrl)) {
            return {
                ok: false,
                error: "Firefox 不支持扩展直接打开 file:// PDF",
            };
        }

        const targetUrl = toInternalPdfViewerUrl(pdfUrl);
        redirectingTabs.set(tabId, targetUrl);
        await safeUpdateTabUrl(tabId, targetUrl);
        return { ok: true };
    }

    if (type === "PDF_PROMPT_DECISION") {
        const tabId = sender?.tab?.id;
        const promptId = String(message?.promptId || "");
        const action = String(message?.action || "");
        const pdfUrlFromMessage = String(message?.pdfUrl || "");

        if (!Number.isInteger(tabId) || !promptId) {
            return { ok: false, error: "缺少 promptId 或 tabId" };
        }

        const pending = pendingPdfPrompts.get(tabId);
        if (!pending || pending.promptId !== promptId) {
            return { ok: false, error: "提示已失效" };
        }

        const pdfUrl = pending.pdfUrl || pdfUrlFromMessage;
        if (action !== "open") {
            pendingPdfPrompts.delete(tabId);
            return { ok: true };
        }

        if (pending.verdict === false) {
            return { ok: false, error: "该链接校验结果不是 PDF" };
        }

        if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfUrl)) {
            return {
                ok: false,
                error: "Firefox 不支持扩展直接打开 file:// PDF",
            };
        }

        redirectingTabs.set(tabId, pending.targetUrl);
        pendingPdfPrompts.delete(tabId);
        await safeUpdateTabUrl(tabId, pending.targetUrl);
        return { ok: true };
    }

    return { ok: false, error: "未支持的 PDF 消息类型" };
}
