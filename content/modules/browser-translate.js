// content/modules/browser-translate.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function isBrowserAITranslatorSupported() {
                return (
                    typeof self.Translator !== "undefined" &&
                    typeof self.Translator.availability === "function" &&
                    typeof self.Translator.create === "function"
                );
            }

            async function getBrowserTranslator(from, to, streamEl) {
                if (!isBrowserAITranslatorSupported()) {
                    throw new Error(
                        "当前浏览器不支持 Translation API（需 Chrome 138+ 实验功能）",
                    );
                }

                const key = `${from}->${to}`;
                if (state.translatorCache.has(key)) return state.translatorCache.get(key);

                const availability = await self.Translator.availability({
                    sourceLanguage: from,
                    targetLanguage: to,
                });

                if (availability === "available") state.translationModelReady = true;
                if (availability === "unavailable") {
                    throw new Error(`Translation API 不支持语言对: ${from} -> ${to}`);
                }

                const createOptions = { sourceLanguage: from, targetLanguage: to };
                if (
                    !state.translationModelReady &&
                    (availability === "downloadable" || availability === "downloading")
                ) {
                    createOptions.monitor = (m) => {
                        m.addEventListener("downloadprogress", (e) => {
                            const percent = Math.round((e.loaded || 0) * 100);
                            if (percent > 0 && percent < 100) {
                                streamEl.innerText =
                                    "正在下载 Translation 模型: " + percent + "%";
                            }
                        });
                    };
                }

                const translator = await self.Translator.create(createOptions);
                if (translator.ready) await translator.ready;

                state.translationModelReady = true;
                state.translatorCache.set(key, translator);
                return translator;
            }

            async function translateWithBrowserAPI(text, from, to, streamEl) {
                const translator = await getBrowserTranslator(from, to, streamEl);

                if (typeof translator.translateStreaming === "function") {
                    let output = "";
                    const stream = translator.translateStreaming(text);
                    for await (const chunk of stream) {
                        output += chunk;
                        streamEl.innerText = app.trimEdgeBlankLines(output);
                        streamEl.scrollTop = streamEl.scrollHeight;
                    }
                    return app.trimEdgeBlankLines(output);
                }

                const output = app.trimEdgeBlankLines(await translator.translate(text));
                streamEl.innerText = output;
                return output;
            }
        Object.assign(app, {
            isBrowserAITranslatorSupported,
            getBrowserTranslator,
            translateWithBrowserAPI,
        });
    }

    global.JYT_CS_BROWSER_AI = { install };
})(globalThis);
