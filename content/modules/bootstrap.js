// content/modules/bootstrap.js — event wiring and startup
(function (global) {
    function init(app) {
        const state = app.state;

        app.createButton();
        app.createBubble();
        app.loadRuntimeSettings();
        app.registerPdfRuntimeListener();
        void app.restorePendingPdfPrompt();

        window
            .matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", () => {
                if (state.runtimeSettings.theme_mode === "auto") {
                    app.applyTheme("auto");
                }
            });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync") {
                for (const key of Object.keys(changes)) {
                    state.runtimeSettings[key] = changes[key].newValue;
                    if (key === "theme_mode") {
                        app.applyTheme(changes[key].newValue);
                    }
                }
                return;
            }

            if (area === "local") {
                for (const key of Object.keys(changes)) {
                    if (!app.API_KEY_FIELDS.includes(key)) {
                        continue;
                    }
                    state.runtimeSettings[key] = String(
                        changes[key].newValue || "",
                    );
                }
            }
        });

            document.addEventListener("mouseup", (e) => {
                if (state.runtimeSettings.enabled !== "on") {
                    app.hideButton();
                    return;
                }

                const mouseX = e.clientX;
                const mouseY = e.clientY;

                const btnEl = document.getElementById(app.BUTTON_ID);
                if (btnEl && (e.target === btnEl || btnEl.contains(e.target))) return;

                setTimeout(() => {
                    const sel = window.getSelection();
                    if (!sel) {
                        app.hideButton();
                        return;
                    }

                    const text = sel.toString();
                    if (text && text.trim().length > 0) {
                        state.lastSelection = text;
                        const btn = document.getElementById(app.BUTTON_ID);
                        if (btn) {
                            app.positionButton(btn, mouseX, mouseY);
                        }
                    } else {
                        app.hideButton();
                    }
                }, 10);
            });

            document.addEventListener("keydown", (e) => {
                if (!app.isShortcutPressed(e, state.runtimeSettings.translate_shortcut)) return;

                const sel = window.getSelection();
                const text = sel ? sel.toString().trim() : "";
                if (!text) return;

                e.preventDefault();
                state.lastSelection = text;
                const point = app.getSelectionAnchorPoint(sel);
                app.triggerTranslate(text, point.x, point.y);
            });

            document.addEventListener(
                "click",
                (e) => {
                    if (state.runtimeSettings.enabled !== "on") {
                        return;
                    }

                    if (e.defaultPrevented || e.button !== 0) {
                        return;
                    }

                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                        return;
                    }

                    const target = e.target;
                    if (!target || typeof target.closest !== "function") {
                        return;
                    }

                    const anchor = target.closest("a[href]");
                    if (!anchor || !anchor.href) {
                        return;
                    }

                    if (!app.isLikelyPdfUrl(anchor.href)) {
                        return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    const pdfUrl = anchor.href;
                    app.showPdfPrompt({
                        source: "click",
                        pdfUrl,
                        isPdf: null,
                    });
                    void app.checkPdfUrlAndUpdatePrompt(pdfUrl);
                },
                true,
            );

            document.addEventListener("click", (e) => {
                const btnEl = document.getElementById(app.BUTTON_ID);
                const bubble = document.getElementById(app.BUBBLE_ID);

                if (btnEl && (e.target === btnEl || btnEl.contains(e.target))) return;
                if (bubble && bubble.contains(e.target)) return;

                app.hideButton();
                if (bubble && !state.isPinned) {
                    app.clearTermEditorUI(true);
                    bubble.style.display = "none";
                }
            });

        window.addEventListener("pagehide", () => {
            app.hidePdfPrompt();
            app.releaseTranslatePortForPageHide();
        });

        window.addEventListener("pageshow", (event) => {
            if (!event.persisted) return;
            app.releaseTranslatePortForPageHide();
        });
    }

    global.JYT_CS_BOOTSTRAP = { init };
})(globalThis);
