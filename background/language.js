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

function normalizeContextWhitespace(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function getContextFieldValues(context) {
    const page = context?.page || {};
    return {
        before: normalizeContextWhitespace(context?.before || ""),
        after: normalizeContextWhitespace(context?.after || ""),
        block: normalizeContextWhitespace(context?.block || ""),
        pageTitle: normalizeContextWhitespace(page.title || ""),
        pageDomain: normalizeContextWhitespace(page.domain || ""),
        pageLang: normalizeContextWhitespace(page.lang || ""),
        selectedText: normalizeContextWhitespace(
            context?.selectedText || "",
        ),
    };
}

export function buildContextBlock(context) {
    if (!context || typeof context !== "object") {
        return "";
    }

    const fields = getContextFieldValues(context);
    const parts = [];
    if (fields.pageTitle) {
        parts.push(`网页标题: ${fields.pageTitle}`);
    }
    if (fields.pageDomain) {
        parts.push(`网页域名: ${fields.pageDomain}`);
    }
    if (fields.pageLang) {
        parts.push(`网页语言: ${fields.pageLang}`);
    }
    if (fields.block) {
        parts.push(`当前段落: ${fields.block}`);
    }
    if (fields.before) {
        parts.push(`前文: ${fields.before}`);
    }
    if (fields.after) {
        parts.push(`后文: ${fields.after}`);
    }
    if (fields.selectedText) {
        parts.push(`划选文本: ${fields.selectedText}`);
    }

    return parts.join("\n");
}

function resolvePromptMode(options) {
    const mode = String(options?.context?.mode || "").trim();
    if (mode === "lightweight" || mode === "enhanced") {
        return mode;
    }
    return "off";
}

function appendGlossaryConstraint(parts, glossaryTerms) {
    const glossaryBlock = buildGlossaryConstraint(glossaryTerms).trimStart();
    if (glossaryBlock) {
        parts.push(glossaryBlock);
    }
    return parts.join("\n");
}

function buildDefaultSystemPrompt(_text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const mode = resolvePromptMode(options);
    const glossaryTerms = options?.glossaryTerms;

    if (mode === "lightweight") {
        return appendGlossaryConstraint(
            [
                `请把【划选文本】翻译成${targetLang}。前后文只用于判断含义，不要翻译前后文。只输出译文。`,
            ],
            glossaryTerms,
        );
    }

    if (mode === "enhanced") {
        return appendGlossaryConstraint(
            [
                "你是一个浏览器划词翻译插件的翻译引擎。",
                `请根据网页上下文，将用户划选文本翻译成简洁自然的${targetLang}。`,
                "要求：",
                "1. 只翻译划选文本。",
                "2. 前文、后文和当前段落只用于消歧。",
                "3. 不要解释。",
                "4. 不要翻译整个段落。",
                "5. 保留代码、变量名、公式、URL。",
            ],
            glossaryTerms,
        );
    }

    return appendGlossaryConstraint(
        [`请将以下内容翻译成${targetLang}，只输出译文。`],
        glossaryTerms,
    );
}

function buildDefaultUserPrompt(text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const mode = resolvePromptMode(options);
    const fields = getContextFieldValues(options?.context);
    const selected = String(text || "");

    if (mode === "lightweight") {
        return [
            `前文：${fields.before}`,
            `划选文本：${selected}`,
            `后文：${fields.after}`,
        ].join("\n");
    }

    if (mode === "enhanced") {
        return [
            `网页标题：${fields.pageTitle}`,
            `网页域名：${fields.pageDomain}`,
            `前文：${fields.before}`,
            `划选文本：${selected}`,
            `后文：${fields.after}`,
            `当前段落：${fields.block}`,
            "",
            `${targetLang}译文：`,
        ].join("\n");
    }

    return selected;
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
    const contextBlock = buildContextBlock(options?.context);
    const fields = getContextFieldValues(options?.context);

    let prompt = normalizedTemplate
        .replaceAll("{targetLang}", targetLang)
        .replaceAll("{target_language}", targetLang)
        .replaceAll("{text}", String(text || ""))
        .replaceAll("{selected_text}", String(text || ""))
        .replaceAll("{glossary}", glossaryLines)
        .replaceAll("{glossaryConstraint}", glossaryConstraint)
        .replaceAll("{context}", contextBlock)
        .replaceAll("{before}", fields.before)
        .replaceAll("{after}", fields.after)
        .replaceAll("{before_context}", fields.before)
        .replaceAll("{after_context}", fields.after)
        .replaceAll("{block}", fields.block)
        .replaceAll("{block_text}", fields.block)
        .replaceAll("{pageTitle}", fields.pageTitle)
        .replaceAll("{pageDomain}", fields.pageDomain)
        .replaceAll("{pageLang}", fields.pageLang)
        .replaceAll("{page_title}", fields.pageTitle)
        .replaceAll("{page_domain}", fields.pageDomain)
        .replaceAll("{page_lang}", fields.pageLang);

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
        : buildDefaultSystemPrompt(text, to, options);
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
