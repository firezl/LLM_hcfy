/**
 * Pick the first successful, non-empty language detection result.
 * Fulfilled null/empty values must not mask a later detector.
 * @param {Array<{ status?: string, value?: unknown }> | null | undefined} results
 * @returns {string}
 */
export function pickDetectedLang(results) {
    if (!Array.isArray(results)) {
        return "";
    }

    for (const result of results) {
        if (!result || result.status !== "fulfilled") {
            continue;
        }
        if (typeof result.value !== "string") {
            continue;
        }
        const lang = result.value.trim();
        if (lang) {
            return lang;
        }
    }

    return "";
}
