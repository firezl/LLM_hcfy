// content/modules/translate-orchestrator.js
(function (global) {
    function install(app) {
        const state = app.state;

            function maybeNormalizePdfSelectionText(text, engine) {
                const pdfText = globalThis.JYT_PDF_TEXT || {};
                if (typeof pdfText.isMachineTranslateEngine !== "function") {
                    return text;
                }
                if (!pdfText.isMachineTranslateEngine(engine)) {
                    return text;
                }
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

            async function translateText(text, settings, bubble, generation) {
                const isStale = () => generation !== state.translateGeneration;
                const selectedEngine = settings.engine || "auto";
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
                    const [det1, det2, det3] = await Promise.allSettled([
                        app.detectLangByLanguageDetector(text, streamEl),
                        app.detectTextLangByChromeI18n(text),
                        Promise.resolve(app.detectLangHeuristic(text))
                    ]);
                    if (isStale()) return;
                    from = det1.status === 'fulfilled' ? det1.value : null
                        || det2.status === 'fulfilled' ? det2.value : null
                        || det3.status === 'fulfilled' ? det3.value : null
                        || '';
                }

                let to = targetSetting === "auto" ? "" : targetSetting;
                if (!to) to = app.detectBrowserLangByNavigator();
                if (!to) to = "zh";
                if (to === from) to = from === "zh" ? "en" : "zh";

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
                        streamEl.innerText = "翻译失败: " + err.message;
                        app.setBubbleState(bubble, "error");
                        return;
                    }
                }


                const BACKGROUND_ENGINE_THOUGHTS = {
                    ollama: "ollama_show_thoughts",
                    claude: "claude_show_thoughts",
                    gemini: "gemini_show_thoughts",
                    deepseek: "deepseek_show_thoughts",
                    siliconflow: "siliconflow_show_thoughts",
                    qwen: "qwen_show_thoughts",
                    glm: "glm_show_thoughts",
                    xiaomi: "xiaomi_show_thoughts",
                    custom_openai: "custom_openai_show_thoughts",
                    openrouter: "openrouter_show_thoughts",
                };

                const backgroundEngine = BACKGROUND_ENGINE_THOUGHTS[engine];
                if (backgroundEngine) {
                    app.startBackgroundTranslate(
                        text,
                        from,
                        to,
                        settings,
                        streamEl,
                        thoughtEl,
                        thoughtDetails,
                        {
                            allowBrowserFallback: false,
                            isThinking: !!settings[backgroundEngine],
                        },
                    );
                    return;
                }


                if (engine === "auto") {
                    const openAIConfigured =
                        !!settings.openai_api_url && !!settings.openai_api_key;
                    if (!openAIConfigured) {
                        try {
                            streamEl.innerText =
                                "未配置 OpenAI，正在使用浏览器 AI 翻译...";
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
                            streamEl.innerText =
                                "翻译失败: 未配置 OpenAI，且浏览器 AI 不可用（" +
                                (err && err.message ? err.message : String(err)) +
                                "）";
                            app.setBubbleState(bubble, "error");
                            return;
                        }
                    }
                }

                if (isStale()) return;

                app.startBackgroundTranslate(
                    text,
                    from,
                    to,
                    settings,
                    streamEl,
                    thoughtEl,
                    thoughtDetails,
                    { allowBrowserFallback: engine === "auto" },
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

            function triggerTranslate(selection, x, y) {
                const text = (selection || "").trim();
                if (!text) return;

                app.cancelActiveTranslateRequest();
                app.hideButton();

                const bubble = app.createBubble();
                if (!bubble) {
                    console.warn("LLM划词翻译: 无法创建翻译气泡");
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
                void app.translateText(text, state.runtimeSettings, bubble, generation);
            }

        Object.assign(app, {
            maybeNormalizePdfSelectionText,
            translateText,
            onTranslateClick,
            triggerTranslate,
        });
    }

    global.JYT_CS_ORCHESTRATOR = { install };
})(globalThis);
