import { I18N_MESSAGES } from "../libs/i18n-messages.mjs";
import { extensionApi } from "./extension-api.js";

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

let currentLang = "en";
let uiLangSetting = "auto";
const changeListeners = new Set();

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

function resolveLang(uiLang) {
    const normalized = normalizeLangCode(uiLang);
    return normalized || "en";
}

function getMessage(lang, key) {
    const catalog = I18N_MESSAGES[lang] || I18N_MESSAGES.en || {};
    if (Object.prototype.hasOwnProperty.call(catalog, key)) {
        return catalog[key];
    }
    const fallback = I18N_MESSAGES.en || {};
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

export function t(key, vars) {
    return interpolate(getMessage(currentLang, key), vars);
}

export function getCurrentLang() {
    return currentLang;
}

export function getUiLangSetting() {
    return uiLangSetting;
}

export function setLang(uiLang) {
    uiLangSetting = String(uiLang || "auto");
    currentLang = resolveLang(uiLangSetting);
    for (const listener of changeListeners) {
        listener(currentLang, uiLangSetting);
    }
}

export function onLangChange(listener) {
    if (typeof listener === "function") {
        changeListeners.add(listener);
    }
    return () => changeListeners.delete(listener);
}

export async function loadUiLangFromStorage() {
    const storage = extensionApi.storage?.sync;
    if (!storage?.get) {
        setLang("auto");
        return uiLangSetting;
    }

    const items = await new Promise((resolve) => {
        storage.get({ ui_lang: "auto" }, (result) => {
            resolve(result || { ui_lang: "auto" });
        });
    });
    setLang(items.ui_lang || "auto");
    return uiLangSetting;
}

export function bindStorageListener() {
    if (!extensionApi.storage?.onChanged) {
        return;
    }
    extensionApi.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes.ui_lang) {
            return;
        }
        setLang(changes.ui_lang.newValue || "auto");
    });
}

export async function initBackgroundI18n() {
    await loadUiLangFromStorage();
    bindStorageListener();
}
