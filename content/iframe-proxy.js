// content/iframe-proxy.js — lightweight proxy for iframe selection relay (esbuild entry).
(function () {
    if (window.top === window.self) {
        return;
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
            "IFRAME_TRIGGER",
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

    function reportSelection(clientX, clientY) {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        if (!text) {
            postToParent({ type: "IFRAME_SELECTION_CLEARED" });
            return;
        }

        const point = getSelectionPoint(clientX, clientY);
        if (!point) {
            return;
        }

        postToParent({
            type: "IFRAME_SELECTION",
            text,
            x: point.x,
            y: point.y,
        });
    }

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
        setTimeout(() => reportSelection(e.clientX, e.clientY), 10);
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
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : "";
            if (!text) {
                postToParent({ type: "IFRAME_SELECTION_CLEARED" });
                return;
            }
            reportSelection();
        }, 100);
    });

    if (chrome?.runtime?.onMessage?.addListener) {
        chrome.runtime.onMessage.addListener((message) => {
            const type = String(message?.type || "");
            if (type !== "TRANSLATE_SELECTION") {
                return false;
            }

            const text = String(message.text || "").trim();
            if (!text) {
                return false;
            }

            const point = getSelectionPoint();
            const payload = {
                type: "IFRAME_TRIGGER",
                text,
            };
            appendPoint(payload, point);
            postToParent(payload);
            return false;
        });
    }

    document.addEventListener("keydown", (e) => {
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
