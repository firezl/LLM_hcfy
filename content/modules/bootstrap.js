// content/modules/bootstrap.js — event wiring and startup
(function (global) {
    function init(app) {
        const state = app.state;

        if (!document.body && !document.documentElement) {
            return;
        }

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
                    if (
                        key === "pdf_prompt_enabled" &&
                        changes[key].newValue === "off"
                    ) {
                        void app.dismissPdfPrompt?.();
                    }
                    if (
                        key === "disabled_sites" &&
                        app.isRuntimeSiteDisabled?.()
                    ) {
                        app.hideButton();
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
            if (app.isRuntimeSiteDisabled?.()) {
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
                state.lastSelectionContext = null;
                rememberSelectionRange(state, sel);
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
                state.lastSelectionRange = null;
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
            if (app.isRuntimeSiteDisabled?.()) {
                app.hideButton();
                return;
            }

            const btnEl = app.getTranslateBtn?.();
            if (btnEl && (e.target === btnEl || btnEl.contains(e.target))) {
                return;
            }

            const altKey = e.altKey === true;
            const clientX = e.clientX;
            const clientY = e.clientY;
            setTimeout(() => {
                if (state.runtimeSettings.enabled !== "on") {
                    app.hideButton();
                    return;
                }
                if (app.isRuntimeSiteDisabled?.()) {
                    app.hideButton();
                    return;
                }
                const sel = window.getSelection();
                const text = sel ? sel.toString() : "";
                if (
                    app.shouldDirectTranslateSelection?.({
                        altKey,
                        text,
                        selection: sel,
                    })
                ) {
                    const trimmed = String(text || "").trim();
                    state.lastSelection = trimmed;
                    state.lastSelectionContext = null;
                    rememberSelectionRange(state, sel);
                    state.lastSelectionPoint = { x: clientX, y: clientY };
                    app.hideButton();
                    app.triggerTranslate(trimmed, clientX, clientY);
                    return;
                }
                handleSelectionUpdate(clientX, clientY);
            }, 10);
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
            if (e.key === "Escape") {
                const bubble = app.getTranslateBubble?.();
                const display = bubble?.style?.display || "";
                if (bubble && display && display !== "none") {
                    e.preventDefault();
                    app.cancelActiveTranslateRequest();
                    app.clearTermEditorUI(true);
                    bubble.style.display = "none";
                    state.isPinned = false;
                    app.updatePinState(bubble);
                    app.hideButton();
                    return;
                }
            }

            if (
                !app.isShortcutPressed(
                    e,
                    state.runtimeSettings.translate_shortcut,
                )
            ) {
                return;
            }
            if (app.isRuntimeSiteDisabled?.()) {
                return;
            }

            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : "";
            if (!text) return;

            e.preventDefault();
            state.lastSelection = text;
            state.lastSelectionContext = null;
            rememberSelectionRange(state, sel);
            const point = app.getSelectionAnchorPoint(sel);
            app.triggerTranslate(text, point.x, point.y);
        });

        document.addEventListener(
            "click",
            (e) => {
                if (state.runtimeSettings.enabled !== "on") {
                    return;
                }

                if (state.runtimeSettings.pdf_prompt_enabled === "off") {
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
                const linkTarget = String(anchor.getAttribute("target") || "")
                    .trim()
                    .toLowerCase();
                app.showPdfPrompt({
                    source: "click",
                    pdfUrl,
                    isPdf: null,
                    openInNewTab:
                        linkTarget !== "" &&
                        !["_self", "_top", "_parent"].includes(linkTarget),
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

    function rememberSelectionRange(state, sel) {
        try {
            if (sel && sel.rangeCount > 0) {
                state.lastSelectionRange = sel.getRangeAt(0).cloneRange();
                return;
            }
        } catch (_err) {
            state.lastSelectionRange = null;
            return;
        }
        state.lastSelectionRange = null;
    }

    function clampIframeText(value) {
        const text = String(value ?? "").trim();
        if (text.length <= 5000) {
            return text;
        }
        return text.slice(0, 5000);
    }

    function getIframeOffsetForSource(source) {
        if (!source || source === window) {
            return { offsetX: 0, offsetY: 0, found: false };
        }

        const frames = document.querySelectorAll("iframe");
        for (const frame of frames) {
            try {
                if (frame.contentWindow === source) {
                    const rect = frame.getBoundingClientRect();
                    return {
                        offsetX: rect.left,
                        offsetY: rect.top,
                        found: true,
                    };
                }
            } catch (err) {
                // ignore cross-origin access failures
            }
        }

        return { offsetX: 0, offsetY: 0, found: false };
    }

    function registerIframeProxyListener(app, state) {
        let lastIframeKeydownAt = 0;

        window.addEventListener("message", (event) => {
            const data = event.data;
            if (!data || !data.__jyt) {
                return;
            }
            if (event.source === window) {
                return;
            }
            if (state.runtimeSettings.enabled !== "on") {
                return;
            }

            const located = getIframeOffsetForSource(event.source);
            if (!located.found) {
                return;
            }
            if (app.isRuntimeSiteDisabled?.()) {
                app.hideButton();
                return;
            }

            const type = String(data.type || "");
            const { offsetX, offsetY } = located;

            if (type === "IFRAME_SELECTION_CLEARED") {
                app.hideButton();
                return;
            }

            if (type === "IFRAME_SELECTION") {
                const text = clampIframeText(data.text);
                if (!text) {
                    app.hideButton();
                    return;
                }

                state.lastSelectionContext = null;
                state.lastSelectionRange = null;

                if (
                    !Number.isFinite(data.x) ||
                    !Number.isFinite(data.y)
                ) {
                    state.lastSelection = text;
                    app.hideButton();
                    return;
                }

                const x = offsetX + data.x;
                const y = offsetY + data.y;
                if (!Number.isFinite(x) || !Number.isFinite(y)) {
                    state.lastSelection = text;
                    app.hideButton();
                    return;
                }

                state.lastSelection = text;
                state.lastSelectionPoint = { x, y };

                if (
                    app.shouldDirectTranslateSelection?.({
                        altKey: data.altKey === true,
                        text,
                        inEditable: false,
                    })
                ) {
                    app.hideButton();
                    app.triggerTranslate(text, x, y);
                    return;
                }

                const btn = app.createButton?.();
                if (btn) {
                    app.positionButton(btn, x, y);
                }
                return;
            }

            if (type === "IFRAME_KEYDOWN") {
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
                if (app.isRuntimeSiteDisabled?.()) {
                    return;
                }

                const text = clampIframeText(data.text);
                if (!text) {
                    return;
                }

                const now = Date.now();
                if (now - lastIframeKeydownAt < 800) {
                    return;
                }
                lastIframeKeydownAt = now;

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
                state.lastSelectionContext = null;
                state.lastSelectionRange = null;
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
            state.lastSelectionContext = null;
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                rememberSelectionRange(state, sel);
            } else {
                state.lastSelectionRange = null;
            }
            const point = app.getSelectionAnchorPoint(sel);
            app.triggerTranslate(text, point.x, point.y);
            return false;
        });
    }

    global.JYT_CS_BOOTSTRAP = { init };
})(globalThis);
