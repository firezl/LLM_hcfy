// content/modules/pdf-prompt.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function isLikelyPdfUrl(url) {
                if (!url || typeof url !== "string") return false;

                let parsed;
                try {
                    parsed = new URL(url, window.location.href);
                } catch (err) {
                    return false;
                }

                if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
                    return false;
                }

                if (/\.pdf$/i.test(parsed.pathname)) {
                    return true;
                }

                if (/\/(pdf)(\/|$)/i.test(parsed.pathname || "")) {
                    return true;
                }

                let decodedSearch = parsed.search || "";
                try {
                    decodedSearch = decodeURIComponent(decodedSearch);
                } catch (err) {
                    // keep raw search
                }
                if (/\.pdf(?:$|[&#?])/i.test(decodedSearch)) {
                    return true;
                }

                return /(?:^|[?&])(format|type|mime|contenttype)=pdf(?:$|[&#])/i.test(
                    decodedSearch,
                );
            }

            function ensurePdfPrompt() {
                if (state.pdfPromptEl && document.body.contains(state.pdfPromptEl)) {
                    return state.pdfPromptEl;
                }

                state.pdfPromptEl = document.createElement("div");
                state.pdfPromptEl.className = "jyt-pdf-prompt";
                state.pdfPromptEl.innerHTML = `
                    <div class="jyt-pdf-prompt-title">检测到可能是 PDF</div>
                    <div class="jyt-pdf-prompt-desc">是否使用插件内置查看器打开？</div>
                    <div class="jyt-pdf-prompt-countdown">10 秒后将自动使用浏览器打开</div>
                    <div class="jyt-pdf-progress" aria-hidden="true">
                        <div class="jyt-pdf-progress-bar"></div>
                    </div>
                    <div class="jyt-pdf-prompt-status"></div>
                    <div class="jyt-pdf-prompt-actions">
                        <button type="button" class="jyt-pdf-open">用划词翻译插件打开</button>
                        <button type="button" class="jyt-pdf-browser">保持浏览器打开</button>
                    </div>
                `;

                const openBtn = state.pdfPromptEl.querySelector(".jyt-pdf-open");
                const browserBtn = state.pdfPromptEl.querySelector(".jyt-pdf-browser");

                openBtn.addEventListener("click", async () => {
                    clearPdfPromptAutoCloseTimer();
                    if (!state.pdfPromptState?.pdfUrl) {
                        return;
                    }
                    if (state.pdfPromptState.isPdf === false) {
                        return;
                    }

                    openBtn.disabled = true;
                    browserBtn.disabled = true;
                    updatePdfPromptStatus("正在打开插件内置 PDF 查看器...");

                    try {
                        if (state.pdfPromptState.source === "background") {
                            await app.sendTermMessage(
                                app.MESSAGE_TYPES.PDF_PROMPT_DECISION ||
                                    "PDF_PROMPT_DECISION",
                                {
                                    promptId: state.pdfPromptState.promptId,
                                    pdfUrl: state.pdfPromptState.pdfUrl,
                                    action: "open",
                                },
                            );
                        } else {
                            await app.sendTermMessage(
                                app.MESSAGE_TYPES.PDF_OPEN_IN_VIEWER ||
                                    "PDF_OPEN_IN_VIEWER",
                                {
                                    pdfUrl: state.pdfPromptState.pdfUrl,
                                },
                            );
                        }
                        hidePdfPrompt();
                    } catch (err) {
                        openBtn.disabled = false;
                        browserBtn.disabled = false;
                        const message = err?.message || String(err);
                        updatePdfPromptStatus(`打开失败：${message}`, true);
                    }
                });

                browserBtn.addEventListener("click", async () => {
                    clearPdfPromptAutoCloseTimer();
                    const currentState = state.pdfPromptState;
                    await openPdfInBrowser(currentState);
                });

                document.body.appendChild(state.pdfPromptEl);
                return state.pdfPromptEl;
            }

            function updatePdfPromptStatus(text, isError) {
                const prompt = ensurePdfPrompt();
                const statusEl = prompt.querySelector(".jyt-pdf-prompt-status");
                statusEl.textContent = String(text || "");
                statusEl.classList.toggle("jyt-pdf-prompt-error", !!isError);
            }

            function hidePdfPrompt() {
                clearPdfPromptAutoCloseTimer();
                if (state.pdfPromptEl && state.pdfPromptEl.parentNode) {
                    state.pdfPromptEl.remove();
                }
                state.pdfPromptEl = null;
                state.pdfPromptState = null;
            }

            function clearPdfPromptAutoCloseTimer() {
                if (state.pdfPromptAutoCloseTimer) {
                    window.clearTimeout(state.pdfPromptAutoCloseTimer);
                    state.pdfPromptAutoCloseTimer = null;
                }
                if (state.pdfPromptCountdownInterval) {
                    window.clearInterval(state.pdfPromptCountdownInterval);
                    state.pdfPromptCountdownInterval = null;
                }
            }

            function updatePdfPromptCountdown(msRemaining) {
                if (!state.pdfPromptEl) {
                    return;
                }

                const countdownEl = state.pdfPromptEl.querySelector(
                    ".jyt-pdf-prompt-countdown",
                );
                const progressBarEl = state.pdfPromptEl.querySelector(
                    ".jyt-pdf-progress-bar",
                );
                if (!countdownEl || !progressBarEl) {
                    return;
                }

                const remaining = Math.max(0, Number(msRemaining) || 0);
                const remainSeconds = Math.ceil(remaining / 1000);
                const ratio = Math.max(
                    0,
                    Math.min(1, remaining / app.PDF_PROMPT_AUTO_CLOSE_MS),
                );

                countdownEl.textContent = `${remainSeconds} 秒后将自动使用浏览器打开`;
                progressBarEl.style.width = `${Math.round(ratio * 100)}%`;
            }

            async function openPdfInBrowser(state) {
                const currentState = state || state.pdfPromptState;
                hidePdfPrompt();

                if (!currentState?.pdfUrl) {
                    return;
                }

                if (currentState.source === "background") {
                    try {
                        await app.sendTermMessage(
                            app.MESSAGE_TYPES.PDF_PROMPT_DECISION || "PDF_PROMPT_DECISION",
                            {
                                promptId: currentState.promptId,
                                pdfUrl: currentState.pdfUrl,
                                action: "skip",
                            },
                        );
                    } catch (err) {
                        // ignore decision failures when user chooses skip
                    }
                }

                if (window.location.href !== currentState.pdfUrl) {
                    window.location.href = currentState.pdfUrl;
                }
            }

            function schedulePdfPromptAutoClose() {
                clearPdfPromptAutoCloseTimer();
                const snapshot =
                    state.pdfPromptState && state.pdfPromptState.pdfUrl
                        ? {
                              source: state.pdfPromptState.source,
                              promptId: state.pdfPromptState.promptId,
                              pdfUrl: state.pdfPromptState.pdfUrl,
                          }
                        : null;

                if (!snapshot) {
                    return;
                }

                const deadline = Date.now() + app.PDF_PROMPT_AUTO_CLOSE_MS;
                updatePdfPromptCountdown(app.PDF_PROMPT_AUTO_CLOSE_MS);
                state.pdfPromptCountdownInterval = window.setInterval(() => {
                    const remain = deadline - Date.now();
                    updatePdfPromptCountdown(remain);
                    if (remain <= 0) {
                        if (state.pdfPromptCountdownInterval) {
                            window.clearInterval(state.pdfPromptCountdownInterval);
                            state.pdfPromptCountdownInterval = null;
                        }
                    }
                }, 100);

                state.pdfPromptAutoCloseTimer = window.setTimeout(() => {
                    if (!state.pdfPromptState || state.pdfPromptState.pdfUrl !== snapshot.pdfUrl) {
                        return;
                    }
                    void openPdfInBrowser(snapshot);
                }, app.PDF_PROMPT_AUTO_CLOSE_MS);
            }

            function setPdfPromptOpenEnabled(enabled) {
                if (!state.pdfPromptEl) {
                    return;
                }
                const openBtn = state.pdfPromptEl.querySelector(".jyt-pdf-open");
                if (openBtn) {
                    openBtn.disabled = !enabled;
                }
            }

            function showPdfPrompt(state) {
                state.pdfPromptState = {
                    source: state?.source || "click",
                    promptId: state?.promptId || "",
                    pdfUrl: state?.pdfUrl || "",
                    isPdf: state?.isPdf ?? null,
                };

                ensurePdfPrompt();
                if (state.pdfPromptState.isPdf === false) {
                    setPdfPromptOpenEnabled(false);
                    updatePdfPromptStatus(
                        "校验结果：该链接不像 PDF（已禁用划词翻译插件打开）",
                        true,
                    );
                    return;
                }

                setPdfPromptOpenEnabled(true);
                if (state.pdfPromptState.isPdf === true) {
                    updatePdfPromptStatus(
                        "校验结果：该链接是 PDF，可以选择用划词翻译插件打开。",
                        false,
                    );
                } else {
                    updatePdfPromptStatus("正在校验文件类型，可稍候再决定。", false);
                }

                schedulePdfPromptAutoClose();
            }

            async function checkPdfUrlAndUpdatePrompt(pdfUrl) {
                try {
                    const result = await app.sendTermMessage(
                        app.MESSAGE_TYPES.PDF_CHECK_URL || "PDF_CHECK_URL",
                        {
                            pdfUrl,
                        },
                    );

                    if (!state.pdfPromptState || state.pdfPromptState.pdfUrl !== pdfUrl) {
                        return;
                    }

                    if (!result?.ok) {
                        setPdfPromptOpenEnabled(true);
                        updatePdfPromptStatus("校验失败，可按需继续打开。", true);
                        return;
                    }

                    state.pdfPromptState.isPdf = result.isPdf;
                    if (result.isPdf === false) {
                        setPdfPromptOpenEnabled(false);
                        updatePdfPromptStatus(
                            "校验结果：该链接不是 PDF（将保持浏览器默认行为）。",
                            true,
                        );
                        return;
                    }

                    setPdfPromptOpenEnabled(true);
                    if (result.isPdf === true) {
                        updatePdfPromptStatus("校验结果：确认是 PDF。", false);
                    } else {
                        updatePdfPromptStatus(
                            "未能完全确认类型，但可按需继续打开。",
                            false,
                        );
                    }
                } catch (err) {
                    if (!state.pdfPromptState || state.pdfPromptState.pdfUrl !== pdfUrl) {
                        return;
                    }
                    setPdfPromptOpenEnabled(true);
                    updatePdfPromptStatus("校验请求失败，可按需继续打开。", true);
                }
            }

            function registerPdfRuntimeListener() {
                if (!chrome?.runtime?.onMessage?.addListener) {
                    return;
                }

                chrome.runtime.onMessage.addListener((message) => {
                    const type = String(message?.type || "");
                    if (
                        type === (app.MESSAGE_TYPES.PDF_PROMPT_OFFER || "PDF_PROMPT_OFFER")
                    ) {
                        showPdfPrompt({
                            source: "background",
                            promptId: String(message?.promptId || ""),
                            pdfUrl: String(message?.pdfUrl || ""),
                            isPdf: null,
                        });
                        return false;
                    }

                    if (
                        type ===
                        (app.MESSAGE_TYPES.PDF_PROMPT_VERDICT || "PDF_PROMPT_VERDICT")
                    ) {
                        const promptId = String(message?.promptId || "");
                        if (!state.pdfPromptState || state.pdfPromptState.promptId !== promptId) {
                            return false;
                        }

                        state.pdfPromptState.isPdf = message?.isPdf ?? null;
                        if (state.pdfPromptState.isPdf === false) {
                            setPdfPromptOpenEnabled(false);
                            updatePdfPromptStatus("校验结果：该链接不是 PDF。", true);
                            return false;
                        }

                        setPdfPromptOpenEnabled(true);
                        if (state.pdfPromptState.isPdf === true) {
                            updatePdfPromptStatus("校验结果：确认是 PDF。", false);
                        } else {
                            updatePdfPromptStatus(
                                "未能完全确认类型，但你仍可按需选择划词翻译插件打开。",
                                false,
                            );
                        }
                    }

                    return false;
                });
            }

            async function restorePendingPdfPrompt() {
                try {
                    const result = await app.sendTermMessage(
                        app.MESSAGE_TYPES.PDF_GET_PENDING_PROMPT ||
                            "PDF_GET_PENDING_PROMPT",
                        {},
                    );
                    const pending = result?.pending;
                    if (!result?.ok || !pending?.pdfUrl) {
                        return;
                    }

                    showPdfPrompt({
                        source: "background",
                        promptId: String(pending.promptId || ""),
                        pdfUrl: String(pending.pdfUrl || ""),
                        isPdf: pending.isPdf ?? null,
                    });
                } catch (err) {
                    // ignore restore errors
                }
            }
        Object.assign(app, {
            isLikelyPdfUrl,
            ensurePdfPrompt,
            updatePdfPromptStatus,
            hidePdfPrompt,
            clearPdfPromptAutoCloseTimer,
            updatePdfPromptCountdown,
            openPdfInBrowser,
            schedulePdfPromptAutoClose,
            setPdfPromptOpenEnabled,
            showPdfPrompt,
            checkPdfUrlAndUpdatePrompt,
            registerPdfRuntimeListener,
            restorePendingPdfPrompt,
        });
    }

    global.JYT_CS_PDF = { install };
})(globalThis);
