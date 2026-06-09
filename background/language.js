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

function normalizeLangTag(lang) {
    return String(lang || "").trim();
}

function resolveTranslationgemmaLangMeta(lang) {
    const raw = normalizeLangTag(lang);
    const normalized = raw.toLowerCase();

    const table = {
        zh: { name: "Chinese", code: "zh-Hans" },
        en: { name: "English", code: "en" },
        ja: { name: "Japanese", code: "ja" },
        ko: { name: "Korean", code: "ko" },
        fr: { name: "French", code: "fr" },
        de: { name: "German", code: "de" },
        es: { name: "Spanish", code: "es" },
        ru: { name: "Russian", code: "ru" },
    };

    if (table[normalized]) {
        return table[normalized];
    }

    if (!raw || normalized === "auto") {
        return { name: "Auto", code: "auto" };
    }

    return {
        name: raw,
        code: raw,
    };
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

function buildPromptWithTemplate(
    template,
    text,
    to,
    options,
    fallbackBuilder,
    appendTextWhenMissing = true,
) {
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

    if (appendTextWhenMissing && !normalizedTemplate.includes("{text}")) {
        prompt += `\n输入:\n${text}`;
    }

    return prompt;
}

function renderPromptTemplate(template, text, to, options) {
    return buildPromptWithTemplate(
        template,
        text,
        to,
        options,
        () => "",
        false,
    );
}

function buildDefaultUserPrompt(text, to, options) {
    return buildPrompt(text, to, options);
}

export function buildPrompt(text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const glossaryBlock = buildGlossaryConstraint(options?.glossaryTerms);
    return `${glossaryBlock}\n请把这段文字翻译为${targetLang}，不要有多余的输出。输入:\n${text}`;
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

export function buildChatPromptParts(text, to, options) {
    const systemTemplate = String(
        options?.systemPromptTemplate ||
            options?.legacyCustomPromptTemplate ||
            options?.customPromptTemplate ||
            "",
    ).trim();
    const userTemplate = String(options?.userPromptTemplate || "").trim();

    const systemPrompt = systemTemplate
        ? renderPromptTemplate(systemTemplate, text, to, options)
        : "";
    const userPrompt = userTemplate
        ? buildPromptWithTemplate(
              userTemplate,
              text,
              to,
              options,
              buildDefaultUserPrompt,
              true,
          )
        : buildDefaultUserPrompt(text, to, options);

    return {
        systemPrompt,
        userPrompt,
    };
}

export function buildOpenAIStyleMessages(promptParts) {
    const messages = [];
    const systemPrompt = String(promptParts?.systemPrompt || "").trim();
    const userPrompt = String(promptParts?.userPrompt || "").trim();
    if (systemPrompt) {
        messages.push({
            role: "system",
            content: systemPrompt,
        });
    }
    messages.push({
        role: "user",
        content: userPrompt,
    });
    return messages;
}

export function buildTranslationgemmaPrompt(text, from, to, options) {
    const sourceMeta = resolveTranslationgemmaLangMeta(from);
    const targetMeta = resolveTranslationgemmaLangMeta(to);

    const instruction =
        `You are a professional ${sourceMeta.name} (${sourceMeta.code}) to ${targetMeta.name} (${targetMeta.code}) translator. ` +
        `Your goal is to accurately convey the meaning and nuances of the original ${sourceMeta.name} text while adhering to ${targetMeta.name} grammar, vocabulary, and cultural sensitivities.\n` +
        `Produce only the ${targetMeta.name} translation, without any additional explanations or commentary. ` +
        `Please translate the following ${sourceMeta.name} text into ${targetMeta.name}:\n\n\n` +
        `${text}`;

    return instruction;
}

