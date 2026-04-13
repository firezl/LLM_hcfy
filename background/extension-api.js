export const extensionApi = typeof browser !== "undefined" ? browser : chrome;

export function getMessage(key, substitutions) {
    if (!key) return "";
    const i18n = extensionApi?.i18n;
    if (!i18n || typeof i18n.getMessage !== "function") {
        return "";
    }

    try {
        return i18n.getMessage(key, substitutions);
    } catch (err) {
        return "";
    }
}

export function t(key, fallback = "", substitutions) {
    const message = getMessage(key, substitutions);
    if (typeof message === "string" && message.trim()) {
        return message;
    }
    return fallback || key;
}
