const DEEPL_LANG_TABLE = {
    zh: "ZH",
    "zh-cn": "ZH",
    "zh-hans": "ZH-HANS",
    "zh-tw": "ZH-HANT",
    "zh-hant": "ZH-HANT",
    en: "EN",
    ja: "JA",
    ko: "KO",
    fr: "FR",
    de: "DE",
    es: "ES",
    ru: "RU",
};

/**
 * Maps extension language codes to DeepL / DeepLX language codes.
 * @param {string} lang
 * @returns {string}
 */
export function normalizeDeepLLanguage(lang) {
    const normalized = String(lang || "").toLowerCase().trim();
    if (!normalized || normalized === "auto") {
        return "";
    }
    return DEEPL_LANG_TABLE[normalized] || normalized.toUpperCase();
}

/**
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isOfficialDeepLEndpoint(rawUrl) {
    try {
        const pathname = new URL(String(rawUrl || "").trim()).pathname
            .toLowerCase()
            .replace(/\/+$/, "");
        return pathname.endsWith("/v2/translate");
    } catch (err) {
        return false;
    }
}

/**
 * @param {string} apiKey
 * @param {{ official?: boolean }} [options]
 */
export function buildDeepLAuthHeaders(apiKey, options = {}) {
    const key = String(apiKey || "").trim();
    if (!key) {
        return {};
    }

    if (options.official) {
        return {
            Authorization: `DeepL-Auth-Key ${key}`,
        };
    }

    return {
        Authorization: `Bearer ${key}`,
    };
}

/**
 * @param {unknown} data
 * @returns {string}
 */
export function extractDeepLTranslation(data) {
    if (!data || typeof data !== "object") {
        return "";
    }

    if (typeof data.data === "string" && data.data.trim()) {
        return data.data.trim();
    }

    const translations = Array.isArray(data.translations) ? data.translations : [];
    const translated = translations
        .map((item) => (item && typeof item.text === "string" ? item.text : ""))
        .join("\n")
        .trim();

    return translated;
}

/**
 * @param {object} options
 * @param {string} options.text
 * @param {string} options.from
 * @param {string} options.to
 * @param {boolean} [options.official]
 */
export function buildDeepLRequestBody({ text, from, to, official = false }) {
    const sourceLang = normalizeDeepLLanguage(from);
    const targetLang = normalizeDeepLLanguage(to);

    if (!targetLang) {
        throw new Error("DeepL 需要明确的目标语言");
    }

    if (official) {
        const body = {
            text: [String(text || "")],
            target_lang: targetLang,
        };
        if (sourceLang) {
            body.source_lang = sourceLang;
        }
        return body;
    }

    const body = {
        text: String(text || ""),
        target_lang: targetLang,
    };
    if (sourceLang) {
        body.source_lang = sourceLang;
    }
    return body;
}
