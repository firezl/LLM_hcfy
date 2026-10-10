// content/iframe-proxy.js — lightweight proxy for iframe selection relay (esbuild entry).
(function () {
    if (window.top === window.self) {
        return;
    }

    let runtimeEnabled = "";
    let translateShortcut = "";
    let hadSelection = false;

    function parseShortcut(shortcut) {
        const raw = String(shortcut || "").trim();
        if (!raw) return null;

        const parts = raw
            .split("+")
            .map((part) => part.trim())
            .filter(Boolean);

        const cfg = {
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
            key: "",
        };
        for (const part of parts) {
            const lower = part.toLowerCase();
            if (lower === "ctrl" || lower === "control") {
                cfg.ctrl = true;
                continue;
            }
            if (lower === "alt") {
                cfg.alt = true;
                continue;
            }
            if (lower === "shift") {
                cfg.shift = true;
                continue;
            }
            if (
                lower === "meta" ||
                lower === "cmd" ||
                lower === "command" ||
                lower === "win"
            ) {
                cfg.meta = true;
                continue;
            }
            cfg.key = lower;
        }

        return cfg.key ? cfg : null;
    }

    function isShortcutPressed(e, shortcut) {
        const cfg = parseShortcut(shortcut);
        if (!cfg) return false;

        const key = String(e.key || "").toLowerCase();
        return (
            e.ctrlKey === cfg.ctrl &&
            e.altKey === cfg.alt &&
            e.shiftKey === cfg.shift &&
            e.metaKey === cfg.meta &&
            key === cfg.key
        );
    }

    function readProxySettings() {
        try {
            if (!chrome?.storage?.sync?.get) return;
            chrome.storage.sync.get(
                { enabled: "on", translate_shortcut: "" },
                (items) => {
                    if (chrome.runtime?.lastError) return;
                    runtimeEnabled =
                        items?.enabled == null ? "" : String(items.enabled);
                    translateShortcut =
                        items?.translate_shortcut == null
                            ? ""
                            : String(items.translate_shortcut);
                },
            );
        } catch (_err) {
            // ignore storage read failures
        }
    }

    function watchProxySettings() {
        try {
            if (!chrome?.storage?.onChanged?.addListener) return;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== "sync" || !changes) return;
                if (Object.prototype.hasOwnProperty.call(changes, "enabled")) {
                    const value = changes.enabled.newValue;
                    runtimeEnabled = value == null ? "" : String(value);
                }
                if (
                    Object.prototype.hasOwnProperty.call(
                        changes,
                        "translate_shortcut",
                    )
                ) {
                    const value = changes.translate_shortcut.newValue;
                    translateShortcut = value == null ? "" : String(value);
                }
            });
        } catch (_err) {
            // ignore storage listener failures
        }
    }

    function getSelectionPoint(clientX, clientY) {
        if (clientX != null && clientY != null) {
            return { x: clientX, y: clientY };
        }

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            return null;
        }

        const rect = sel.getRangeAt(0).getBoundingClientRect();
        return { x: rect.left, y: rect.bottom };
    }

    function postToParent(payload) {
        if (runtimeEnabled !== "on") return;
        try {
            window.parent.postMessage({ __jyt: true, ...payload }, "*");
        } catch (err) {
            // ignore cross-origin parent access failures
        }
    }

    function appendPoint(payload, point) {
        if (
            point &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y)
        ) {
            payload.x = point.x;
            payload.y = point.y;
        }
    }

    function findIframeOffset(source) {
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
                // ignore
            }
        }

        return { offsetX, offsetY };
    }

    function relayChildMessage(event) {
        const data = event.data;
        if (!data || !data.__jyt || event.source === window) {
            return;
        }

        const type = String(data.type || "");
        const relayTypes = new Set([
            "IFRAME_SELECTION",
            "IFRAME_SELECTION_CLEARED",
            "IFRAME_KEYDOWN",
        ]);
        if (!relayTypes.has(type)) {
            return;
        }

        if (type === "IFRAME_SELECTION_CLEARED") {
            postToParent({ type });
            return;
        }

        const { offsetX, offsetY } = findIframeOffset(event.source);
        const payload = { type };

        if (data.text != null) {
            payload.text = data.text;
        }
        if (
            Number.isFinite(data.x) &&
            Number.isFinite(data.y)
        ) {
            payload.x = offsetX + data.x;
            payload.y = offsetY + data.y;
        }
        if (type === "IFRAME_SELECTION" && typeof data.altKey === "boolean") {
            payload.altKey = data.altKey;
        }
        if (type === "IFRAME_KEYDOWN") {
            payload.key = data.key;
            payload.code = data.code;
            payload.ctrlKey = data.ctrlKey;
            payload.altKey = data.altKey;
            payload.shiftKey = data.shiftKey;
            payload.metaKey = data.metaKey;
        }

        postToParent(payload);
    }

    function noteSelectionCleared() {
        if (!hadSelection) return;
        hadSelection = false;
        postToParent({ type: "IFRAME_SELECTION_CLEARED" });
    }

    function reportSelection(clientX, clientY, altKey) {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        if (!text) {
            noteSelectionCleared();
            return;
        }

        hadSelection = true;
        const point = getSelectionPoint(clientX, clientY);
        if (!point) {
            return;
        }

        const payload = {
            type: "IFRAME_SELECTION",
            text,
            x: point.x,
            y: point.y,
        };
        if (typeof altKey === "boolean") {
            payload.altKey = altKey;
        }
        postToParent(payload);
    }

    readProxySettings();
    watchProxySettings();

    window.addEventListener("message", relayChildMessage);

    let isMouseDown = false;
    let selectionChangeTimer = null;
    let lastMouseUpTime = 0;

    document.addEventListener("mousedown", () => {
        isMouseDown = true;
    });

    document.addEventListener("mouseup", (e) => {
        isMouseDown = false;
        lastMouseUpTime = Date.now();
        setTimeout(() => reportSelection(e.clientX, e.clientY, e.altKey), 10);
    });

    document.addEventListener("selectionchange", () => {
        if (isMouseDown) {
            return;
        }

        if (Date.now() - lastMouseUpTime < 400) {
            return;
        }

        if (selectionChangeTimer) {
            clearTimeout(selectionChangeTimer);
        }

        selectionChangeTimer = setTimeout(() => {
            reportSelection();
        }, 100);
    });

    document.addEventListener("keydown", (e) => {
        if (!isShortcutPressed(e, translateShortcut)) {
            return;
        }

        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        if (!text) {
            return;
        }

        const point = getSelectionPoint();
        const payload = {
            type: "IFRAME_KEYDOWN",
            text,
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
        };
        appendPoint(payload, point);
        postToParent(payload);
    });
})();
