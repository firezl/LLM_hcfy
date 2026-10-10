/**
 * Whether a selection should translate immediately instead of showing the button.
 * Unknown modes behave like "button".
 *
 * @param {{ mode?: string, altKey?: boolean, text?: string, inEditable?: boolean }} input
 * @returns {boolean}
 */
export function shouldDirectTranslate({ mode, altKey, text, inEditable } = {}) {
    if (inEditable) {
        return false;
    }

    const trimmed = String(text ?? "").trim();
    if (mode === "auto") {
        return trimmed.length >= 2;
    }
    if (mode === "alt") {
        return altKey === true && trimmed.length > 0;
    }
    return false;
}
