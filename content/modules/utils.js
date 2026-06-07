// content/modules/utils.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function withTimeout(promise, timeoutMs, fallbackValue) {
                return new Promise((resolve) => {
                    let settled = false;
                    const timer = window.setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        resolve(fallbackValue);
                    }, timeoutMs);

                    Promise.resolve(promise)
                        .then((value) => {
                            if (settled) return;
                            settled = true;
                            window.clearTimeout(timer);
                            resolve(value);
                        })
                        .catch(() => {
                            if (settled) return;
                            settled = true;
                            window.clearTimeout(timer);
                            resolve(fallbackValue);
                        });
                });
            }

            function normalizeGlossaryLang(lang) {
                const value = String(lang || "")
                    .trim()
                    .toLowerCase();
                if (!value || value === "auto") return "";
                return value.split("-")[0];
            }

            function normalizeTermText(text) {
                return String(text || "").trim();
            }

            function trimEdgeBlankLines(text) {
                const raw = String(text || "");
                return raw
                    .replace(/^(?:[ \t\u3000]*\r?\n)+/, "")
                    .replace(/(?:\r?\n[ \t\u3000]*)+$/, "");
            }

            function clampPercent(value, fallback) {
                const n = Number(value);
                if (!Number.isFinite(n)) return fallback;
                return Math.max(5, Math.min(95, n));
            }
        Object.assign(app, {
            withTimeout,
            normalizeGlossaryLang,
            normalizeTermText,
            trimEdgeBlankLines,
            clampPercent,
        });
    }

    global.JYT_CS_UTILS = { install };
})(globalThis);
