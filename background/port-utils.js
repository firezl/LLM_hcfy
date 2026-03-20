export function safePostMessage(port, state, payload) {
    if (!state.connected) {
        return false;
    }
    try {
        port.postMessage(payload);
        return true;
    } catch (err) {
        state.connected = false;
        return false;
    }
}

export function postTranslateError(port, state, requestId, error) {
    safePostMessage(port, state, {
        type: "TRANSLATE_ERROR",
        requestId,
        error,
    });
}

export function postTranslateTextResult(port, state, requestId, text) {
    safePostMessage(port, state, {
        type: "TRANSLATE_CHUNK",
        requestId,
        content: String(text || ""),
    });
    safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
}
