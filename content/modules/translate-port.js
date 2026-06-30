// content/modules/translate-port.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
        const t = (key, vars) =>
            typeof app.t === "function" ? app.t(key, vars) : key;
            function clearActiveRequestTimeout(request) {
                if (!request?.responseTimeoutId) return;
                window.clearTimeout(request.responseTimeoutId);
                request.responseTimeoutId = null;
            }

            function armActiveRequestTimeout(request) {
                clearActiveRequestTimeout(request);
                request.responseTimeoutId = window.setTimeout(() => {
                    if (state.activeRequest !== request) return;
                    request.streamEl.innerText = t("bubble.translate.timeout");
                    app.setBubbleState(
                        request.streamEl?.closest(".jyt-bubble"),
                        "error",
                    );
                    state.activeRequest = null;
                }, app.TRANSLATE_RESPONSE_TIMEOUT_MS);
            }

            function touchActiveRequestTimeout(request) {
                if (state.activeRequest !== request) return;
                armActiveRequestTimeout(request);
            }

            function isBfcachePortError(message) {
                return /back\/forward cache|bfcache/i.test(String(message || ""));
            }

            function releaseTranslatePortForPageHide() {
                const currentRequest = state.activeRequest;
                state.activeRequest = null;
                clearActiveRequestTimeout(currentRequest);
                state.translatePort = null;
                state.translateGeneration += 1;
                app.drainRuntimeLastError();
            }

            function handleTranslatePortDisconnect() {
                const lastErrorMessage = app.drainRuntimeLastError();
                state.translatePort = null;

                if (state.translatePortClosing || isBfcachePortError(lastErrorMessage)) {
                    return;
                }

                const currentRequest = state.activeRequest;
                if (!currentRequest) return;

                state.activeRequest = null;
                clearActiveRequestTimeout(currentRequest);
                currentRequest.streamEl.innerText = t("bubble.translate.disconnected");
                app.setBubbleState(
                    currentRequest.streamEl?.closest(".jyt-bubble"),
                    "error",
                );
            }

            function resetTranslatePort() {
                if (!state.translatePort) return;
                state.translatePortClosing = true;
                try {
                    state.translatePort.disconnect();
                } catch (err) {
                    // Ignore stale port disconnect failures.
                } finally {
                    app.drainRuntimeLastError();
                    state.translatePort = null;
                    state.translatePortClosing = false;
                }
            }

            function ensureTranslatePort() {
                if (state.translatePort) return state.translatePort;

                const runtimeApi =
                    typeof chrome !== "undefined" &&
                    chrome.runtime &&
                    typeof chrome.runtime.connect === "function"
                        ? chrome.runtime
                        : typeof browser !== "undefined" &&
                            browser.runtime &&
                            typeof browser.runtime.connect === "function"
                          ? browser.runtime
                          : null;

                if (!runtimeApi) {
                    return null;
                }

                state.translatePort = runtimeApi.connect({ name: "jyt-translate" });
                state.translatePort.onMessage.addListener((message) => {
                    if (!state.activeRequest || !message) return;
                    if (message.requestId !== state.activeRequest.requestId) return;

                    const { streamEl, thoughtEl, thoughtDetails, isThinking } =
                        state.activeRequest;

                    if (message.type === "TRANSLATE_CHUNK") {
                        const chunk = message.content || "";
                        state.activeRequest.buffer += chunk;
                        touchActiveRequestTimeout(state.activeRequest);
                        scheduleRender(state, streamEl, thoughtEl, thoughtDetails, isThinking);
                        return;
                    }

                    if (message.type === "TRANSLATE_THOUGHT") {
                        thoughtEl.textContent =
                            (thoughtEl.textContent || "") + (message.content || "");
                        if (isThinking && thoughtDetails)
                            thoughtDetails.style.display = "block";
                        return;
                    }

                    if (message.type === "TRANSLATE_ERROR") {
                        const currentRequest = state.activeRequest;
                        clearActiveRequestTimeout(currentRequest);
                        const errorText = message.error || t("common.unknownError");
                        app.setBubbleState(streamEl?.closest(".jyt-bubble"), "error");

                        if (
                            currentRequest.allowBrowserFallback &&
                            !currentRequest.browserFallbackTried
                        ) {
                            currentRequest.browserFallbackTried = true;
                            streamEl.innerText = t("bubble.translate.fallbackBrowser");
                            app.setBubbleState(streamEl?.closest(".jyt-bubble"), "loading");

                            app.translateWithBrowserAPI(
                                currentRequest.text,
                                currentRequest.from,
                                currentRequest.to,
                                streamEl,
                            )
                                .then((translatedText) => {
                                    if (state.activeRequest === currentRequest) {
                                        const output =
                                            translatedText || app.getCleanTranslatedText();
                                        app.saveTranslationHistory({
                                            sourceText: currentRequest.text,
                                            translatedText: output,
                                            sourceLang: currentRequest.from,
                                            targetLang: currentRequest.to,
                                            engine: "browser",
                                            model: "browser-translation-api",
                                        });
                                        state.lastTranslateContext = {
                                            text: currentRequest.text,
                                            translatedText: output,
                                            from: currentRequest.from,
                                            to: currentRequest.to,
                                        };
                                        app.setBubbleState(
                                            streamEl?.closest(".jyt-bubble"),
                                            "done",
                                        );
                                        state.activeRequest = null;
                                    }
                                })
                                .catch((fallbackErr) => {
                                    if (state.activeRequest !== currentRequest) return;
                                    const browserErr =
                                        fallbackErr && fallbackErr.message
                                            ? fallbackErr.message
                                            : String(fallbackErr || t("common.unknownError"));
                                    streamEl.innerText = t("bubble.translate.bothFailed", {
                                        openaiError: errorText,
                                        browserError: browserErr,
                                    });
                                    app.setBubbleState(
                                        streamEl?.closest(".jyt-bubble"),
                                        "error",
                                    );
                                    state.activeRequest = null;
                                });
                            return;
                        }

                        streamEl.innerText = t("bubble.translate.failed", {
                            error: errorText,
                        });
                        state.activeRequest = null;
                        return;
                    }

                    if (message.type === "TRANSLATE_DONE") {
                        clearActiveRequestTimeout(state.activeRequest);
                        // 取消可能还在排队的 RAF，从 buffer 做最终同步渲染，
                        // 避免 DONE 先于 RAF 执行导致最后几个 chunk 丢失
                        if (state.renderRafId) {
                            cancelAnimationFrame(state.renderRafId);
                            state.renderRafId = null;
                        }
                        renderContentAndThought(
                            state.activeRequest.buffer,
                            null,
                            streamEl,
                            thoughtEl,
                            thoughtDetails,
                            isThinking,
                        );
                        streamEl.innerText = app.trimEdgeBlankLines(streamEl.innerText || "");
                        const translatedText = app.getCleanTranslatedText();
                        state.lastTranslateContext = {
                            text: state.activeRequest?.text || state.lastSelection || "",
                            translatedText,
                            from: state.activeRequest?.from || "",
                            to: state.activeRequest?.to || "",
                        };
                        app.saveTranslationHistory({
                            sourceText: state.activeRequest?.text || state.lastSelection || "",
                            translatedText,
                            sourceLang: state.activeRequest?.from || "",
                            targetLang: state.activeRequest?.to || "",
                            engine: state.activeRequest?.engine || "",
                            model: state.activeRequest?.model || "",
                        });
                        app.setBubbleState(streamEl?.closest(".jyt-bubble"), "done");
                        state.activeRequest = null;
                    }
                });

                state.translatePort.onDisconnect.addListener(handleTranslatePortDisconnect);

                return state.translatePort;
            }

            function sendTranslateStart(payload) {
                let port = ensureTranslatePort();
                if (!port) {
                    return false;
                }

                try {
                    port.postMessage(payload);
                    app.drainRuntimeLastError();
                    return true;
                } catch (err) {
                    state.translatePort = null;
                    app.drainRuntimeLastError();
                    try {
                        port = ensureTranslatePort();
                        if (!port) {
                            return false;
                        }
                        port.postMessage(payload);
                        app.drainRuntimeLastError();
                        return true;
                    } catch (retryErr) {
                        app.drainRuntimeLastError();
                        return false;
                    }
                }
            }

            function cancelActiveTranslateRequest() {
                const currentRequest = state.activeRequest;
                state.activeRequest = null;
                clearActiveRequestTimeout(currentRequest);

                if (!currentRequest || !state.translatePort) {
                    return;
                }

                try {
                    state.translatePort.postMessage({
                        type: app.MESSAGE_TYPES.TRANSLATE_CANCEL || "TRANSLATE_CANCEL",
                        requestId: currentRequest.requestId,
                    });
                } catch (err) {
                    // Ignore port send failures when runtime is unavailable.
                } finally {
                    app.drainRuntimeLastError();
                }
            }

            function scheduleRender(state, streamEl, thoughtEl, thoughtDetails, isThinking) {
                if (state.renderRafId) {
                    cancelAnimationFrame(state.renderRafId);
                }
                state.renderRafId = requestAnimationFrame(() => {
                    state.renderRafId = null;
                    if (!state.activeRequest) return;
                    const buffer = state.activeRequest.buffer;
                    renderContentAndThought(
                        buffer,
                        null,
                        streamEl,
                        thoughtEl,
                        thoughtDetails,
                        isThinking,
                    );
                    streamEl.scrollTop = streamEl.scrollHeight;
                });
            }

            function renderContentAndThought(
                buffer,
                newChunk,
                streamEl,
                thoughtEl,
                thoughtDetails,
                isThinking,
            ) {
                const hasEmbeddedThinking = buffer.includes("<think>");

                if (!hasEmbeddedThinking) {
                    if (!isThinking) {
                        if (thoughtDetails) {
                            thoughtDetails.style.display = "none";
                            thoughtDetails.removeAttribute("open");
                        }
                        thoughtEl.textContent = "";
                    }

                    if (newChunk) {
                        streamEl.innerText += newChunk;
                    } else {
                        streamEl.innerText = app.trimEdgeBlankLines(buffer);
                    }
                    return;
                }

                if (!isThinking) {
                    if (thoughtDetails) {
                        thoughtDetails.style.display = "none";
                        thoughtDetails.removeAttribute("open");
                    }
                    thoughtEl.textContent = "";
                    const clean = buffer
                        .replace(/<think>[\s\S]*?<\/think>/g, "")
                        .replace(/<think>[\s\S]*/g, "");
                    streamEl.innerText = app.trimEdgeBlankLines(clean);
                    return;
                }

                const tstart = buffer.indexOf("<think>");
                const tend = buffer.indexOf("</think>");

                if (tstart !== -1 && tend !== -1 && tend > tstart) {
                    const thought = buffer.substring(tstart + 7, tend).trim();
                    thoughtEl.innerText = thought;
                    if (isThinking && thoughtDetails)
                        thoughtDetails.style.display = "block";

                    const clean =
                        buffer.substring(0, tstart) + buffer.substring(tend + 8);
                    streamEl.innerText = app.trimEdgeBlankLines(clean);
                    state.activeRequest.buffer = clean;
                    return;
                }

                if (tstart !== -1) {
                    const cleanBuffer = buffer
                        .replace(/<think>[\s\S]*?<\/think>/g, "")
                        .replace(/<think>[\s\S]*/g, "");
                    streamEl.innerText = app.trimEdgeBlankLines(cleanBuffer);

                    if (tend === -1) {
                        thoughtEl.innerText = buffer.substring(tstart + 7);
                        if (isThinking && thoughtDetails)
                            thoughtDetails.style.display = "block";
                    }
                    return;
                }

                streamEl.innerText = app.trimEdgeBlankLines(buffer);
            }

            function startBackgroundTranslate(
                text,
                preferredFrom,
                preferredTo,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                options,
            ) {
                const extraOptions = options || {};
                const requestId = `${Date.now()}-${Math.random()}`;
                const isThinking =
                    typeof extraOptions.isThinking === "boolean"
                        ? extraOptions.isThinking
                        : !!settings.show_thoughts;
                const engine = extraOptions.engine || app.getEffectiveEngine(settings);
                const model = extraOptions.model || app.getEffectiveModel(settings, engine);

                state.activeRequest = {
                    requestId,
                    streamEl,
                    thoughtEl,
                    thoughtDetails,
                    isThinking,
                    buffer: "",
                    text,
                    from: preferredFrom,
                    to: preferredTo,
                    engine,
                    model,
                    allowBrowserFallback: !!extraOptions.allowBrowserFallback,
                    browserFallbackTried: false,
                };

                state.lastTranslateContext = {
                    text,
                    from: preferredFrom,
                    to: preferredTo,
                };

                const sent = sendTranslateStart({
                    type: app.MESSAGE_TYPES.TRANSLATE_START || "TRANSLATE_START",
                    requestId,
                    text,
                    preferredFrom,
                    preferredTo,
                    engine,
                    context:
                        extraOptions.context !== undefined
                            ? extraOptions.context
                            : state.lastSelectionContext || null,
                });

                if (!sent) {
                    clearActiveRequestTimeout(state.activeRequest);
                    streamEl.innerText =
                        t("bubble.translate.backgroundUnreachable");
                    app.setBubbleState(streamEl?.closest(".jyt-bubble"), "error");
                    state.activeRequest = null;
                    return;
                }

                armActiveRequestTimeout(state.activeRequest);
            }
        Object.assign(app, {
            clearActiveRequestTimeout,
            armActiveRequestTimeout,
            touchActiveRequestTimeout,
            isBfcachePortError,
            releaseTranslatePortForPageHide,
            handleTranslatePortDisconnect,
            resetTranslatePort,
            ensureTranslatePort,
            sendTranslateStart,
            cancelActiveTranslateRequest,
            renderContentAndThought,
            startBackgroundTranslate,
        });
    }

    global.JYT_CS_PORT = { install };
})(globalThis);
