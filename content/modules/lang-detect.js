// content/modules/lang-detect.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function getSelectionAnchorPoint(sel) {
                try {
                    if (!sel || sel.rangeCount === 0) {
                        return { x: window.innerWidth / 2, y: 80 };
                    }
                    const rect = sel.getRangeAt(0).getBoundingClientRect();
                    if (rect && (rect.width || rect.height)) {
                        return { x: rect.right, y: rect.bottom };
                    }
                } catch (err) {
                    // ignore
                }
                return { x: window.innerWidth / 2, y: 80 };
            }

            function detectLangHeuristic(text) {
                return /[\u4e00-\u9fff]/.test(text) ? "zh" : "en";
            }

            function normalizeBasicLang(lang) {
                if (!lang || typeof lang !== "string") return "";
                const lower = lang.toLowerCase();
                if (lower.startsWith("zh")) return "zh";
                if (lower.startsWith("en")) return "en";
                if (lower.startsWith("ja")) return "ja";
                if (lower.startsWith("ko")) return "ko";
                if (lower.startsWith("fr")) return "fr";
                if (lower.startsWith("de")) return "de";
                if (lower.startsWith("es")) return "es";
                if (lower.startsWith("ru")) return "ru";
                return lower.split("-")[0] || "";
            }

            function detectBrowserLangByNavigator() {
                const navLang =
                    (navigator && (navigator.language || navigator.userLanguage)) || "";
                return normalizeBasicLang(navLang) || null;
            }

            async function detectTextLangByChromeI18n(text) {
                if (!chrome?.i18n?.detectLanguage) return null;
                try {
                    const result = await app.withTimeout(
                        new Promise((resolve) => {
                            chrome.i18n.detectLanguage(text, (res) =>
                                resolve(res || null),
                            );
                        }),
                        app.LANG_DETECT_TIMEOUT_MS,
                        null,
                    );
                    if (
                        !result ||
                        !Array.isArray(result.languages) ||
                        !result.languages[0]
                    ) {
                        return null;
                    }
                    return (
                        normalizeBasicLang(result.languages[0].language || "") || null
                    );
                } catch (err) {
                    console.warn("chrome.i18n.detectLanguage failed", err);
                    return null;
                }
            }


            function isBrowserAILanguageDetectorSupported() {
                return (
                    typeof self.LanguageDetector !== "undefined" &&
                    typeof self.LanguageDetector.availability === "function" &&
                    typeof self.LanguageDetector.create === "function"
                );
            }

            async function detectLangByLanguageDetector(text, streamEl) {
                if (!isBrowserAILanguageDetectorSupported()) return null;

                try {
                    if (state.languageDetectorInstance) {
                        const results = await app.withTimeout(
                            state.languageDetectorInstance.detect(text),
                            app.LANG_DETECT_TIMEOUT_MS,
                            null,
                        );
                        return (
                            normalizeBasicLang(results?.[0]?.detectedLanguage || "") ||
                            null
                        );
                    }

                    const availability = await app.withTimeout(
                        self.LanguageDetector.availability(),
                        app.LANG_DETECT_TIMEOUT_MS,
                        "unavailable",
                    );
                    if (availability === "available") state.languageDetectorModelReady = true;
                    if (availability === "unavailable") return null;

                    const createOptions = {};
                    if (
                        !state.languageDetectorModelReady &&
                        (availability === "downloadable" ||
                            availability === "downloading")
                    ) {
                        createOptions.monitor = (m) => {
                            m.addEventListener("downloadprogress", (e) => {
                                const percent = Math.round((e.loaded || 0) * 100);
                                if (percent > 0 && percent < 100) {
                                    streamEl.innerText =
                                        "正在下载 LanguageDetector 模型: " +
                                        percent +
                                        "%";
                                }
                            });
                        };
                    }

                    const detector = await app.withTimeout(
                        self.LanguageDetector.create(createOptions),
                        app.LANG_DETECT_TIMEOUT_MS,
                        null,
                    );
                    if (!detector) return null;

                    if (detector.ready) {
                        await app.withTimeout(detector.ready, app.LANG_DETECT_TIMEOUT_MS, null);
                    }

                    state.languageDetectorModelReady = true;
                    state.languageDetectorInstance = detector;

                    const results = await app.withTimeout(
                        detector.detect(text),
                        app.LANG_DETECT_TIMEOUT_MS,
                        null,
                    );
                    return (
                        normalizeBasicLang(results?.[0]?.detectedLanguage || "") || null
                    );
                } catch (err) {
                    console.warn("LanguageDetector failed", err);
                    return null;
                }
            }
        Object.assign(app, {
            getSelectionAnchorPoint,
            detectLangHeuristic,
            normalizeBasicLang,
            detectBrowserLangByNavigator,
            detectTextLangByChromeI18n,
            isBrowserAILanguageDetectorSupported,
            detectLangByLanguageDetector,
        });
    }

    global.JYT_CS_LANG = { install };
})(globalThis);
