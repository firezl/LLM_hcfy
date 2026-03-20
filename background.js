// background.js
// Service worker translation runtime: orchestrates translation work and streams back progress/results.

const PORT_NAME = "jyt-translate";
const MESSAGE_TYPE_START = "TRANSLATE_START";
const MESSAGE_TYPE_WEBLLM_PRELOAD = "WEBLLM_PRELOAD";
const MESSAGE_TYPE_WEBLLM_CLEAR_CACHE = "WEBLLM_CLEAR_CACHE";
const MESSAGE_TYPE_WEBLLM_GET_MODELS = "WEBLLM_GET_MODELS";
const MESSAGE_TYPE_TERM_UPSERT = "TERM_UPSERT";
const MESSAGE_TYPE_TERM_IMPORT = "TERM_IMPORT";
const MESSAGE_TYPE_TERM_EXPORT = "TERM_EXPORT";
const MESSAGE_TYPE_TERM_LIST = "TERM_LIST";
const MESSAGE_TYPE_TERM_DELETE = "TERM_DELETE";
const MESSAGE_TYPE_TERM_CLEAR = "TERM_CLEAR";
const RECOMMENDED_WEBLLM_MODELS = [
    "Qwen3-0.6B-q4f16_1-MLC",
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
];
const PDF_VIEWER_PATH = "vendor/pdfjs/web/viewer.html";
const DEFAULT_WEBLLM_MODEL = "Qwen3-0.6B-q4f16_1-MLC";
const WEBLLM_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const WEBLLM_IDLE_CHECK_INTERVAL_MS = 60 * 1000;
const HUGGINGFACE_BASE = "https://huggingface.co";
const GOOGLE_TRANSLATE_ENDPOINT =
    "https://translate.googleapis.com/translate_a/single";
const BING_TRANSLATOR_PAGE_URL = "https://www.bing.com/translator";
const BING_AUTH_TTL_MS = 10 * 60 * 1000;
const redirectingTabs = new Map();
const runtimeBaseUrl = chrome.runtime.getURL("");
const isFirefoxExtensionRuntime = runtimeBaseUrl.startsWith("moz-extension://");

const bingAuthCache = {
    key: "",
    token: "",
    ig: "",
    iid: "translator.5028",
    hostOrigin: "https://www.bing.com",
    expiresAt: 0,
};

let webllmEngine = null;
let webllmEngineModelId = "";
let webllmEngineMirrorBase = "";
let webllmEngineLoadingPromise = null;
let webllmEngineLoadingModelId = "";
let webllmLastUsedAt = 0;
const webllmAppConfigCache = new Map();
let webllmModulePromise = null;

async function getWebLLMModule() {
    if (!isWebLLMRuntimeSupported()) {
        throw new Error(
            "当前环境不支持 WebLLM（仅支持 Chrome/Edge 且需要 WebGPU）",
        );
    }

    if (!webllmModulePromise) {
        webllmModulePromise = import("./vendor/webllm/index.js");
    }

    return webllmModulePromise;
}

function isWebLLMRuntimeSupported() {
    if (isFirefoxExtensionRuntime) {
        return false;
    }
    return typeof navigator !== "undefined" && !!navigator.gpu;
}

function resolveWebLLMModelId(modelId, settings) {
    const preferred = (modelId || "").trim();
    if (preferred) {
        return preferred;
    }

    const selected = (settings?.webllm_model || "").trim();
    if (selected === "custom") {
        return (settings?.webllm_custom_model || "").trim();
    }

    return selected || DEFAULT_WEBLLM_MODEL;
}

function normalizeMirrorBase(url) {
    const raw = String(url || "").trim();
    if (!raw) return HUGGINGFACE_BASE;
    try {
        const parsed = new URL(raw);
        return `${parsed.protocol}//${parsed.host}`;
    } catch (err) {
        return HUGGINGFACE_BASE;
    }
}

function resolveWebLLMMirrorBase(settings) {
    const mirror = String(settings?.webllm_model_mirror || "official").trim();
    if (mirror === "hf-mirror") {
        return "https://hf-mirror.com";
    }
    if (mirror === "custom") {
        return normalizeMirrorBase(settings?.webllm_custom_mirror || "");
    }
    return HUGGINGFACE_BASE;
}

function remapModelRepoToMirror(modelRepoUrl, mirrorBase) {
    const raw = String(modelRepoUrl || "");
    if (!raw) return raw;
    const normalizedMirror = normalizeMirrorBase(mirrorBase);
    if (!raw.startsWith(`${HUGGINGFACE_BASE}/`)) {
        return raw;
    }
    return raw.replace(HUGGINGFACE_BASE, normalizedMirror);
}

async function buildMirrorAwareAppConfig(mirrorBase) {
    const normalizedMirror = normalizeMirrorBase(mirrorBase);
    if (webllmAppConfigCache.has(normalizedMirror)) {
        return webllmAppConfigCache.get(normalizedMirror);
    }

    const webllm = await getWebLLMModule();
    const source = webllm.prebuiltAppConfig || {};
    const modelList = Array.isArray(source.model_list) ? source.model_list : [];
    const mappedModelList = modelList.map((item) => ({
        ...item,
        model: remapModelRepoToMirror(item?.model, normalizedMirror),
    }));

    const appConfig = {
        ...source,
        model_list: mappedModelList,
    };
    webllmAppConfigCache.set(normalizedMirror, appConfig);
    return appConfig;
}

function postWebLLMProgress(port, state, requestId, report) {
    const progressValue = Number(report?.progress);
    const progress = Number.isFinite(progressValue)
        ? Math.round(progressValue * 100)
        : null;

    safePostMessage(port, state, {
        type: "WEBLLM_MODEL_PROGRESS",
        requestId,
        progress,
        text: report?.text || "模型加载中",
    });
}

async function unloadWebLLMModel(clearCache) {
    const loadedModelId = webllmEngineModelId;

    if (webllmEngine && typeof webllmEngine.unload === "function") {
        try {
            await webllmEngine.unload();
        } catch (err) {
            console.warn("Failed to unload webllm engine", err);
        }
    }

    webllmEngine = null;
    webllmEngineModelId = "";
    webllmEngineMirrorBase = "";
    webllmLastUsedAt = 0;

    if (clearCache && loadedModelId) {
        try {
            const webllm = await getWebLLMModule();
            await webllm.deleteModelAllInfoInCache(loadedModelId);
        } catch (err) {
            console.warn("Failed to clear webllm model cache", err);
        }
    }
}

async function maybeClearIdleWebLLMCache() {
    if (!webllmEngine || !webllmLastUsedAt) {
        return;
    }

    const now = Date.now();
    if (now - webllmLastUsedAt < WEBLLM_IDLE_TIMEOUT_MS) {
        return;
    }

    await unloadWebLLMModel(true);
}

setInterval(() => {
    void maybeClearIdleWebLLMCache();
}, WEBLLM_IDLE_CHECK_INTERVAL_MS);

async function ensureWebLLMEngine(modelId, mirrorBase, port, state, requestId) {
    if (
        webllmEngine &&
        webllmEngineModelId === modelId &&
        webllmEngineMirrorBase === normalizeMirrorBase(mirrorBase)
    ) {
        return webllmEngine;
    }

    if (
        webllmEngineLoadingPromise &&
        webllmEngineLoadingModelId &&
        webllmEngineLoadingModelId !== modelId
    ) {
        await webllmEngineLoadingPromise;
    }

    if (!webllmEngineLoadingPromise) {
        webllmEngineLoadingModelId = modelId;
        webllmEngineLoadingPromise = (async () => {
            if (webllmEngine && webllmEngineModelId !== modelId) {
                await unloadWebLLMModel(false);
            }

            if (
                webllmEngine &&
                webllmEngineModelId === modelId &&
                webllmEngineMirrorBase !== normalizeMirrorBase(mirrorBase)
            ) {
                await unloadWebLLMModel(false);
            }

            const webllm = await getWebLLMModule();
            const engine = await webllm.CreateMLCEngine(modelId, {
                appConfig: await buildMirrorAwareAppConfig(mirrorBase),
                initProgressCallback: (report) => {
                    postWebLLMProgress(port, state, requestId, report || {});
                },
            });

            webllmEngine = engine;
            webllmEngineModelId = modelId;
            webllmEngineMirrorBase = normalizeMirrorBase(mirrorBase);
            webllmLastUsedAt = Date.now();
            return engine;
        })();
    }

    try {
        return await webllmEngineLoadingPromise;
    } finally {
        webllmEngineLoadingPromise = null;
        webllmEngineLoadingModelId = "";
    }
}

function isInternalPdfViewerUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }
    return url.startsWith(chrome.runtime.getURL(PDF_VIEWER_PATH));
}

function isLikelyDirectPdfUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return false;
    }

    if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
        return false;
    }

    if (/\.pdf$/i.test(parsed.pathname)) {
        return true;
    }

    let decodedSearch = parsed.search || "";
    try {
        decodedSearch = decodeURIComponent(decodedSearch);
    } catch (err) {
        // keep raw search when decoding fails
    }
    if (/\.pdf(?:$|[&#?])/i.test(decodedSearch)) {
        return true;
    }

    return false;
}

function extractPdfUrlFromViewerParam(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return null;
    }

    const fileParam = parsed.searchParams.get("file");
    if (!fileParam) {
        return null;
    }

    let decoded = fileParam;
    try {
        decoded = decodeURIComponent(fileParam);
    } catch (err) {
        // keep raw value when decoding fails
    }

    if (isInternalPdfViewerUrl(decoded)) {
        return null;
    }

    if (isLikelyDirectPdfUrl(decoded)) {
        return decoded;
    }

    return null;
}

function resolvePdfSourceUrl(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    if (isInternalPdfViewerUrl(url)) {
        return null;
    }

    if (isLikelyDirectPdfUrl(url)) {
        return url;
    }

    return extractPdfUrlFromViewerParam(url);
}

function toInternalPdfViewerUrl(pdfUrl) {
    return chrome.runtime.getURL(
        `${PDF_VIEWER_PATH}?file=${encodeURIComponent(pdfUrl)}`,
    );
}

function isFileProtocolUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }
    try {
        return new URL(url).protocol === "file:";
    } catch (err) {
        return false;
    }
}

async function safeUpdateTabUrl(tabId, targetUrl) {
    if (!Number.isInteger(tabId) || tabId < 0 || !targetUrl) {
        return;
    }

    try {
        const maybePromise = chrome.tabs.update(tabId, { url: targetUrl });
        if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
        }
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (/Invalid tab ID/i.test(message)) {
            return;
        }
        console.warn("Failed to update tab URL", { tabId, targetUrl, err });
    }
}

function detectLangByHeuristic(text) {
    const zh = /[\u4e00-\u9fff]/;
    return zh.test(text) ? "zh" : "en";
}

function resolveLanguagePair(request) {
    const sourceSetting = request?.settings?.source_lang || "auto";
    const targetSetting = request?.settings?.target_lang || "auto";

    const from =
        sourceSetting !== "auto"
            ? sourceSetting
            : request.from ||
              request.preferredFrom ||
              detectLangByHeuristic(request.text || "");

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

function getLanguageDisplayName(lang) {
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

function normalizeGlossaryLang(lang) {
    const value = String(lang || "")
        .trim()
        .toLowerCase();
    if (!value || value === "auto") return "";
    return value.split("-")[0];
}

function normalizeGlossaryText(value) {
    return String(value || "").trim();
}

function glossaryKeyOf(term) {
    return `${normalizeGlossaryLang(term?.sourceLang)}::${normalizeGlossaryLang(term?.targetLang)}::${normalizeGlossaryText(term?.sourceTerm).toLowerCase()}`;
}

function sanitizeGlossaryTerm(raw, nowTs) {
    const sourceLang = normalizeGlossaryLang(raw?.sourceLang);
    const targetLang = normalizeGlossaryLang(raw?.targetLang);
    const sourceTerm = normalizeGlossaryText(raw?.sourceTerm);
    const targetTerm = normalizeGlossaryText(raw?.targetTerm);
    if (!sourceLang || !targetLang || !sourceTerm || !targetTerm) {
        return null;
    }

    const now = Number(nowTs) || Date.now();
    return {
        sourceLang,
        targetLang,
        sourceTerm,
        targetTerm,
        createdAt: Number(raw?.createdAt) || now,
        updatedAt: Number(raw?.updatedAt) || now,
    };
}

function getGlossaryTermsFromStorage() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({ glossary_terms: [] }, (items) => {
            const arr = Array.isArray(items?.glossary_terms)
                ? items.glossary_terms
                : [];
            resolve(arr);
        });
    });
}

function setGlossaryTermsToStorage(terms) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ glossary_terms: terms }, () => {
            if (chrome.runtime.lastError) {
                reject(
                    new Error(
                        chrome.runtime.lastError.message || "术语写入失败",
                    ),
                );
                return;
            }
            resolve();
        });
    });
}

async function listGlossaryTerms() {
    const raw = await getGlossaryTermsFromStorage();
    const map = new Map();
    const now = Date.now();
    for (const item of raw) {
        const term = sanitizeGlossaryTerm(item, now);
        if (!term) continue;
        map.set(glossaryKeyOf(term), term);
    }
    return Array.from(map.values());
}

async function upsertGlossaryTerm(termInput) {
    const now = Date.now();
    const normalized = sanitizeGlossaryTerm(termInput, now);
    if (!normalized) {
        throw new Error("术语字段不完整");
    }

    const existing = await listGlossaryTerms();
    const key = glossaryKeyOf(normalized);
    const map = new Map(existing.map((item) => [glossaryKeyOf(item), item]));
    const prev = map.get(key);
    if (prev) {
        normalized.createdAt = prev.createdAt;
        normalized.updatedAt = now;
    }
    map.set(key, normalized);

    await setGlossaryTermsToStorage(Array.from(map.values()));
    return normalized;
}

async function deleteGlossaryTerm(termInput) {
    const existing = await listGlossaryTerms();
    const key = glossaryKeyOf(termInput || {});
    if (!key || key.startsWith("::")) {
        throw new Error("术语删除参数不完整");
    }

    const next = existing.filter((item) => glossaryKeyOf(item) !== key);
    await setGlossaryTermsToStorage(next);
}

async function clearGlossaryTerms() {
    await setGlossaryTermsToStorage([]);
}

async function importGlossaryTerms(rawTerms) {
    const incoming = Array.isArray(rawTerms) ? rawTerms : [];
    const now = Date.now();
    const current = await listGlossaryTerms();
    const map = new Map(current.map((item) => [glossaryKeyOf(item), item]));

    let created = 0;
    let replaced = 0;
    for (const raw of incoming) {
        const term = sanitizeGlossaryTerm(raw, now);
        if (!term) continue;
        const key = glossaryKeyOf(term);
        if (map.has(key)) {
            replaced += 1;
            term.createdAt = map.get(key).createdAt;
            term.updatedAt = now;
        } else {
            created += 1;
        }
        map.set(key, term);
    }

    const next = Array.from(map.values());
    await setGlossaryTermsToStorage(next);
    return { created, replaced, total: next.length };
}

function buildGlossaryConstraint(glossaryTerms) {
    if (!Array.isArray(glossaryTerms) || glossaryTerms.length === 0) {
        return "";
    }
    const lines = [];
    for (const term of glossaryTerms) {
        const source = normalizeGlossaryText(term?.sourceTerm);
        const target = normalizeGlossaryText(term?.targetTerm);
        if (!source || !target) continue;
        lines.push(`- ${source} => ${target}`);
    }
    if (lines.length === 0) return "";
    return `\n术语约束（若原文命中，请优先使用以下术语翻译）：\n${lines.join("\n")}`;
}

async function getMatchedGlossaryTermsForRequest(message) {
    if (message?.settings?.glossary_enabled === false) {
        return [];
    }

    const text = normalizeGlossaryText(message?.text);
    const from = normalizeGlossaryLang(message?.preferredFrom || message?.from);
    const to = normalizeGlossaryLang(message?.preferredTo || message?.to);
    if (!text || !from || !to) {
        return [];
    }

    const terms = await listGlossaryTerms();
    const matched = [];
    const lowerText = text.toLowerCase();
    for (const term of terms) {
        if (term.sourceLang !== from || term.targetLang !== to) {
            continue;
        }
        if (!lowerText.includes(String(term.sourceTerm || "").toLowerCase())) {
            continue;
        }
        matched.push(term);
        if (matched.length >= 20) {
            break;
        }
    }

    return matched;
}

function buildPrompt(text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const glossaryBlock = buildGlossaryConstraint(options?.glossaryTerms);
    return `请把这段文字翻译为${targetLang}，不要有多余的输出。${glossaryBlock}\n输入:\n${text}`;
}

function buildWebLLMPrompt(text, to, options) {
    const targetLang = getLanguageDisplayName(to);
    const glossaryBlock = buildGlossaryConstraint(options?.glossaryTerms);
    return `请把以下文本翻译为${targetLang}，不要有多余的输出。${glossaryBlock}\n输入:\n${text}`;
}

function safePostMessage(port, state, payload) {
    if (!state.connected) {
        return false;
    }
    try {
        port.postMessage(payload);
        return true;
    } catch (err) {
        state.connected = false;
        return false;
    }
}

function postTranslateError(port, state, requestId, error) {
    safePostMessage(port, state, {
        type: "TRANSLATE_ERROR",
        requestId,
        error,
    });
}

function parseOpenAIStreamLine(line) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) {
        return null;
    }

    const payload = trimmed.substring(5).trim();
    if (!payload || payload === "[DONE]") {
        return null;
    }

    try {
        const json = JSON.parse(payload);
        return json.choices?.[0]?.delta || null;
    } catch (err) {
        console.error("Error parsing stream data", err);
        return null;
    }
}

function normalizeBingLanguage(lang) {
    const normalized = String(lang || "").toLowerCase();
    if (!normalized) return "auto-detect";
    if (normalized === "auto") return "auto-detect";
    if (normalized === "zh") return "zh-Hans";
    if (normalized === "zh-cn") return "zh-Hans";
    if (normalized === "zh-tw" || normalized === "zh-hant") return "zh-Hant";
    return normalized;
}

function extractBingAuthTokens(html) {
    const page = String(html || "");
    const igMatch = page.match(/IG:\"([^\"]+)\"/i);
    const iidMatch = page.match(/data-iid=\"([^\"]+)\"/i);
    const helperMatch = page.match(
        /params_AbusePreventionHelper\s*=\s*\[([^\]]+)\]/i,
    );

    if (!igMatch || !helperMatch) {
        throw new Error("无法解析 Bing 翻译授权参数");
    }

    const helperRaw = helperMatch[1];
    const pairMatch = helperRaw.match(/("([^\"]+)"|\d+)\s*,\s*"([^\"]+)"/);
    if (!pairMatch) {
        throw new Error("Bing 授权参数格式异常");
    }

    const key = String((pairMatch[2] || pairMatch[1] || "").replace(/\"/g, ""));
    const token = String(pairMatch[3] || "");
    const ig = String(igMatch[1] || "");
    const iid = String(iidMatch?.[1] || "translator.5028");

    if (!key || !token || !ig) {
        throw new Error("Bing 授权参数不完整");
    }

    return { key, token, ig, iid };
}

async function ensureBingAuth(forceRefresh) {
    if (
        !forceRefresh &&
        bingAuthCache.key &&
        bingAuthCache.token &&
        bingAuthCache.ig &&
        Date.now() < bingAuthCache.expiresAt
    ) {
        return { ...bingAuthCache };
    }

    const pageRes = await fetch(BING_TRANSLATOR_PAGE_URL, {
        method: "GET",
        cache: "no-store",
    });
    if (!pageRes.ok) {
        throw new Error(`请求 Bing 页面失败: HTTP ${pageRes.status}`);
    }

    const html = await pageRes.text();
    const tokens = extractBingAuthTokens(html);
    let hostOrigin = "https://www.bing.com";
    try {
        hostOrigin = new URL(pageRes.url || BING_TRANSLATOR_PAGE_URL).origin;
    } catch (err) {
        // keep default host origin
    }

    bingAuthCache.key = tokens.key;
    bingAuthCache.token = tokens.token;
    bingAuthCache.ig = tokens.ig;
    bingAuthCache.iid = tokens.iid;
    bingAuthCache.hostOrigin = hostOrigin;
    bingAuthCache.expiresAt = Date.now() + BING_AUTH_TTL_MS;

    return { ...bingAuthCache };
}

function postTranslateTextResult(port, state, requestId, text) {
    safePostMessage(port, state, {
        type: "TRANSLATE_CHUNK",
        requestId,
        content: String(text || ""),
    });
    safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
}

async function streamGoogleTranslate(request, port, state) {
    const { requestId, text } = request;
    const { from, to } = resolveLanguagePair(request);
    const params = new URLSearchParams({
        client: "gtx",
        sl: from || "auto",
        tl: to,
        dt: "t",
        q: String(text || ""),
    });

    try {
        const res = await fetch(
            `${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`,
            {
                method: "GET",
            },
        );
        if (!res.ok) {
            throw new Error(`Google 翻译请求失败: HTTP ${res.status}`);
        }

        const data = await res.json();
        const segments = Array.isArray(data?.[0]) ? data[0] : [];
        const translated = segments
            .map((item) => (Array.isArray(item) ? item[0] : ""))
            .join("")
            .trim();

        if (!translated) {
            throw new Error("Google 翻译返回为空");
        }

        postTranslateTextResult(port, state, requestId, translated);
    } catch (err) {
        postTranslateError(
            port,
            state,
            requestId,
            err && err.message ? err.message : String(err),
        );
    }
}

async function requestBingTranslate(from, to, text, forceAuthRefresh) {
    const auth = await ensureBingAuth(!!forceAuthRefresh);
    const endpoint = new URL("/ttranslatev3", auth.hostOrigin);
    endpoint.searchParams.set("isVertical", "1");
    endpoint.searchParams.set("IG", auth.ig);
    endpoint.searchParams.set("IID", auth.iid);

    const body = new URLSearchParams({
        text: String(text || ""),
        fromLang: normalizeBingLanguage(from),
        to: normalizeBingLanguage(to),
        token: auth.token,
        key: auth.key,
    });

    const res = await fetch(endpoint.toString(), {
        method: "POST",
        headers: {
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
        },
        body: body.toString(),
    });

    if (!res.ok) {
        throw new Error(`Bing 翻译请求失败: HTTP ${res.status}`);
    }

    const raw = await res.text();
    if (!raw || !raw.trim()) {
        throw new Error("Bing 翻译返回空响应");
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        const snippet = raw.slice(0, 120).replace(/\s+/g, " ");
        throw new Error(`Bing 返回非 JSON 响应: ${snippet}`);
    }

    const translated = Array.isArray(data)
        ? data
              .map((item) => item?.translations?.[0]?.text || "")
              .join("\n")
              .trim()
        : "";

    if (!translated) {
        throw new Error("Bing 翻译返回为空");
    }

    return translated;
}

async function streamBingTranslate(request, port, state) {
    const { requestId, text } = request;
    const { from, to } = resolveLanguagePair(request);

    try {
        let translated = "";
        try {
            translated = await requestBingTranslate(from, to, text, false);
        } catch (firstErr) {
            translated = await requestBingTranslate(from, to, text, true);
        }

        postTranslateTextResult(port, state, requestId, translated);
    } catch (err) {
        postTranslateError(
            port,
            state,
            requestId,
            err && err.message ? err.message : String(err),
        );
    }
}

async function streamOpenAITranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];
    const apiUrl = settings.openai_api_url;
    const key = settings.openai_api_key;

    if (!apiUrl || !key) {
        postTranslateError(
            port,
            state,
            requestId,
            "请在设置中配置 OpenAI API 地址与 Key",
        );
        return;
    }

    const isThinking = !!settings.show_thoughts;
    const model = isThinking
        ? settings.openai_thinking_model || "gpt-5-thinking"
        : settings.openai_model || "gpt-4o-mini";

    const body = {
        model,
        messages: [
            {
                role: "user",
                content: buildPrompt(text, to, { glossaryTerms }),
            },
        ],
        temperature: 0.2,
        stream: true,
    };

    const controller = new AbortController();
    state.controllers.set(requestId, controller);

    try {
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        if (!res.ok) {
            const textErr = await res.text();
            postTranslateError(
                port,
                state,
                requestId,
                "OpenAI 请求失败: " + textErr,
            );
            return;
        }

        if (!res.body) {
            postTranslateError(port, state, requestId, "响应不包含可读流");
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let carry = "";

        while (!done) {
            const { value, done: streamDone } = await reader.read();
            done = streamDone;
            if (!value) {
                continue;
            }

            carry += decoder.decode(value, { stream: true });
            const lines = carry.split("\n");
            carry = lines.pop() || "";

            for (const line of lines) {
                const delta = parseOpenAIStreamLine(line);
                if (!delta) {
                    continue;
                }

                if (delta.content) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_CHUNK",
                        requestId,
                        content: delta.content,
                    });
                    if (!ok) {
                        return;
                    }
                }

                if (delta.reasoning_content) {
                    const ok = safePostMessage(port, state, {
                        type: "TRANSLATE_THOUGHT",
                        requestId,
                        content: delta.reasoning_content,
                    });
                    if (!ok) {
                        return;
                    }
                }
            }
        }

        safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
    } catch (err) {
        const aborted = err && err.name === "AbortError";
        if (!aborted && state.connected) {
            postTranslateError(
                port,
                state,
                requestId,
                err && err.message ? err.message : String(err),
            );
        }
    } finally {
        state.controllers.delete(requestId);
    }
}

async function streamWebLLMTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
    const glossaryTerms = Array.isArray(request?.glossaryTerms)
        ? request.glossaryTerms
        : [];
    const modelId = resolveWebLLMModelId("", settings);
    const mirrorBase = resolveWebLLMMirrorBase(settings);
    const enableThinking = !!settings?.webllm_show_thoughts;
    const isQwen3Model = /^qwen3/i.test(modelId || "");

    if (!isWebLLMRuntimeSupported()) {
        postTranslateError(
            port,
            state,
            requestId,
            "当前环境不支持 WebLLM（仅支持 Chrome/Edge 且需要 WebGPU）",
        );
        return;
    }

    if (!modelId) {
        postTranslateError(
            port,
            state,
            requestId,
            "请先在设置中选择 WebLLM 模型",
        );
        return;
    }

    try {
        const engine = await ensureWebLLMEngine(
            modelId,
            mirrorBase,
            port,
            state,
            requestId,
        );
        webllmLastUsedAt = Date.now();

        const completionRequest = {
            stream: true,
            temperature: 0.2,
            messages: [
                {
                    role: "user",
                    content: buildWebLLMPrompt(text, to, { glossaryTerms }),
                },
            ],
        };

        if (isQwen3Model) {
            completionRequest.extra_body = {
                enable_thinking: enableThinking,
            };
        }

        const stream = await engine.chat.completions.create(completionRequest);

        for await (const chunk of stream) {
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (!delta) {
                continue;
            }
            webllmLastUsedAt = Date.now();
            const ok = safePostMessage(port, state, {
                type: "TRANSLATE_CHUNK",
                requestId,
                content: delta,
            });
            if (!ok) {
                return;
            }
        }

        safePostMessage(port, state, { type: "TRANSLATE_DONE", requestId });
    } catch (err) {
        postTranslateError(
            port,
            state,
            requestId,
            err && err.message ? err.message : String(err),
        );
    }
}

async function handleWebLLMPreload(message, port, state) {
    const requestId = message?.requestId || `webllm-preload-${Date.now()}`;
    const modelId = resolveWebLLMModelId(
        message?.modelId || "",
        message?.settings,
    );
    const mirrorBase = resolveWebLLMMirrorBase(message?.settings);

    if (!isWebLLMRuntimeSupported()) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: "当前环境不支持 WebLLM（仅支持 Chrome/Edge 且需要 WebGPU）",
        });
        return;
    }

    if (!modelId) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: "未提供模型 ID",
        });
        return;
    }

    try {
        await ensureWebLLMEngine(modelId, mirrorBase, port, state, requestId);
        webllmLastUsedAt = Date.now();
        safePostMessage(port, state, {
            type: "WEBLLM_PRELOAD_DONE",
            requestId,
            modelId,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}

async function handleWebLLMClearCache(message, port, state) {
    const requestId = message?.requestId || `webllm-clear-${Date.now()}`;
    const targetModelId = resolveWebLLMModelId(
        message?.modelId || "",
        message?.settings,
    );

    try {
        if (webllmEngine && webllmEngineModelId === targetModelId) {
            await unloadWebLLMModel(true);
        } else if (targetModelId) {
            const webllm = await getWebLLMModule();
            await webllm.deleteModelAllInfoInCache(targetModelId);
        }

        safePostMessage(port, state, {
            type: "WEBLLM_CLEAR_DONE",
            requestId,
            modelId: targetModelId,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}

async function getWebLLMModelListPayload() {
    let modelList = [];
    try {
        const webllm = await getWebLLMModule();
        modelList = Array.isArray(webllm?.prebuiltAppConfig?.model_list)
            ? webllm.prebuiltAppConfig.model_list
            : [];
    } catch (err) {
        modelList = [];
    }

    const allIds = Array.from(
        new Set(
            modelList
                .map((item) => (item && item.model_id ? item.model_id : ""))
                .filter(Boolean),
        ),
    );

    const recommended = RECOMMENDED_WEBLLM_MODELS.filter((id) =>
        allIds.includes(id),
    );
    const others = allIds.filter((id) => !recommended.includes(id));

    return {
        modelIds: [...recommended, ...others],
        recommendedModelIds: RECOMMENDED_WEBLLM_MODELS,
    };
}

async function handleWebLLMGetModels(message, port, state) {
    const requestId = message?.requestId || `webllm-models-${Date.now()}`;
    try {
        const payload = await getWebLLMModelListPayload();
        safePostMessage(port, state, {
            type: "WEBLLM_MODELS_RESPONSE",
            requestId,
            ...payload,
        });
    } catch (err) {
        safePostMessage(port, state, {
            type: "WEBLLM_OP_ERROR",
            requestId,
            error: err && err.message ? err.message : String(err),
        });
    }
}

async function handleTranslateStart(message, port, state) {
    const engine = message?.settings?.engine || "auto";
    const glossaryTerms = await getMatchedGlossaryTermsForRequest(message);
    const requestWithGlossary = {
        ...message,
        glossaryTerms,
    };

    if (engine === "browser") {
        postTranslateError(
            port,
            state,
            message.requestId,
            "浏览器 Translation API 不支持在扩展 service worker 中运行，请使用 auto 或 openai",
        );
        return;
    }

    if (engine === "webllm") {
        await streamWebLLMTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "google") {
        await streamGoogleTranslate(requestWithGlossary, port, state);
        return;
    }

    if (engine === "bing") {
        await streamBingTranslate(requestWithGlossary, port, state);
        return;
    }

    await streamOpenAITranslate(requestWithGlossary, port, state);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = String(message?.type || "");
    const isTermMessage =
        type === MESSAGE_TYPE_TERM_UPSERT ||
        type === MESSAGE_TYPE_TERM_IMPORT ||
        type === MESSAGE_TYPE_TERM_EXPORT ||
        type === MESSAGE_TYPE_TERM_LIST ||
        type === MESSAGE_TYPE_TERM_DELETE ||
        type === MESSAGE_TYPE_TERM_CLEAR;

    if (!isTermMessage) {
        return false;
    }

    (async () => {
        if (type === MESSAGE_TYPE_TERM_UPSERT) {
            const term = await upsertGlossaryTerm(message?.term || {});
            return { ok: true, term };
        }

        if (type === MESSAGE_TYPE_TERM_IMPORT) {
            const summary = await importGlossaryTerms(message?.terms || []);
            return { ok: true, ...summary };
        }

        if (type === MESSAGE_TYPE_TERM_EXPORT) {
            const terms = await listGlossaryTerms();
            return {
                ok: true,
                payload: {
                    glossary_version: 1,
                    glossary_terms: terms,
                    exported_at: new Date().toISOString(),
                },
            };
        }

        if (type === MESSAGE_TYPE_TERM_LIST) {
            const terms = await listGlossaryTerms();
            return { ok: true, terms };
        }

        if (type === MESSAGE_TYPE_TERM_DELETE) {
            await deleteGlossaryTerm(message?.term || {});
            return { ok: true };
        }

        if (type === MESSAGE_TYPE_TERM_CLEAR) {
            await clearGlossaryTerms();
            return { ok: true };
        }

        return { ok: false, error: "不支持的术语消息类型" };
    })()
        .then((result) => sendResponse(result))
        .catch((err) => {
            sendResponse({
                ok: false,
                error: err && err.message ? err.message : String(err),
            });
        });

    return true;
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) {
        return;
    }

    const state = {
        connected: true,
        controllers: new Map(),
    };

    port.onDisconnect.addListener(() => {
        state.connected = false;
        for (const controller of state.controllers.values()) {
            controller.abort();
        }
        state.controllers.clear();
    });

    port.onMessage.addListener((message) => {
        if (!message || !message.type) {
            return;
        }

        if (message.type === MESSAGE_TYPE_START) {
            void handleTranslateStart(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_PRELOAD) {
            void handleWebLLMPreload(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_CLEAR_CACHE) {
            void handleWebLLMClearCache(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_GET_MODELS) {
            void handleWebLLMGetModels(message, port, state);
        }
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const nextUrl = changeInfo?.url;
    if (!nextUrl || typeof nextUrl !== "string") {
        return;
    }

    if (isInternalPdfViewerUrl(nextUrl)) {
        redirectingTabs.delete(tabId);
        return;
    }

    const pdfSourceUrl = resolvePdfSourceUrl(nextUrl);
    if (!pdfSourceUrl) {
        return;
    }

    if (isFirefoxExtensionRuntime && isFileProtocolUrl(pdfSourceUrl)) {
        return;
    }

    const targetUrl = toInternalPdfViewerUrl(pdfSourceUrl);
    if (nextUrl === targetUrl) {
        return;
    }

    const lastTargetUrl = redirectingTabs.get(tabId);
    if (lastTargetUrl === targetUrl) {
        return;
    }

    redirectingTabs.set(tabId, targetUrl);
    void safeUpdateTabUrl(tabId, targetUrl);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    redirectingTabs.delete(tabId);
});
