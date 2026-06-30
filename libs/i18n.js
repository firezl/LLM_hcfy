// libs/i18n.js — runtime i18n for extension pages and content scripts
(function (global) {
    const SUPPORTED_LANGS = [
        "zh-CN",
        "zh-TW",
        "en",
        "ja",
        "ko",
        "fr",
        "de",
        "es",
        "ru",
        "pt",
    ];

    const LANG_ALIASES = {
        zh: "zh-CN",
        "zh-cn": "zh-CN",
        "zh-hans": "zh-CN",
        "zh-tw": "zh-TW",
        "zh-hk": "zh-TW",
        "zh-hant": "zh-TW",
        en: "en",
        "en-us": "en",
        "en-gb": "en",
        ja: "ja",
        ko: "ko",
        fr: "fr",
        de: "de",
        es: "es",
        ru: "ru",
        pt: "pt",
        "pt-br": "pt",
        "pt-pt": "pt",
    };

    const messages = global.JYT_I18N_MESSAGES || {};
    let currentLang = "en";
    let uiLangSetting = "auto";

    function normalizeLangCode(lang) {
        const raw = String(lang || "").trim();
        if (!raw || raw === "auto") {
            return "";
        }
        const lower = raw.toLowerCase();
        if (LANG_ALIASES[lower]) {
            return LANG_ALIASES[lower];
        }
        if (SUPPORTED_LANGS.includes(raw)) {
            return raw;
        }
        const base = lower.split("-")[0];
        return LANG_ALIASES[base] || "";
    }

    function detectBrowserLang() {
        const candidates = [];
        if (Array.isArray(global.navigator?.languages)) {
            candidates.push(...global.navigator.languages);
        }
        if (global.navigator?.language) {
            candidates.push(global.navigator.language);
        }
        for (const candidate of candidates) {
            const resolved = normalizeLangCode(candidate);
            if (resolved) {
                return resolved;
            }
        }
        return "en";
    }

    function resolveLang(uiLang) {
        const normalized = normalizeLangCode(uiLang);
        if (normalized) {
            return normalized;
        }
        return detectBrowserLang();
    }

    function getMessage(lang, key) {
        const catalog = messages[lang] || messages.en || messages["zh-CN"] || {};
        if (Object.prototype.hasOwnProperty.call(catalog, key)) {
            return catalog[key];
        }
        const fallback = messages.en || messages["zh-CN"] || {};
        if (Object.prototype.hasOwnProperty.call(fallback, key)) {
            return fallback[key];
        }
        return key;
    }

    function interpolate(template, vars) {
        let text = String(template ?? "");
        if (!vars || typeof vars !== "object") {
            return text;
        }
        for (const [name, value] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, String(value ?? ""));
        }
        return text;
    }

    function t(key, vars) {
        return interpolate(getMessage(currentLang, key), vars);
    }

    function setLang(uiLang) {
        uiLangSetting = String(uiLang || "auto");
        currentLang = resolveLang(uiLangSetting);
        if (global.document?.documentElement) {
            global.document.documentElement.lang = currentLang;
        }
    }

    function getCurrentLang() {
        return currentLang;
    }

    function getUiLangSetting() {
        return uiLangSetting;
    }

    function applyToElement(el) {
        if (!el || el.nodeType !== 1) {
            return;
        }

        const key = el.getAttribute("data-i18n");
        if (key) {
            el.textContent = t(key);
        }

        const placeholderKey = el.getAttribute("data-i18n-ph");
        if (placeholderKey && "placeholder" in el) {
            el.placeholder = t(placeholderKey);
        }

        const titleKey = el.getAttribute("data-i18n-title");
        if (titleKey && "title" in el) {
            el.title = t(titleKey);
        }

        const htmlKey = el.getAttribute("data-i18n-html");
        if (htmlKey) {
            el.innerHTML = t(htmlKey);
        }
    }

    function applyDom(root) {
        const scope = root && root.querySelectorAll ? root : global.document;
        if (!scope) {
            return;
        }
        if (scope.nodeType === 1 && scope.hasAttribute?.("data-i18n")) {
            applyToElement(scope);
        }
        const nodes = scope.querySelectorAll
            ? scope.querySelectorAll(
                  "[data-i18n], [data-i18n-ph], [data-i18n-title], [data-i18n-html]",
              )
            : [];
        for (const el of nodes) {
            applyToElement(el);
        }
    }

    function initFromSettings(uiLang) {
        setLang(uiLang);
        applyDom(global.document);
    }

    function loadUiLangFromStorage(callback) {
        const storage =
            global.chrome?.storage?.sync || global.browser?.storage?.sync;
        if (!storage?.get) {
            initFromSettings("auto");
            if (typeof callback === "function") {
                callback("auto");
            }
            return;
        }
        storage.get({ ui_lang: "auto" }, (items) => {
            const uiLang = items?.ui_lang || "auto";
            initFromSettings(uiLang);
            if (typeof callback === "function") {
                callback(uiLang);
            }
        });
    }

    function bindStorageListener(onChange) {
        const storage = global.chrome?.storage || global.browser?.storage;
        if (!storage?.onChanged?.addListener) {
            return;
        }
        storage.onChanged.addListener((changes, area) => {
            if (area !== "sync" || !changes.ui_lang) {
                return;
            }
            const next = changes.ui_lang.newValue || "auto";
            setLang(next);
            applyDom(global.document);
            if (typeof onChange === "function") {
                onChange(next);
            }
        });
    }

    global.JYT_I18N = {
        SUPPORTED_LANGS,
        resolveLang,
        t,
        setLang,
        getCurrentLang,
        getUiLangSetting,
        applyDom,
        initFromSettings,
        loadUiLangFromStorage,
        bindStorageListener,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
