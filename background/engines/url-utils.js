const DEFAULT_OPENAI_CHAT_PATH = "/v1/chat/completions";
const DEFAULT_OLLAMA_CHAT_PATH = "/api/chat";

function buildUrlCandidate(rawValue, preferredProtocol) {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) {
        return "";
    }

    if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
        return trimmed;
    }

    if (trimmed.startsWith("//")) {
        return `${preferredProtocol}:${trimmed}`;
    }

    return `${preferredProtocol}://${trimmed}`;
}

function parseHttpUrl(
    rawUrl,
    fallbackUrl,
    preferredProtocol,
    invalidMsgPrefix,
) {
    const candidate =
        buildUrlCandidate(rawUrl, preferredProtocol) ||
        buildUrlCandidate(fallbackUrl, preferredProtocol);

    let parsed;
    try {
        parsed = new URL(candidate);
    } catch (err) {
        return {
            ok: false,
            error: `${invalidMsgPrefix}地址无效，请填写正确 URL（例如 ${fallbackUrl}）`,
        };
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
        return {
            ok: false,
            error: `${invalidMsgPrefix}地址仅支持 http/https 协议`,
        };
    }

    return {
        ok: true,
        parsed,
    };
}

function trimPath(pathname) {
    const raw = String(pathname || "").trim();
    if (!raw || raw === "/") {
        return "";
    }
    return raw.replace(/\/+$/, "");
}

function ensureLeadingSlash(pathname) {
    if (!pathname) {
        return "/";
    }
    return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function isVersionBasePath(pathname) {
    return /(^|\/)v\d+(?:[._-]?beta\d*)?$/i.test(pathname);
}

function isOpenAIEndpointPath(pathname) {
    return /(?:chat\/completions|completions|responses)$/i.test(pathname);
}

function buildOpenAIPath(pathname) {
    const trimmed = trimPath(pathname);
    if (!trimmed) {
        return DEFAULT_OPENAI_CHAT_PATH;
    }

    const lowered = trimmed.toLowerCase();
    if (isOpenAIEndpointPath(lowered)) {
        return ensureLeadingSlash(trimmed);
    }

    if (isVersionBasePath(lowered)) {
        return `${ensureLeadingSlash(trimmed)}/chat/completions`;
    }

    return ensureLeadingSlash(trimmed);
}

function buildOllamaPath(pathname) {
    const trimmed = trimPath(pathname);
    if (!trimmed) {
        return DEFAULT_OLLAMA_CHAT_PATH;
    }

    const lowered = trimmed.toLowerCase();
    if (lowered.endsWith("/api/chat")) {
        return ensureLeadingSlash(trimmed);
    }

    if (lowered.endsWith("/api")) {
        return `${ensureLeadingSlash(trimmed)}/chat`;
    }

    return ensureLeadingSlash(trimmed);
}

function buildOllamaTagsPath(chatPath) {
    const lowered = String(chatPath || "").toLowerCase();
    if (lowered.endsWith("/api/chat")) {
        return chatPath.replace(/\/api\/chat$/i, "/api/tags");
    }
    if (lowered.endsWith("/chat")) {
        return chatPath.replace(/\/chat$/i, "/tags");
    }
    return "/api/tags";
}

function buildOpenAIModelsPath(endpointPath) {
    const lowered = String(endpointPath || "").toLowerCase();
    if (lowered.endsWith("/chat/completions")) {
        return endpointPath.replace(/\/chat\/completions$/i, "/models");
    }
    if (lowered.endsWith("/completions")) {
        return endpointPath.replace(/\/completions$/i, "/models");
    }
    if (lowered.endsWith("/responses")) {
        return endpointPath.replace(/\/responses$/i, "/models");
    }
    return "/v1/models";
}

function matchesAny(pathname, matchers) {
    const checks = Array.isArray(matchers) ? matchers : [];
    for (const matcher of checks) {
        if (matcher instanceof RegExp && matcher.test(pathname)) {
            return true;
        }
        if (typeof matcher === "function" && matcher(pathname)) {
            return true;
        }
    }
    return false;
}

export function normalizeFixedHttpEndpoint(rawUrl, fallbackUrl, options = {}) {
    const normalized = parseHttpUrl(
        rawUrl,
        fallbackUrl,
        options.preferredProtocol || "https",
        options.errorPrefix || "",
    );
    if (!normalized.ok) {
        return normalized;
    }

    const parsed = normalized.parsed;
    const endpointPath = ensureLeadingSlash(
        trimPath(options.endpointPath || "") ||
            trimPath(parsed.pathname) ||
            "/",
    );
    const suffixOnVersionBase = String(options.suffixOnVersionBase || "");
    const endpointMatchers = options.endpointMatchers || [];

    const inputPath = trimPath(parsed.pathname);
    let resolvedPath;
    if (!inputPath) {
        resolvedPath = endpointPath;
    } else {
        const lowered = inputPath.toLowerCase();
        if (matchesAny(lowered, endpointMatchers)) {
            resolvedPath = ensureLeadingSlash(inputPath);
        } else if (suffixOnVersionBase && isVersionBasePath(lowered)) {
            resolvedPath = `${ensureLeadingSlash(inputPath)}${suffixOnVersionBase}`;
        } else {
            resolvedPath = ensureLeadingSlash(inputPath);
        }
    }

    parsed.pathname = resolvedPath;
    parsed.search = "";
    parsed.hash = "";

    return {
        ok: true,
        url: parsed.toString(),
    };
}

export function normalizeOpenAICompatEndpoint(rawUrl, fallbackUrl) {
    const normalized = parseHttpUrl(rawUrl, fallbackUrl, "https", "OpenAI ");
    if (!normalized.ok) {
        return normalized;
    }

    const parsed = normalized.parsed;
    parsed.pathname = buildOpenAIPath(parsed.pathname);
    parsed.search = "";
    parsed.hash = "";

    const modelsUrl = new URL(parsed.toString());
    if (parsed.host.includes("dashscope") && parsed.pathname.includes("/services/aigc/text-generation/generation")) {
        modelsUrl.pathname = "/compatible-mode/v1/models";
    } else {
        modelsUrl.pathname = buildOpenAIModelsPath(parsed.pathname);
    }

    return {
        ok: true,
        url: parsed.toString(),
        modelsUrl: modelsUrl.toString(),
    };
}

export function normalizeOllamaEndpoint(rawUrl, fallbackUrl) {
    const normalized = parseHttpUrl(rawUrl, fallbackUrl, "http", "Ollama ");
    if (!normalized.ok) {
        return normalized;
    }

    const parsed = normalized.parsed;
    parsed.pathname = buildOllamaPath(parsed.pathname);
    parsed.search = "";
    parsed.hash = "";

    const chatPath = parsed.pathname;
    const tagsPath = buildOllamaTagsPath(chatPath);

    const tagsUrl = new URL(parsed.toString());
    tagsUrl.pathname = tagsPath;

    return {
        ok: true,
        chatUrl: parsed.toString(),
        tagsUrl: tagsUrl.toString(),
    };
}
