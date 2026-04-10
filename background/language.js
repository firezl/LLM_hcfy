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

function normalizeTerm(term) {
    return String(term || "").trim();
}

function buildGlossaryConstraint(glossaryTerms) {
    if (!Array.isArray(glossaryTerms) || glossaryTerms.length === 0) {
        return "";
    }

    const lines = [];
    for (const term of glossaryTerms) {
        const source = normalizeTerm(term?.sourceTerm);
        const target = normalizeTerm(term?.targetTerm);
        if (!source || !target) {
            continue;
        }
        lines.push(`- ${source} => ${target}`);
    }

    if (lines.length === 0) {
        return "";
    }

    return `\n术语约束（若原文命中，请优先使用以下术语翻译）：\n${lines.join("\n")}`;
}

function buildGlossaryLines(glossaryTerms) {
    if (!Array.isArray(glossaryTerms) || glossaryTerms.length === 0) {
        return "";
    }

    const lines = [];
    for (const term of glossaryTerms) {
        const source = normalizeTerm(term?.sourceTerm);
        const target = normalizeTerm(term?.targetTerm);
        if (!source || !target) {
            continue;
        }
        lines.push(`- ${source} => ${target}`);
    }

    return lines.join("\n");
}

function buildPromptWithTemplate(template, text, to, options, fallbackBuilder) {
    const normalizedTemplate = String(template || "").trim();
    if (!normalizedTemplate) {
        return fallbackBuilder(text, to, options);
    }

    const targetLang = getLanguageDisplayName(to);
    const glossaryConstraint = buildGlossaryConstraint(
        options?.glossaryTerms,
    ).trimStart();
    const glossaryLines = buildGlossaryLines(options?.glossaryTerms);

    let prompt = normalizedTemplate
        .replaceAll("{targetLang}", targetLang)
        .replaceAll("{text}", String(text || ""))
        .replaceAll("{glossary}", glossaryLines)
        .replaceAll("{glossaryConstraint}", glossaryConstraint);

    if (!normalizedTemplate.includes("{text}")) {
        prompt += `\n输入:\n${text}`;
    }

    return prompt;
}

export function buildPrompt(text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const glossaryBlock = buildGlossaryConstraint(options?.glossaryTerms);
    return `请把这段文字翻译为${targetLang}，不要有多余的输出。${glossaryBlock}\n输入:\n${text}`;
}

export function buildPromptWithUserTemplate(text, to, options) {
    return buildPromptWithTemplate(
        options?.customPromptTemplate,
        text,
        to,
        options,
        buildPrompt,
    );
}

export function buildWebLLMPrompt(text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const glossaryBlock = buildGlossaryConstraint(options?.glossaryTerms);
    return `请把以下文本翻译为${targetLang}，不要有多余的输出。${glossaryBlock}\n输入:\n${text}`;
}

export function buildWebLLMPromptWithUserTemplate(text, to, options) {
    return buildPromptWithTemplate(
        options?.customPromptTemplate,
        text,
        to,
        options,
        buildWebLLMPrompt,
    );
}
