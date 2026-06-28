// content/modules/bootstrap.js — event wiring and startup
(function (global) {
    function init(app) {
        const state = app.state;

        if (!document.body && !document.documentElement) {
            return;
        }

        app.createButton();
        app.createBubble();
        app.loadRuntimeSettings();
        app.registerPdfRuntimeListener();
        registerContextMenuListener(app, state);
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
                // content 不再持有 *_api_key / *_custom_headers，无需响应 local 区变更；
                // 这些字段由后台 settings-cache 维护。
                return;
            }
        });

        let isMouseDown = false;
        let selectionChangeTimer = null;
        let lastMouseUpTime = 0;

        function handleSelectionUpdate(preferredX, preferredY) {
            if (state.runtimeSettings.enabled !== "on") {
                app.hideButton();
                return;
            }

            const sel = window.getSelection();
            if (!sel) {
                app.hideButton();
                return;
            }

            const text = sel.toString();
            if (text && text.trim().length > 0) {
                state.lastSelection = text;
                const btn = app.getTranslateBtn?.();
                if (btn) {
                    let x;
                    let y;
                    if (preferredX != null && preferredY != null) {
                        x = preferredX;
                        y = preferredY;
                    } else {
                        const point = app.getSelectionAnchorPoint(sel);
                        x = point.x;
                        y = point.y;
                    }
                    state.lastSelectionPoint = { x, y };
                    app.positionButton(btn, x, y);
                }
            } else {
                app.hideButton();
            }
        }

        document.addEventListener("mousedown", () => {
            isMouseDown = true;
        });

        document.addEventListener("mouseup", (e) => {
            isMouseDown = false;
            lastMouseUpTime = Date.now();

            if (state.runtimeSettings.enabled !== "on") {
                app.hideButton();
                return;
            }

            const btnEl = app.getTranslateBtn?.();
            if (btnEl && (e.target === btnEl || btnEl.contains(e.target))) {
                return;
            }

            setTimeout(() => handleSelectionUpdate(e.clientX, e.clientY), 10);
        });

        document.addEventListener("selectionchange", () => {
            if (isMouseDown) {
                return;
            }

            // iframe/SPA 常在 mouseup 后清除选区，忽略紧随其后的 selectionchange
            if (Date.now() - lastMouseUpTime < 400) {
                return;
            }

            if (selectionChangeTimer) {
                clearTimeout(selectionChangeTimer);
            }
            selectionChangeTimer = setTimeout(() => {
                const sel = window.getSelection();
                const text = sel ? sel.toString().trim() : "";
                if (!text) {
                    return;
                }
                handleSelectionUpdate();
            }, 100);
        });

        document.addEventListener("keydown", (e) => {
            if (
                !app.isShortcutPressed(
                    e,
                    state.runtimeSettings.translate_shortcut,
                )
            ) {
                return;
            }

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
            if (app.isUiEventTarget?.(e.target)) {
                return;
            }

            app.hideButton();
            const bubble = app.getTranslateBubble?.();
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

    function registerContextMenuListener(app, state) {
        if (!chrome?.runtime?.onMessage?.addListener) {
            return;
        }

        chrome.runtime.onMessage.addListener((message) => {
            const type = String(message?.type || "");
            if (
                type !==
                (app.MESSAGE_TYPES.TRANSLATE_SELECTION || "TRANSLATE_SELECTION")
            ) {
                return false;
            }

            const text = String(message.text || "").trim();
            if (!text || state.runtimeSettings.enabled !== "on") {
                return false;
            }

            state.lastSelection = text;
            const point = app.getSelectionAnchorPoint(window.getSelection());
            app.triggerTranslate(text, point.x, point.y);
            return false;
        });
    }

    global.JYT_CS_BOOTSTRAP = { init };
})(globalThis);
