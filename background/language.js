import { I18N_MESSAGES } from "../libs/i18n-messages.mjs";

const PROMPT_TEXT = I18N_MESSAGES.en || {};

function pt(key, vars) {
    let text = String(PROMPT_TEXT[key] ?? key);
    if (vars && typeof vars === "object") {
        for (const [name, value] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, String(value ?? ""));
        }
    }
    return text;
}

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
        zh: "Chinese",
        en: "English",
        ja: "Japanese",
        ko: "Korean",
        fr: "French",
        de: "German",
        es: "Spanish",
        ru: "Russian",
    };
    return names[normalized] || `${normalized} language`;
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
        lines.push(
            pt("prompt.glossaryLine", { source, target }),
        );
    }

    if (lines.length === 0) {
        return "";
    }

    return `\n${pt("prompt.glossaryConstraint")}\n${lines.join("\n")}`;
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
        lines.push(pt("prompt.glossaryLine", { source, target }));
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
        parts.push(`Page title: ${fields.pageTitle}`);
    }
    if (fields.pageDomain) {
        parts.push(`Page domain: ${fields.pageDomain}`);
    }
    if (fields.pageLang) {
        parts.push(`Page language: ${fields.pageLang}`);
    }
    if (fields.block) {
        parts.push(`Current paragraph: ${fields.block}`);
    }
    if (fields.before) {
        parts.push(`Before: ${fields.before}`);
    }
    if (fields.after) {
        parts.push(`After: ${fields.after}`);
    }
    if (fields.selectedText) {
        parts.push(`Selected text: ${fields.selectedText}`);
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
            [pt("prompt.default.system.lightweight", { targetLang })],
            glossaryTerms,
        );
    }

    if (mode === "enhanced") {
        return appendGlossaryConstraint(
            [pt("prompt.default.system.enhanced", { targetLang })],
            glossaryTerms,
        );
    }

    return appendGlossaryConstraint(
        [pt("prompt.default.system.simple", { targetLang })],
        glossaryTerms,
    );
}

function buildDefaultUserPrompt(text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const mode = resolvePromptMode(options);
    const fields = getContextFieldValues(options?.context);
    const selected = String(text || "");

    if (mode === "lightweight") {
        return pt("prompt.default.user.lightweight", {
            before: fields.before,
            selected,
            after: fields.after,
        });
    }

    if (mode === "enhanced") {
        return pt("prompt.default.user.enhanced", {
            pageTitle: fields.pageTitle,
            pageDomain: fields.pageDomain,
            before: fields.before,
            selected,
            after: fields.after,
            block: fields.block,
            targetLang,
        });
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
        prompt += `\n${pt("prompt.legacy.fallback", { targetLang, text })}`;
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
    return `${glossaryBlock}\n${pt("prompt.legacy.fallback", { targetLang, text })}`;
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
