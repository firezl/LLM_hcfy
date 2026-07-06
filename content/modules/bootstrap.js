// content/modules/bootstrap.js — event wiring and startup
(function (global) {
    function init(app) {
        const state = app.state;

        if (!document.body && !document.documentElement) {
            return;
        }

        app.createButton();
        app.loadRuntimeSettings(() => {
            app.createBubble();
        });
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
                    if (key === "ui_lang") {
                        if (global.JYT_I18N?.setLang) {
                            global.JYT_I18N.setLang(changes[key].newValue);
                        }
                        app.refreshBubbleI18n?.();
                        app.refreshPdfPromptI18n?.();
                    }
                    if (
                        key === "context_translate_mode" ||
                        key === "context_translate_enabled"
                    ) {
                        state.runtimeSettings.context_translate_mode =
                            app.resolveContextMode?.(state.runtimeSettings) ||
                            state.runtimeSettings.context_translate_mode;
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
                state.lastSelectionContext = app.collectSelectionContext
                    ? app.collectSelectionContext(sel)
                    : null;
                const btn = app.createButton?.();
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
                state.lastSelectionContext = null;
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
            state.lastSelectionContext = app.collectSelectionContext
                ? app.collectSelectionContext(sel)
                : null;
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

        registerIframeProxyListener(app, state);
    }

    function resolveIframePageCoords(offsetX, offsetY, data, fallbackPoint) {
        if (
            Number.isFinite(data.x) &&
            Number.isFinite(data.y)
        ) {
            return {
                x: offsetX + data.x,
                y: offsetY + data.y,
            };
        }
        if (
            fallbackPoint &&
            Number.isFinite(fallbackPoint.x) &&
            Number.isFinite(fallbackPoint.y)
        ) {
            return { x: fallbackPoint.x, y: fallbackPoint.y };
        }
        if (Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
            return { x: offsetX, y: offsetY };
        }
        return null;
    }

    function getIframeOffsetForSource(source) {
        let offsetX = 0;
        let offsetY = 0;
        if (!source || source === window) {
            return { offsetX, offsetY };
        }

        const frames = document.querySelectorAll("iframe");
        for (const frame of frames) {
            try {
                if (frame.contentWindow === source) {
                    const rect = frame.getBoundingClientRect();
                    offsetX = rect.left;
                    offsetY = rect.top;
                    break;
                }
            } catch (err) {
                // ignore cross-origin access failures
            }
        }

        return { offsetX, offsetY };
    }

    function registerIframeProxyListener(app, state) {
        window.addEventListener("message", (event) => {
            const data = event.data;
            if (!data || !data.__jyt) {
                return;
            }

            const type = String(data.type || "");

            if (type === "IFRAME_SELECTION_CLEARED") {
                app.hideButton();
                return;
            }

            if (type === "IFRAME_SELECTION") {
                if (state.runtimeSettings.enabled !== "on") {
                    app.hideButton();
                    return;
                }

                const text = String(data.text || "").trim();
                if (!text) {
                    app.hideButton();
                    return;
                }

                if (
                    !Number.isFinite(data.x) ||
                    !Number.isFinite(data.y)
                ) {
                    state.lastSelection = text;
                    app.hideButton();
                    return;
                }

                const { offsetX, offsetY } = getIframeOffsetForSource(
                    event.source,
                );
                const x = offsetX + data.x;
                const y = offsetY + data.y;
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    state.lastSelection = text;
                    app.hideButton();
                    return;
                }

                state.lastSelection = text;
                state.lastSelectionPoint = { x, y };
                state.lastSelectionContext = null;

                const btn = app.createButton?.();
                if (btn) {
                    app.positionButton(btn, x, y);
                }
                return;
            }

            if (type === "IFRAME_TRIGGER") {
                const text = String(data.text || "").trim();
                if (!text || state.runtimeSettings.enabled !== "on") {
                    return;
                }

                const { offsetX, offsetY } = getIframeOffsetForSource(
                    event.source,
                );
                const coords = resolveIframePageCoords(
                    offsetX,
                    offsetY,
                    data,
                    state.lastSelectionPoint,
                );
                if (!coords) {
                    return;
                }
                state.lastSelection = text;
                app.triggerTranslate(text, coords.x, coords.y);
                return;
            }

            if (type === "IFRAME_KEYDOWN") {
                if (state.runtimeSettings.enabled !== "on") {
                    return;
                }

                const syntheticEvent = {
                    key: data.key,
                    code: data.code,
                    ctrlKey: !!data.ctrlKey,
                    altKey: !!data.altKey,
                    shiftKey: !!data.shiftKey,
                    metaKey: !!data.metaKey,
                };
                if (
                    !app.isShortcutPressed(
                        syntheticEvent,
                        state.runtimeSettings.translate_shortcut,
                    )
                ) {
                    return;
                }

                const text = String(data.text || "").trim();
                if (!text) {
                    return;
                }

                const { offsetX, offsetY } = getIframeOffsetForSource(
                    event.source,
                );
                const coords = resolveIframePageCoords(
                    offsetX,
                    offsetY,
                    data,
                    state.lastSelectionPoint,
                );
                if (!coords) {
                    return;
                }
                state.lastSelection = text;
                app.triggerTranslate(text, coords.x, coords.y);
            }
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
            const sel = window.getSelection();
            state.lastSelectionContext = app.collectSelectionContext
                ? app.collectSelectionContext(sel)
                : null;
            const point = app.getSelectionAnchorPoint(sel);
            app.triggerTranslate(text, point.x, point.y);
            return false;
        });
    }

    global.JYT_CS_BOOTSTRAP = { init };
})(globalThis);
