// content/modules/translate-orchestrator.js
import { getThoughtsSettingKey } from "../../libs/engine-registry.mjs";
import { pickDetectedLang } from "../../libs/lang-pick.mjs";

(function (global) {
    function install(app) {
        const state = app.state;
        const t = (key, vars) =>
            typeof app.t === "function" ? app.t(key, vars) : key;

            function maybeNormalizePdfSelectionText(text, engine) {
                const pdfText = globalThis.JYT_PDF_TEXT || {};
                if (typeof pdfText.isPdfSelectionContext !== "function") {
                    return text;
                }
                if (!pdfText.isPdfSelectionContext()) {
                    return text;
                }
                if (typeof pdfText.normalizePdfSelectionText !== "function") {
                    return text;
                }
                return pdfText.normalizePdfSelectionText(text);
            }

            const LANG_DETECT_RACE_MS = 300;
            let languageDetectorWarmupScheduled = false;
            let bubbleTranslateOverrides = null;
            let lastTriggerPoint = null;

            function createLangDetectProgressTarget(bubble, streamEl) {
                let lastWritten = null;
                return {
                    set innerText(value) {
                        if (!bubble || !streamEl) return;
                        if (bubble.dataset?.state !== "loading") return;
                        const current = streamEl.innerText || "";
                        if (current && current !== lastWritten) return;
                        lastWritten = value == null ? "" : String(value);
                        streamEl.innerText = lastWritten;
                    },
                    get innerText() {
                        return streamEl?.innerText || "";
                    },
                };
            }

            function scheduleLanguageDetectorWarmup(text, bubble, streamEl) {
                if (
                    languageDetectorWarmupScheduled ||
                    state.languageDetectorInstance
                ) {
                    return;
                }
                languageDetectorWarmupScheduled = true;
                const progressEl = createLangDetectProgressTarget(
                    bubble,
                    streamEl,
                );
                const run = () => {
                    try {
                        Promise.resolve(
                            app.detectLangByLanguageDetector(text, progressEl),
                        )
                            .catch(() => {})
                            .finally(() => {
                                languageDetectorWarmupScheduled = false;
                            });
                    } catch (_err) {
                        languageDetectorWarmupScheduled = false;
                    }
                };
                if (typeof window.requestIdleCallback === "function") {
                    window.requestIdleCallback(() => run());
                } else {
                    window.setTimeout(run, 500);
                }
            }

            function isEngineThinking(settings, engineId) {
                const thoughtsKey = getThoughtsSettingKey(engineId);
                if (!thoughtsKey) {
                    return !!settings?.show_thoughts;
                }
                return !!settings?.[thoughtsKey];
            }

            function thinkingForEngineOverride(settings, engineId) {
                const thoughtsKey = getThoughtsSettingKey(engineId);
                if (!thoughtsKey) return false;
                return !!settings?.[thoughtsKey];
            }

            function selectionLikeFromSavedRange(range, text) {
                let anchorNode = null;
                try {
                    anchorNode = range.startContainer;
                } catch (_err) {
                    anchorNode = null;
                }
                return {
                    rangeCount: 1,
                    anchorNode,
                    getRangeAt() {
                        return range;
                    },
                    toString() {
                        try {
                            const raw = range.toString();
                            if (raw && String(raw).trim()) {
                                return raw;
                            }
                        } catch (_err) {
                            // Use the text captured with the selection.
                        }
                        return text;
                    },
                };
            }

            function collectTranslateContext(text) {
                const range = state.lastSelectionRange;
                if (
                    !range ||
                    typeof app.collectSelectionContext !== "function"
                ) {
                    state.lastSelectionContext = null;
                    return;
                }
                state.lastSelectionContext = app.collectSelectionContext(
                    selectionLikeFromSavedRange(range, text),
                );
            }

            function rememberBubbleOverrides(options) {
                if (!options) {
                    bubbleTranslateOverrides = null;
                    return;
                }
                const next = {};
                if (options.engine) next.engine = String(options.engine);
                if (options.targetLang) next.targetLang = String(options.targetLang);
                bubbleTranslateOverrides = next;
            }

            async function translateText(text, settings, bubble, generation, overrides) {
                const isStale = () => generation !== state.translateGeneration;
                const extra = overrides && typeof overrides === "object" ? overrides : {};
                const selectedEngine = extra.engine || settings.engine || "auto";
                const llmEngine = settings.llm_engine || "openai";
                const engine = selectedEngine === "llm" ? llmEngine : selectedEngine;
                text = maybeNormalizePdfSelectionText(text, engine);
                const sourceSetting = settings.source_lang || "auto";
                const targetSetting = settings.target_lang || "auto";

                let from = sourceSetting === "auto" ? "" : sourceSetting;
                const streamEl = bubble.querySelector("#jyt-stream");
                const thoughtEl = bubble.querySelector("#jyt-thought-content");
                const thoughtDetails = bubble.querySelector("#jyt-thought");

                if (settings.font_family) {
                    bubble.style.setProperty("--jyt-font", settings.font_family);
                }
                app.applyBubbleSizeConfig(bubble, settings);

                thoughtDetails.style.display = "none";
                thoughtDetails.removeAttribute("open");
                streamEl.innerText = "";
                thoughtEl.innerText = "";
                state.activeRequest = null;
                app.setBubbleState(bubble, "loading");

                if (!from) {
                    const heuristic = app.detectLangHeuristic(text) || "";
                    const detections = [];
                    if (state.languageDetectorInstance) {
                        detections.push(
                            app.withTimeout(
                                app.detectLangByLanguageDetector(text, streamEl),
                                LANG_DETECT_RACE_MS,
                                null,
                            ),
                        );
                    } else {
                        scheduleLanguageDetectorWarmup(text, bubble, streamEl);
                    }
                    detections.push(
                        app.withTimeout(
                            app.detectTextLangByChromeI18n(text),
                            LANG_DETECT_RACE_MS,
                            null,
                        ),
                    );
                    detections.push(Promise.resolve(heuristic));
                    const settled = await Promise.allSettled(detections);
                    if (isStale()) return;
                    from = pickDetectedLang(settled) || heuristic;
                }

                let to;
                if (extra.targetLang) {
                    to = String(extra.targetLang);
                } else {
                    to = targetSetting === "auto" ? "" : targetSetting;
                    if (!to) to = app.detectBrowserLangByNavigator();
                    if (!to) to = "zh";
                    if (to === from) to = from === "zh" ? "en" : "zh";
                }

                if (engine === "browser") {
                    try {
                        state.lastTranslateContext = { text, from, to };
                        const translatedText = await app.translateWithBrowserAPI(
                            text,
                            from,
                            to,
                            streamEl,
                        );
                        if (isStale()) return;
                        const output = translatedText || app.getCleanTranslatedText();
                        state.lastTranslateContext = {
                            text,
                            translatedText: output,
                            from,
                            to,
                        };
                        app.saveTranslationHistory({
                            sourceText: text,
                            translatedText: output,
                            sourceLang: from,
                            targetLang: to,
                            engine: "browser",
                            model: "browser-translation-api",
                        });
                        app.setBubbleState(bubble, "done");
                        return;
                    } catch (err) {
                        streamEl.innerText = t("bubble.translate.failed", {
                            error: err.message,
                        });
                        app.setBubbleState(bubble, "error");
                        return;
                    }
                }


                if (isStale()) return;

                const translateOptions = {
                    isThinking: extra.engine
                        ? thinkingForEngineOverride(settings, engine)
                        : isEngineThinking(settings, engine),
                    context: state.lastSelectionContext,
                };
                if (extra.engine) {
                    translateOptions.engine = engine;
                } else if (engine === "auto") {
                    translateOptions.engine = "auto";
                }
                if (extra.bypassCache) {
                    translateOptions.bypassCache = true;
                }
                app.startBackgroundTranslate(
                    text,
                    from,
                    to,
                    settings,
                    streamEl,
                    thoughtEl,
                    thoughtDetails,
                    translateOptions,
                );
            }

            function onTranslateClick(e) {
                const selection = state.lastSelection.trim();
                if (!selection) return;
                const point = state.lastSelectionPoint || {
                    x: e.clientX,
                    y: e.clientY,
                };
                triggerTranslate(selection, point.x, point.y);
            }

            function triggerTranslate(selection, x, y, options) {
                const text = (selection || "").trim();
                if (!text) return;

                const requestOptions =
                    options && typeof options === "object" ? options : null;
                rememberBubbleOverrides(requestOptions);
                lastTriggerPoint = {
                    x: Number(x) || 0,
                    y: Number(y) || 0,
                };
                state.lastTranslateContext = { text };

                collectTranslateContext(text);

                app.cancelActiveTranslateRequest();
                app.hideButton();

                const bubble = app.createBubble();
                if (!bubble) {
                    console.warn(t("bubble.error.cannotCreate"));
                    return;
                }
                app.clearTermEditorUI(true);
                bubble.style.display = "block";
                state.isPinned = false;
                app.updatePinState(bubble);
                app.positionBubble(bubble, x, y);
                app.setBubbleLoading(bubble, true);
                app.applyTheme(state.runtimeSettings.theme_mode || "auto");
                const generation = ++state.translateGeneration;
                void app.translateText(
                    text,
                    state.runtimeSettings,
                    bubble,
                    generation,
                    requestOptions,
                );
            }

            function retranslate(overrides) {
                const source = String(
                    state.lastTranslateContext?.text || state.lastSelection || "",
                ).trim();
                if (!source) return false;

                const prev = bubbleTranslateOverrides || {};
                const next = { ...prev };
                if (overrides && Object.prototype.hasOwnProperty.call(overrides, "engine")) {
                    const engine = String(overrides.engine || "").trim();
                    if (engine) next.engine = engine;
                    else delete next.engine;
                }
                if (
                    overrides &&
                    Object.prototype.hasOwnProperty.call(overrides, "targetLang")
                ) {
                    const targetLang = String(overrides.targetLang || "").trim();
                    if (targetLang) next.targetLang = targetLang;
                    else delete next.targetLang;
                }
                if (overrides?.bypassCache) next.bypassCache = true;

                const point = lastTriggerPoint || state.lastSelectionPoint;
                const x = point && Number.isFinite(point.x) ? point.x : window.innerWidth / 2;
                const y = point && Number.isFinite(point.y) ? point.y : 80;
                triggerTranslate(source, x, y, next);
                return true;
            }

        Object.assign(app, {
            maybeNormalizePdfSelectionText,
            translateText,
            onTranslateClick,
            triggerTranslate,
            retranslate,
        });
    }

    global.JYT_CS_ORCHESTRATOR = { install };
})(globalThis);
