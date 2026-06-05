// Logic mirrored from libs/pdf-text-normalize.mjs for content script use.
(function (global) {
    const MACHINE_TRANSLATE_ENGINE_IDS = ["google", "bing", "deepl", "deeplx"];
    const MACHINE_TRANSLATE_ENGINE_SET = new Set(MACHINE_TRANSLATE_ENGINE_IDS);
    const SENTENCE_END_RE = /[.!?。！？:;：；]$/;

    function isMachineTranslateEngine(engineId) {
        return MACHINE_TRANSLATE_ENGINE_SET.has(String(engineId || "").trim());
    }

    function isPdfViewerPage(pathname) {
        const path =
            pathname ||
            (typeof location !== "undefined" ? location.pathname : "") ||
            "";
        return /\/vendor\/pdfjs\/web\/viewer\.html/i.test(path);
    }

    function isSelectionFromPdfTextLayer(selection) {
        try {
            const sel =
                selection ||
                (typeof window !== "undefined" ? window.getSelection() : null);
            if (!sel || sel.rangeCount === 0) {
                return false;
            }

            let node = sel.anchorNode;
            if (node && node.nodeType === Node.TEXT_NODE) {
                node = node.parentElement;
            }

            return !!(node && node.closest && node.closest(".textLayer"));
        } catch (err) {
            return false;
        }
    }

    function isPdfSelectionContext(selection) {
        return isPdfViewerPage() || isSelectionFromPdfTextLayer(selection);
    }

    function joinPdfLines(prev, line) {
        if (/-$/.test(prev) && /^[a-z]/.test(line)) {
            return prev.slice(0, -1) + line;
        }

        if (/[\u4e00-\u9fff\u3400-\u4dbf]$/.test(prev)) {
            return prev + line;
        }

        if (/^[\u4e00-\u9fff\u3400-\u4dbf]/.test(line)) {
            return prev + line;
        }

        if (!SENTENCE_END_RE.test(prev) && /^[a-z(,]/.test(line)) {
            return prev + " " + line;
        }

        return prev + " " + line;
    }

    function normalizePdfSelectionText(text) {
        const raw = String(text || "");
        if (!raw.includes("\n")) {
            return raw.trim();
        }

        const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const paragraphs = normalized.split(/\n{2,}/);

        return paragraphs
            .map(function (paragraph) {
                const lines = paragraph
                    .split("\n")
                    .map(function (line) {
                        return line.trim();
                    })
                    .filter(Boolean);

                if (lines.length === 0) {
                    return "";
                }

                if (lines.length === 1) {
                    return lines[0];
                }

                return lines.reduce(joinPdfLines, "");
            })
            .filter(Boolean)
            .join("\n\n")
            .trim();
    }

    global.JYT_PDF_TEXT = {
        MACHINE_TRANSLATE_ENGINE_IDS,
        isMachineTranslateEngine,
        isPdfViewerPage,
        isSelectionFromPdfTextLayer,
        isPdfSelectionContext,
        normalizePdfSelectionText,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
