/** Shared context collection and sanitization for smart context translation. */

import {
    isPdfViewerPage,
    isSelectionFromPdfTextLayer,
    normalizePdfSelectionText,
} from "./pdf-text-normalize.mjs";

export const CONTEXT_LIMITS = Object.freeze({
    beforeContext: 300,
    afterContext: 300,
    blockText: 1200,
    pageTitle: 200,
    pageDomain: 200,
    pageLang: 50,
});

export const CONTEXT_MODES = Object.freeze(["off", "lightweight", "enhanced"]);

const BLOCK_SELECTOR =
    "p, div, article, section, li, td, blockquote";

const EXCLUDED_CONTEXT_SELECTOR =
    'input, textarea, [contenteditable="true"], [contenteditable=""]';

export function normalizeWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

export function truncateText(text, maxLen) {
    const normalized = normalizeWhitespace(text);
    if (!normalized) {
        return "";
    }
    if (normalized.length <= maxLen) {
        return normalized;
    }
    return normalized.slice(0, maxLen);
}

/**
 * Resolve context translation mode from settings, with legacy migration.
 */
export function resolveContextMode(settings) {
    const raw = String(settings?.context_translate_mode || "").trim();
    if (CONTEXT_MODES.includes(raw)) {
        return raw;
    }
    if (settings?.context_translate_enabled === false) {
        return "off";
    }
    return "enhanced";
}

function getElementFromNode(node) {
    if (!node) {
        return null;
    }
    if (node.nodeType === 1) {
        return node;
    }
    if (node.nodeType === 3) {
        return node.parentElement;
    }
    return null;
}

function isExcludedContextElement(el) {
    if (!el || typeof el.closest !== "function") {
        return true;
    }
    if (el.closest(EXCLUDED_CONTEXT_SELECTOR)) {
        return true;
    }
    const input = el.closest("input");
    if (input && String(input.type || "").toLowerCase() === "password") {
        return true;
    }
    return false;
}

function isPdfTextLayerBlock(el) {
    return !!(
        el &&
        typeof el.classList?.contains === "function" &&
        el.classList.contains("textLayer")
    );
}

function findBlockElement(startNode, doc = document) {
    const el = getElementFromNode(startNode);
    if (!el || typeof el.closest !== "function") {
        return null;
    }
    if (isExcludedContextElement(el)) {
        return null;
    }

    const textLayer = el.closest(".textLayer");
    if (textLayer && !isExcludedContextElement(textLayer)) {
        return textLayer;
    }

    const block = el.closest(BLOCK_SELECTOR);
    if (!block || isExcludedContextElement(block)) {
        return null;
    }
    return block;
}

function normalizePdfContextText(text) {
    return normalizePdfSelectionText(String(text || ""));
}

function getPdfBlockPlainText(block) {
    if (!block) {
        return "";
    }

    const spans = block.querySelectorAll?.('span[role="presentation"]');
    if (spans && spans.length > 0) {
        let combined = "";
        for (const span of spans) {
            combined += span.textContent || "";
        }
        if (combined.trim()) {
            return normalizePdfContextText(combined);
        }
    }

    return normalizePdfContextText(block.innerText || block.textContent || "");
}

function resolvePdfPageMeta(doc = document, win = window) {
    const title = normalizePdfContextText(doc?.title || "");
    let domain = "";
    let lang = normalizePdfContextText(doc?.documentElement?.lang || "");

    try {
        const fileParam = new URL(win.location.href).searchParams.get("file");
        if (fileParam) {
            const fileUrl = new URL(fileParam, win.location.href);
            domain = fileUrl.hostname || "";
            if (!title) {
                const parts = fileUrl.pathname.split("/").filter(Boolean);
                const filename = parts[parts.length - 1] || "";
                if (filename) {
                    return {
                        title: truncateText(
                            decodeURIComponent(filename),
                            CONTEXT_LIMITS.pageTitle,
                        ),
                        domain: truncateText(domain, CONTEXT_LIMITS.pageDomain),
                        lang,
                    };
                }
            }
        }
    } catch (_err) {
        // ignore invalid viewer URLs
    }

    return {
        title,
        domain,
        lang,
    };
}

function findSelectionOffsetInBlock(blockText, selectedText) {
    const trimmed = String(selectedText || "").trim();
    if (!trimmed || !blockText) {
        return -1;
    }
    const directIdx = blockText.indexOf(trimmed);
    if (directIdx !== -1) {
        return directIdx;
    }
    const normalizedBlock = blockText.replace(/\s+/g, " ");
    const normalizedSelected = trimmed.replace(/\s+/g, " ");
    const normIdx = normalizedBlock.indexOf(normalizedSelected);
    if (normIdx !== -1) {
        return Math.min(normIdx, blockText.length);
    }
    return -1;
}

function getBlockPlainText(block, isPdfBlock) {
    if (isPdfBlock) {
        return getPdfBlockPlainText(block);
    }
    return String(block.innerText || block.textContent || "");
}

function extractBeforeAfterFromBlock(block, selectedText, isPdfBlock = false) {
    const blockText = getBlockPlainText(block, isPdfBlock);
    const trimmed = isPdfBlock
        ? normalizePdfContextText(selectedText)
        : String(selectedText || "").trim();
    const idx = findSelectionOffsetInBlock(blockText, trimmed);
    if (idx === -1) {
        return null;
    }
    const end = idx + trimmed.length;
    const before = blockText.slice(
        Math.max(0, idx - CONTEXT_LIMITS.beforeContext),
        idx,
    );
    const after = blockText.slice(end, end + CONTEXT_LIMITS.afterContext);
    return {
        before: isPdfBlock ? normalizePdfContextText(before) : before,
        after: isPdfBlock ? normalizePdfContextText(after) : after,
    };
}

function extractBeforeAfterFromRange(block, range) {
    try {
        const blockRange = range.startContainer?.ownerDocument?.createRange?.();
        if (!blockRange) {
            return { before: "", after: "" };
        }
        blockRange.selectNodeContents(block);

        const beforeRange = range.cloneRange();
        beforeRange.setStart(blockRange.startContainer, blockRange.startOffset);
        beforeRange.setEnd(range.startContainer, range.startOffset);

        const afterRange = range.cloneRange();
        afterRange.setStart(range.endContainer, range.endOffset);
        afterRange.setEnd(blockRange.endContainer, blockRange.endOffset);

        return {
            before: beforeRange.toString(),
            after: afterRange.toString(),
        };
    } catch (_err) {
        return { before: "", after: "" };
    }
}

function emptyPageMeta() {
    return {
        title: "",
        domain: "",
        lang: "",
    };
}

function buildStructuredContext({
    mode,
    selectedText,
    before,
    after,
    block = "",
    page = emptyPageMeta(),
}) {
    return {
        mode,
        selectedText: truncateText(selectedText, CONTEXT_LIMITS.blockText),
        before: truncateText(before, CONTEXT_LIMITS.beforeContext),
        after: truncateText(after, CONTEXT_LIMITS.afterContext),
        block: truncateText(block, CONTEXT_LIMITS.blockText),
        page: {
            title: truncateText(page.title, CONTEXT_LIMITS.pageTitle),
            domain: truncateText(page.domain, CONTEXT_LIMITS.pageDomain),
            lang: truncateText(page.lang, CONTEXT_LIMITS.pageLang),
        },
    };
}

function hasStructuredContextContent(context) {
    return !!(
        context?.selectedText ||
        context?.before ||
        context?.after ||
        context?.block ||
        context?.page?.title ||
        context?.page?.domain ||
        context?.page?.lang
    );
}

function normalizeLegacyContext(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    if ("selectedText" in raw || "before" in raw || "page" in raw) {
        return raw;
    }
    return {
        mode: raw.mode,
        selectedText: raw.selectedText || raw.selected_text || "",
        before: raw.before || raw.beforeContext || "",
        after: raw.after || raw.afterContext || "",
        block: raw.block || raw.blockText || "",
        page: {
            title: raw.page?.title || raw.pageTitle || "",
            domain: raw.page?.domain || raw.pageDomain || "",
            lang: raw.page?.lang || raw.pageLang || "",
        },
    };
}

/**
 * Collect page context around the current selection.
 * Returns null when collection should be skipped.
 */
export function collectSelectionContext(
    sel,
    mode = "enhanced",
    doc = document,
    win = window,
) {
    const resolvedMode = resolveContextMode({ context_translate_mode: mode });
    if (resolvedMode === "off") {
        return null;
    }

    if (!sel || sel.rangeCount === 0) {
        return null;
    }

    const rawSelectedText = sel.toString();
    if (!rawSelectedText || !rawSelectedText.trim()) {
        return null;
    }

    const range = sel.getRangeAt(0);
    const block = findBlockElement(range.startContainer, doc);
    if (!block) {
        return null;
    }

    const isPdfBlock =
        isPdfTextLayerBlock(block) ||
        isPdfViewerPage(doc?.location?.pathname || "") ||
        isSelectionFromPdfTextLayer(sel);
    const selectedText = isPdfBlock
        ? normalizePdfContextText(rawSelectedText)
        : rawSelectedText;

    const fromBlock = extractBeforeAfterFromBlock(
        block,
        selectedText,
        isPdfBlock,
    );
    const fromRange =
        fromBlock ||
        extractBeforeAfterFromRange(block, range);

    let before = fromRange.before;
    let after = fromRange.after;
    if (isPdfBlock) {
        before = normalizePdfContextText(before);
        after = normalizePdfContextText(after);
    }
    before = truncateText(before, CONTEXT_LIMITS.beforeContext);
    after = truncateText(after, CONTEXT_LIMITS.afterContext);

    if (resolvedMode === "lightweight") {
        return buildStructuredContext({
            mode: "lightweight",
            selectedText,
            before,
            after,
        });
    }

    const blockText = truncateText(
        getBlockPlainText(block, isPdfBlock),
        CONTEXT_LIMITS.blockText,
    );
    const pageMeta = isPdfBlock
        ? resolvePdfPageMeta(doc, win)
        : {
              title: doc?.title || "",
              domain: win?.location?.hostname || "",
              lang: doc?.documentElement?.lang || "",
          };

    return buildStructuredContext({
        mode: "enhanced",
        selectedText,
        before,
        after,
        block: blockText,
        page: pageMeta,
    });
}

/**
 * Sanitize context received from content script (background gate).
 */
export function sanitizeTranslateContext(raw, mode = "enhanced") {
    const resolvedMode = resolveContextMode({ context_translate_mode: mode });
    if (resolvedMode === "off") {
        return null;
    }

    const normalized = normalizeLegacyContext(raw);
    if (!normalized) {
        return null;
    }

    const sanitized = buildStructuredContext({
        mode: resolvedMode,
        selectedText: normalized.selectedText,
        before: normalized.before,
        after: normalized.after,
        block: resolvedMode === "enhanced" ? normalized.block : "",
        page:
            resolvedMode === "enhanced"
                ? {
                      title: normalized.page?.title || "",
                      domain: normalized.page?.domain || "",
                      lang: normalized.page?.lang || "",
                  }
                : emptyPageMeta(),
    });

    return hasStructuredContextContent(sanitized) ? sanitized : null;
}
