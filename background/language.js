export function resolveLanguagePair(request) {
    const sourceSetting = request?.settings?.source_lang || "auto";
    const targetSetting = request?.settings?.target_lang || "auto";

    const from =
        sourceSetting !== "auto"
            ? sourceSetting
            : request.from || request.preferredFrom || "auto";

    let to =
        targetSetting !== "auto"
            ? targetSetting
            : request.to ||
              request.preferredTo ||
              (from === "zh" ? "en" : "zh");

    if (to === from) {
        to = from === "zh" ? "en" : "zh";
    }

    return { from, to };
}

export function getLanguageDisplayName(lang) {
    const normalized = String(lang || "").toLowerCase();
    const names = {
        zh: "中文",
        en: "英文",
        ja: "日文",
        ko: "韩文",
        fr: "法文",
        de: "德文",
        es: "西班牙文",
        ru: "俄文",
    };
    return names[normalized] || `${normalized}语言`;
}

export function buildPrompt(text, to) {
    const targetLang = getLanguageDisplayName(to);
    return `请把这段文字翻译为${targetLang}，不要有多余的输出。输入:\n${text}`;
}

export function buildWebLLMPrompt(text, to) {
    const targetLang = getLanguageDisplayName(to);
    return `请把以下文本翻译为${targetLang}，不要有多余的输出。输入:\n${text}`;
}
