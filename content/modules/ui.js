// content/modules/ui.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function setBubbleState(bubble, state) {
                if (!bubble) return;
                bubble.dataset.state = state || "";
            }

            function setCopyButtonStatus(bubble, text, isError) {
                const button = bubble?.querySelector(".jyt-copy");
                if (!button) return;
                if (state.copyStatusTimer) {
                    window.clearTimeout(state.copyStatusTimer);
                    state.copyStatusTimer = null;
                }
                button.classList.toggle("jyt-copy-error", !!isError);
                button.setAttribute("data-status", text || "");
                if (text) {
                    state.copyStatusTimer = window.setTimeout(() => {
                        button.removeAttribute("data-status");
                        button.classList.remove("jyt-copy-error");
                    }, 1600);
                }
            }

            async function copyTranslatedText(bubble) {
                const text = app.getCleanTranslatedText();
                if (!text) {
                    setCopyButtonStatus(bubble, app.t("common.noTranslation"), true);
                    return;
                }

                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        const textarea = document.createElement("textarea");
                        textarea.value = text;
                        textarea.style.position = "fixed";
                        textarea.style.opacity = "0";
                        document.body.appendChild(textarea);
                        textarea.focus();
                        textarea.select();
                        document.execCommand("copy");
                        textarea.remove();
                    }
                    setCopyButtonStatus(bubble, app.t("common.copySuccess"), false);
                } catch (err) {
                    setCopyButtonStatus(bubble, app.t("common.copyFailed"), true);
                }
            }

            function saveTranslationHistory(context) {
                const sourceText = String(context?.sourceText || "").trim();
                const translatedText = String(context?.translatedText || "").trim();
                if (!sourceText || !translatedText) return;

                void app
                    .sendTermMessage(app.MESSAGE_TYPES.HISTORY_ADD || "HISTORY_ADD", {
                        item: {
                            sourceText,
                            translatedText,
                            sourceLang: context?.sourceLang || "",
                            targetLang: context?.targetLang || "",
                            engine: context?.engine || "",
                            model: context?.model || "",
                            pageUrl: window.location.href,
                            pageTitle: document.title || "",
                            createdAt: Date.now(),
                            favorite: false,
                        },
                    })
                    .catch(() => {
                        // History is best-effort; translation should never fail because of it.
                    });
            }

            function getUiBubble() {
                return app.getTranslateBubble?.() || null;
            }

            function getUiButton() {
                return app.getTranslateBtn?.() || null;
            }

            function setTermTip(message, isError) {
                const bubble = getUiBubble();
                if (!bubble) return;
                let tipEl = bubble.querySelector(".jyt-term-tip");
                if (!tipEl) {
                    tipEl = document.createElement("div");
                    tipEl.className = "jyt-term-tip";
                    bubble.querySelector(".jyt-content")?.appendChild(tipEl);
                }
                tipEl.textContent = String(message || "");
                tipEl.classList.toggle("jyt-term-tip-error", !!isError);
            }

            function clearTermEditorUI(clearTip) {
                const bubble = getUiBubble();
                if (!bubble) return;

                const editor = bubble.querySelector(".jyt-term-editor");
                if (editor) {
                    editor.remove();
                }

                if (clearTip) {
                    const tip = bubble.querySelector(".jyt-term-tip");
                    if (tip) {
                        tip.remove();
                    }
                }
            }

            async function upsertGlossaryTerm(entry) {
                const response = await app.sendTermMessage(
                    app.MESSAGE_TYPES.TERM_UPSERT || "TERM_UPSERT",
                    { term: entry },
                );
                if (!response?.ok) {
                    throw new Error(
                        response?.error || app.t("bubble.term.saveFailed"),
                    );
                }
            }

            function showAddTermDialog(context) {
                const sourceTerm = app.normalizeTermText(context?.sourceText);
                const targetTerm = app.normalizeTermText(context?.translatedText);
                const sourceLang = app.normalizeGlossaryLang(context?.sourceLang);
                const targetLang = app.normalizeGlossaryLang(context?.targetLang);

                const bubble = getUiBubble();
                if (!bubble) return;
                const contentEl = bubble.querySelector(".jyt-content");
                if (!contentEl) return;

                clearTermEditorUI(false);

                if (!sourceTerm || !targetTerm || !sourceLang || !targetLang) {
                    setTermTip(app.t("bubble.term.needTranslation"), true);
                    return;
                }

                const editor = document.createElement("div");
                editor.className = "jyt-term-editor";
                const titleEl = document.createElement("div");
                const sourceLabelEl = document.createElement("label");
                const sourceInputEl = document.createElement("textarea");
                const targetLabelEl = document.createElement("label");
                const targetInputEl = document.createElement("textarea");
                const actionsEl = document.createElement("div");
                const confirmBtn = document.createElement("button");
                const cancelBtn = document.createElement("button");

                titleEl.className = "jyt-term-editor-title";
                titleEl.textContent = app.t("bubble.term.addTitle", {
                    sourceLang,
                    targetLang,
                });
                sourceLabelEl.textContent = app.t("bubble.term.sourceLabel");
                sourceInputEl.className = "jyt-term-source";
                targetLabelEl.textContent = app.t("bubble.term.targetLabel");
                targetInputEl.className = "jyt-term-target";
                actionsEl.className = "jyt-term-actions";
                confirmBtn.className = "jyt-term-confirm";
                confirmBtn.type = "button";
                confirmBtn.textContent = app.t("bubble.term.confirm");
                cancelBtn.className = "jyt-term-cancel";
                cancelBtn.type = "button";
                cancelBtn.textContent = app.t("bubble.term.cancel");

                actionsEl.append(confirmBtn, cancelBtn);
                editor.append(
                    titleEl,
                    sourceLabelEl,
                    sourceInputEl,
                    targetLabelEl,
                    targetInputEl,
                    actionsEl,
                );
                contentEl.appendChild(editor);

                sourceInputEl.value = sourceTerm;
                targetInputEl.value = targetTerm;
                sourceInputEl.focus();

                cancelBtn.addEventListener("click", () => {
                    editor.remove();
                });

                confirmBtn.addEventListener("click", () => {
                    const normalizedSource = app.normalizeTermText(sourceInputEl.value);
                    const normalizedTarget = app.normalizeTermText(targetInputEl.value);
                    if (!normalizedSource || !normalizedTarget) {
                        setTermTip(app.t("bubble.term.emptyFields"), true);
                        return;
                    }

                    const now = Date.now();
                    const termEntry = {
                        sourceTerm: normalizedSource,
                        targetTerm: normalizedTarget,
                        sourceLang,
                        targetLang,
                        createdAt: now,
                        updatedAt: now,
                    };

                    upsertGlossaryTerm(termEntry)
                        .then(() => {
                            setTermTip(app.t("bubble.term.saved"), false);
                            editor.remove();
                        })
                        .catch((err) => {
                            setTermTip(
                                app.t("bubble.term.saveError", {
                                    error:
                                        err && err.message
                                            ? err.message
                                            : String(err),
                                }),
                                true,
                            );
                        });
                });
            }

            function applyBubbleSizeConfig(bubble, settings) {
                const widthPercent = app.clampPercent(settings.bubble_width_percent, 20);
                const heightPercent = app.clampPercent(settings.bubble_height_percent, 40);
                bubble.style.setProperty("--jyt-max-width", `${widthPercent}vw`);
                bubble.style.setProperty("--jyt-max-height", `${heightPercent}vh`);
            }

            function applyTheme(theme) {
                const bubble = getUiBubble();
                const btn = getUiButton();
                let currentTheme = theme;

                if (theme === "auto") {
                    const prefersDark = window.matchMedia(
                        "(prefers-color-scheme: dark)",
                    ).matches;
                    currentTheme = prefersDark ? "dark" : "light";
                }

                if (bubble) bubble.setAttribute("data-theme", currentTheme);
                if (btn) btn.setAttribute("data-theme", currentTheme);
            }

            function createButton() {
                if (app.ui?.btn) {
                    return app.ui.btn;
                }

                const mount = app.getUiMount?.() || document.body;
                const btn = document.createElement("div");
                btn.id = app.BUTTON_ID;
                btn.className = "jyt-btn";
                btn.style.display = "none";
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z"/></svg>`;
                mount.appendChild(btn);
                app.ui.btn = btn;
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    app.onTranslateClick(e);
                });
                return btn;
            }

            function refreshBubbleI18n() {
                const bubble = getUiBubble();
                if (!bubble) return;

                const titleEl = bubble.querySelector(".jyt-title");
                if (titleEl) titleEl.textContent = app.t("bubble.title");

                const copyBtn = bubble.querySelector(".jyt-copy");
                if (copyBtn) copyBtn.title = app.t("bubble.copy.title");

                const addTermBtn = bubble.querySelector(".jyt-add-term");
                if (addTermBtn) {
                    addTermBtn.title = app.t("bubble.addTerm.title");
                    addTermBtn.textContent = app.t("bubble.addTerm.button");
                }

                const pinBtn = bubble.querySelector(".jyt-pin");
                if (pinBtn) pinBtn.title = app.t("bubble.pin.title");

                const closeBtn = bubble.querySelector(".jyt-close");
                if (closeBtn) closeBtn.title = app.t("bubble.close.title");

                const thoughtDetails = bubble.querySelector("#jyt-thought");
                const thoughtSummary = thoughtDetails?.querySelector("summary");
                if (thoughtSummary && thoughtDetails) {
                    thoughtSummary.textContent = thoughtDetails.open
                        ? app.t("bubble.thought.collapse")
                        : app.t("bubble.thought.expand");
                }

                if (bubble.dataset.state === "loading") {
                    const streamEl = bubble.querySelector("#jyt-stream");
                    if (streamEl) streamEl.innerText = app.t("bubble.loading");
                }
            }

            function createBubble() {
                if (app.ui?.bubble) {
                    return app.ui.bubble;
                }

                const mount = app.getUiMount?.() || document.body;
                const bubble = document.createElement("div");
                bubble.id = app.BUBBLE_ID;
                bubble.className = "jyt-bubble";
                bubble.innerHTML = `
              <div class="jyt-header">
                <span class="jyt-title"></span>
                <div class="jyt-controls">
                  <button class="jyt-copy" type="button">
                    <svg viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" /></svg>
                  </button>
                  <button class="jyt-add-term" type="button"></button>
                  <button class="jyt-pin" type="button">
                    <svg viewBox="0 0 24 24"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" /></svg>
                  </button>
                  <button class="jyt-close" type="button">
                    <svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg>
                  </button>
                </div>
              </div>
              <div class="jyt-content">
                <div class="jyt-stream" id="jyt-stream"></div>
                <details class="jyt-thought" id="jyt-thought"><summary></summary><div id="jyt-thought-content"></div></details>
              </div>
            `;
                mount.appendChild(bubble);
                app.ui.bubble = bubble;
                refreshBubbleI18n();

                bubble.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                });

                const header = bubble.querySelector(".jyt-header");
                let isDragging = false;
                let startX = 0;
                let startY = 0;
                let initialLeft = 0;
                let initialTop = 0;

                header.addEventListener("mousedown", (e) => {
                    if (e.target.closest("button")) return;
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    const rect = bubble.getBoundingClientRect();
                    initialLeft = rect.left;
                    initialTop = rect.top;
                    header.style.cursor = "grabbing";
                    e.preventDefault();
                });

                document.addEventListener("mousemove", (e) => {
                    if (!isDragging) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    bubble.style.left = `${initialLeft + dx}px`;
                    bubble.style.top = `${initialTop + dy}px`;
                });

                document.addEventListener("mouseup", () => {
                    if (!isDragging) return;
                    isDragging = false;
                    header.style.cursor = "move";
                });

                bubble.querySelector(".jyt-close").addEventListener("click", () => {
                    app.cancelActiveTranslateRequest();
                    clearTermEditorUI(true);
                    bubble.style.display = "none";
                    state.isPinned = false;
                    updatePinState(bubble);
                });

                bubble.querySelector(".jyt-pin").addEventListener("click", (e) => {
                    state.isPinned = !state.isPinned;
                    updatePinState(bubble);
                    e.stopPropagation();
                });

                bubble.querySelector(".jyt-copy").addEventListener("click", (e) => {
                    e.stopPropagation();
                    void copyTranslatedText(bubble);
                });

                bubble.querySelector(".jyt-add-term").addEventListener("click", (e) => {
                    e.stopPropagation();
                    const contextSourceLang =
                        state.activeRequest?.from ||
                        state.lastTranslateContext?.from ||
                        state.runtimeSettings.source_lang ||
                        "auto";
                    const contextTargetLang =
                        state.activeRequest?.to ||
                        state.lastTranslateContext?.to ||
                        state.runtimeSettings.target_lang ||
                        "auto";

                    const context = {
                        sourceText:
                            state.activeRequest?.text ||
                            state.lastTranslateContext?.text ||
                            state.lastSelection ||
                            "",
                        translatedText: app.getCleanTranslatedText(),
                        sourceLang: contextSourceLang,
                        targetLang: contextTargetLang,
                    };
                    showAddTermDialog(context);
                });

                const thoughtDetails = bubble.querySelector("#jyt-thought");
                const thoughtSummary = thoughtDetails?.querySelector("summary");
                const updateThoughtSummary = () => {
                    if (!thoughtSummary || !thoughtDetails) return;
                    thoughtSummary.textContent = thoughtDetails.open
                        ? app.t("bubble.thought.collapse")
                        : app.t("bubble.thought.expand");
                };
                thoughtDetails?.addEventListener("toggle", updateThoughtSummary);
                updateThoughtSummary();

                return bubble;
            }

            function updatePinState(bubble) {
                const pinBtn = bubble.querySelector(".jyt-pin");
                pinBtn.classList.toggle("active", state.isPinned);
            }

            function setBubbleLoading(bubble, loading) {
                setBubbleState(bubble, loading ? "loading" : "");
                bubble.querySelector("#jyt-stream").innerText = loading
                    ? app.t("bubble.loading")
                    : "";
                bubble.querySelector("#jyt-thought-content").innerText = "";
            }

            function positionButton(btn, x, y) {
                btn.style.left = x + 12 + "px";
                btn.style.top = y + 12 + "px";
                btn.style.display = "block";
            }

            function positionBubble(bubble, x, y) {
                bubble.style.left = x + 8 + "px";
                bubble.style.top = y + 8 + "px";
                bubble.style.display = "block";
            }

            function hideButton() {
                const btn = getUiButton();
                if (btn) btn.style.display = "none";
            }
        Object.assign(app, {
            setBubbleState,
            setCopyButtonStatus,
            copyTranslatedText,
            saveTranslationHistory,
            setTermTip,
            clearTermEditorUI,
            upsertGlossaryTerm,
            showAddTermDialog,
            applyBubbleSizeConfig,
            applyTheme,
            refreshBubbleI18n,
            createButton,
            createBubble,
            updatePinState,
            setBubbleLoading,
            positionButton,
            positionBubble,
            hideButton,
        });
    }

    global.JYT_CS_UI = { install };
})(globalThis);
