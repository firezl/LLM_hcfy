// options.js
document.addEventListener("DOMContentLoaded", () => {
    const shared = globalThis.JYT_SHARED || {};
    const MESSAGE_TYPES = shared.MESSAGE_TYPES || {};
    const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS || {
        enabled: "on",
        engine: "auto",
        translate_shortcut: "",
        source_lang: "auto",
        target_lang: "auto",
        openai_api_url: "",
        openai_api_key: "",
        openai_model: "gpt-4o-mini",
        openai_thinking_model: "gpt-5-thinking",
        show_thoughts: false,
        webllm_model: "Qwen3-0.6B-q4f16_1-MLC",
        webllm_custom_model: "",
        webllm_show_thoughts: false,
        webllm_model_mirror: "official",
        webllm_custom_mirror: "",
        theme_mode: "auto",
        font_family: "",
        bubble_width_percent: 20,
        bubble_height_percent: 40,
        glossary_enabled: true,
        glossary_terms: [],
        glossary_version: 1,
    };
    const runtimeBaseUrl = chrome.runtime.getURL("");
    const isFirefoxRuntime = runtimeBaseUrl.startsWith("moz-extension://");
    const isWebLLMSupportedBrowser = !isFirefoxRuntime;
    const WEBLLM_WEAK_MEMORY_GB = 4;
    const WEBLLM_WEAK_CPU_CORES = 4;
    const RECOMMENDED_WEBLLM_MODELS = shared.RECOMMENDED_WEBLLM_MODELS || [
        "Qwen3-0.6B-q4f16_1-MLC",
        "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    ];

    const ids = [
        "enable_select",
        "engine_select",
        "translate_shortcut",
        "source_lang",
        "target_lang",
        "openai_api_url",
        "openai_api_key",
        "openai_model",
        "openai_thinking_model",
        "show_thoughts",
        "webllm_model_select",
        "webllm_custom_model",
        "webllm_show_thoughts",
        "webllm_model_mirror",
        "webllm_custom_mirror",
        "theme_mode",
        "font_family",
        "bubble_width_percent",
        "bubble_height_percent",
    ];
    const els = {};
    ids.forEach((id) => (els[id] = document.getElementById(id)));
    const openaiSection = document.getElementById("openai_section");
    const webllmSection = document.getElementById("webllm_section");
    const webllmPerformanceNote = document.getElementById(
        "webllm_performance_note",
    );
    const webllmStatusEl = document.getElementById("webllm_status");
    const webllmDownloadBtn = document.getElementById("webllm_download");
    const webllmClearCacheBtn = document.getElementById("webllm_clear_cache");
    const openLocalPdfBtn = document.getElementById("open_local_pdf");
    const currentPdfStatusEl = document.getElementById("current_pdf_status");
    const glossaryExportBtn = document.getElementById("glossary_export");
    const glossaryImportBtn = document.getElementById("glossary_import");
    const glossaryImportFileInput = document.getElementById(
        "glossary_import_file",
    );
    const glossaryStatusEl = document.getElementById("glossary_status");
    const glossaryListEl = document.getElementById("glossary_list");
    const glossarySaveBtn = document.getElementById("glossary_save");
    const glossaryCancelEditBtn = document.getElementById(
        "glossary_cancel_edit",
    );
    const glossaryClearBtn = document.getElementById("glossary_clear");
    const glossarySourceLangEl = document.getElementById(
        "glossary_source_lang",
    );
    const glossaryTargetLangEl = document.getElementById(
        "glossary_target_lang",
    );
    const glossarySourceTermEl = document.getElementById(
        "glossary_source_term",
    );
    const glossaryTargetTermEl = document.getElementById(
        "glossary_target_term",
    );

    let cachedActiveTab = null;
    let cachedCurrentPdfUrl = "";
    let webllmPort = null;
    let webllmPerfProfile = null;
    const webllmModelRequestResolvers = new Map();
    let glossaryTermsCache = [];
    let glossaryEditingOriginal = null;

    function isRunningInPopup() {
        try {
            const extensionApi = chrome.extension;
            if (!extensionApi || typeof extensionApi.getViews !== "function") {
                return false;
            }
            const popupViews = extensionApi.getViews({ type: "popup" }) || [];
            return popupViews.includes(window);
        } catch (err) {
            return false;
        }
    }

    function openImportInNewTab() {
        return new Promise((resolve, reject) => {
            try {
                const url = chrome.runtime.getURL(
                    "options.html#glossary-import",
                );
                const maybePromise = chrome.tabs.create({ url });
                if (maybePromise && typeof maybePromise.then === "function") {
                    maybePromise.then(() => resolve()).catch(reject);
                    return;
                }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    function normalizeGlossaryLang(lang) {
        const value = String(lang || "")
            .trim()
            .toLowerCase();
        if (!value || value === "auto") return "";
        return value.split("-")[0];
    }

    function normalizeGlossaryTermText(text) {
        return String(text || "").trim();
    }

    function glossaryTermKey(term) {
        const sourceLang = normalizeGlossaryLang(term?.sourceLang);
        const targetLang = normalizeGlossaryLang(term?.targetLang);
        const sourceTerm = normalizeGlossaryTermText(
            term?.sourceTerm,
        ).toLowerCase();
        return `${sourceLang}::${targetLang}::${sourceTerm}`;
    }

    function setGlossaryStatus(text, isError) {
        if (!glossaryStatusEl) return;
        glossaryStatusEl.textContent = text || "";
        glossaryStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function getGlossaryFormTerm() {
        return {
            sourceLang: normalizeGlossaryLang(glossarySourceLangEl?.value),
            targetLang: normalizeGlossaryLang(glossaryTargetLangEl?.value),
            sourceTerm: normalizeGlossaryTermText(glossarySourceTermEl?.value),
            targetTerm: normalizeGlossaryTermText(glossaryTargetTermEl?.value),
        };
    }

    function resetGlossaryEditor() {
        glossaryEditingOriginal = null;
        if (glossarySourceLangEl) glossarySourceLangEl.value = "en";
        if (glossaryTargetLangEl) glossaryTargetLangEl.value = "zh";
        if (glossarySourceTermEl) glossarySourceTermEl.value = "";
        if (glossaryTargetTermEl) glossaryTargetTermEl.value = "";
        if (glossarySaveBtn) glossarySaveBtn.textContent = "新增术语";
    }

    function populateGlossaryEditor(term) {
        glossaryEditingOriginal = term || null;
        if (!term) {
            resetGlossaryEditor();
            return;
        }

        if (glossarySourceLangEl) glossarySourceLangEl.value = term.sourceLang;
        if (glossaryTargetLangEl) glossaryTargetLangEl.value = term.targetLang;
        if (glossarySourceTermEl) glossarySourceTermEl.value = term.sourceTerm;
        if (glossaryTargetTermEl) glossaryTargetTermEl.value = term.targetTerm;
        if (glossarySaveBtn) glossarySaveBtn.textContent = "更新术语";
    }

    function renderGlossaryList(terms) {
        if (!glossaryListEl) return;
        const list = Array.isArray(terms) ? terms : [];
        if (list.length === 0) {
            glossaryListEl.innerHTML =
                '<div class="jyt-glossary-empty">暂无术语，先添加一条吧。</div>';
            return;
        }

        const rows = list
            .map((term, index) => {
                const pair = `${term.sourceLang} -> ${term.targetLang}`;
                return `
                    <tr>
                        <td>${pair}</td>
                        <td>${term.sourceTerm}</td>
                        <td>${term.targetTerm}</td>
                        <td>
                            <button class="jyt-glossary-row-edit" data-index="${index}" type="button">编辑</button>
                            <button class="jyt-glossary-row-delete" data-index="${index}" type="button">删除</button>
                        </td>
                    </tr>
                `;
            })
            .join("");

        glossaryListEl.innerHTML = `
            <table class="jyt-glossary-table">
                <thead>
                    <tr>
                        <th>语言对</th>
                        <th>原文</th>
                        <th>目标</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    async function refreshGlossaryList() {
        const result = await sendTermMessage(
            MESSAGE_TYPES.TERM_LIST || "TERM_LIST",
        );
        if (!result?.ok) {
            throw new Error(result?.error || "术语列表获取失败");
        }

        const sorted = (Array.isArray(result.terms) ? result.terms : []).sort(
            (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0),
        );
        glossaryTermsCache = sorted;
        renderGlossaryList(sorted);
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("读取文件失败"));
            reader.readAsText(file, "utf-8");
        });
    }

    function sanitizeGlossaryTerms(rawTerms) {
        const input = Array.isArray(rawTerms) ? rawTerms : [];
        const map = new Map();

        for (const item of input) {
            const sourceTerm = normalizeGlossaryTermText(item?.sourceTerm);
            const targetTerm = normalizeGlossaryTermText(item?.targetTerm);
            const sourceLang = normalizeGlossaryLang(item?.sourceLang);
            const targetLang = normalizeGlossaryLang(item?.targetLang);
            if (!sourceTerm || !targetTerm || !sourceLang || !targetLang) {
                continue;
            }

            const now = Date.now();
            const normalized = {
                sourceTerm,
                targetTerm,
                sourceLang,
                targetLang,
                createdAt: Number(item?.createdAt) || now,
                updatedAt: Number(item?.updatedAt) || now,
            };
            map.set(glossaryTermKey(normalized), normalized);
        }

        return Array.from(map.values());
    }

    function sendTermMessage(type, payload) {
        const request = {
            type,
            ...(payload || {}),
        };

        if (
            typeof browser !== "undefined" &&
            browser.runtime &&
            typeof browser.runtime.sendMessage === "function"
        ) {
            return browser.runtime.sendMessage(request);
        }

        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(request, (resp) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        reject(new Error(err.message || "术语消息发送失败"));
                        return;
                    }
                    resolve(resp);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    function setWebLLMStatus(text, isError) {
        if (!webllmStatusEl) return;
        webllmStatusEl.textContent = text || "";
        webllmStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function setWebLLMButtonsEnabled(enabled) {
        if (webllmDownloadBtn) webllmDownloadBtn.disabled = !enabled;
        if (webllmClearCacheBtn) webllmClearCacheBtn.disabled = !enabled;
    }

    function populateWebLLMModelSelect(modelIds, selectedModel) {
        if (!els.webllm_model_select) return;

        const uniqueIds = Array.from(
            new Set((modelIds || []).map((id) => String(id || "").trim())),
        ).filter(Boolean);

        const recommended = RECOMMENDED_WEBLLM_MODELS.filter((id) =>
            uniqueIds.includes(id),
        );
        const others = uniqueIds.filter((id) => !recommended.includes(id));
        const orderedIds = [...recommended, ...others];

        els.webllm_model_select.innerHTML = "";
        orderedIds.forEach((id) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = RECOMMENDED_WEBLLM_MODELS.includes(id)
                ? `${id}（推荐）`
                : id;
            els.webllm_model_select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = "自定义模型 ID";
        els.webllm_model_select.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.webllm_model_select.value = selectedModel;
            els.webllm_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            els.webllm_model_select.value = "custom";
            if (!els.webllm_custom_model.value) {
                els.webllm_custom_model.value = selectedModel;
            }
            els.webllm_custom_model.disabled = false;
            return;
        }

        if (orderedIds.length > 0) {
            els.webllm_model_select.value = orderedIds[0];
            els.webllm_custom_model.disabled = true;
        }
    }

    async function requestWebLLMModelList() {
        return new Promise((resolve, reject) => {
            const requestId = `webllm-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                webllmModelRequestResolvers.delete(requestId);
                reject(new Error("请求模型列表超时"));
            }, 8000);

            webllmModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.WEBLLM_GET_MODELS || "WEBLLM_GET_MODELS",
                    requestId,
                });
            } catch (err) {
                clearTimeout(timer);
                webllmModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
    }

    function getSelectedWebLLMModelId() {
        const selected = (els.webllm_model_select?.value || "").trim();
        if (selected === "custom") {
            return (els.webllm_custom_model?.value || "").trim();
        }
        return selected;
    }

    function getSelectedWebLLMMirrorBase() {
        const selected = (els.webllm_model_mirror?.value || "official").trim();
        if (selected === "hf-mirror") {
            return "https://hf-mirror.com";
        }
        if (selected === "custom") {
            return (els.webllm_custom_mirror?.value || "").trim();
        }
        return "https://huggingface.co";
    }

    function ensureWebLLMPort() {
        if (webllmPort) return webllmPort;

        webllmPort = chrome.runtime.connect({ name: "jyt-translate" });
        webllmPort.onMessage.addListener((message) => {
            if (!message) return;

            if (message.type === "WEBLLM_MODEL_PROGRESS") {
                const percent = Number.isFinite(message.progress)
                    ? Math.max(0, Math.min(100, Math.round(message.progress)))
                    : null;
                const percentText = percent === null ? "" : ` (${percent}%)`;
                setWebLLMStatus(
                    `${message.text || "模型加载中"}${percentText}`,
                    false,
                );
                return;
            }

            if (message.type === "WEBLLM_PRELOAD_DONE") {
                setWebLLMStatus("模型已加载完成，可直接用于划词翻译", false);
                setWebLLMButtonsEnabled(true);
                return;
            }

            if (message.type === "WEBLLM_CLEAR_DONE") {
                setWebLLMStatus("模型缓存已清理", false);
                setWebLLMButtonsEnabled(true);
                return;
            }

            if (message.type === "WEBLLM_OP_ERROR") {
                setWebLLMStatus(
                    `操作失败: ${message.error || "未知错误"}`,
                    true,
                );
                setWebLLMButtonsEnabled(true);
                const resolvePending = webllmModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    webllmModelRequestResolvers.delete(message.requestId);
                    resolvePending({
                        modelIds: [],
                        recommendedModelIds: RECOMMENDED_WEBLLM_MODELS,
                    });
                }
                return;
            }

            if (message.type === "WEBLLM_MODELS_RESPONSE") {
                const resolvePending = webllmModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    webllmModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
            }
        });

        webllmPort.onDisconnect.addListener(() => {
            webllmPort = null;
            setWebLLMButtonsEnabled(true);
        });

        return webllmPort;
    }

    async function evaluateWebLLMPerformance() {
        const hasWebGPU = !!navigator.gpu;
        const memoryGB = Number(navigator.deviceMemory || 0);
        const cpuCores = Number(navigator.hardwareConcurrency || 0);
        const reasons = [];

        if (!hasWebGPU) {
            reasons.push("当前浏览器不可用 WebGPU");
        }
        if (memoryGB > 0 && memoryGB <= WEBLLM_WEAK_MEMORY_GB) {
            reasons.push(`设备内存约 ${memoryGB}GB`);
        }
        if (cpuCores > 0 && cpuCores <= WEBLLM_WEAK_CPU_CORES) {
            reasons.push(`CPU 逻辑核心数约 ${cpuCores}`);
        }

        return {
            hasWebGPU,
            memoryGB,
            cpuCores,
            isWeak: reasons.length > 0,
            reasons,
        };
    }

    function renderWebLLMPerformance(profile) {
        if (!webllmPerformanceNote) return;

        if (!isWebLLMSupportedBrowser) {
            webllmPerformanceNote.textContent =
                "当前浏览器不支持 WebLLM（仅 Chrome/Edge 可用）";
            webllmPerformanceNote.className = "jyt-perf-note jyt-perf-warning";
            return;
        }

        if (!profile || !profile.isWeak) {
            webllmPerformanceNote.textContent =
                "设备检测通过，可尝试使用本地模型翻译。";
            webllmPerformanceNote.className = "jyt-perf-note jyt-perf-ok";
            return;
        }

        webllmPerformanceNote.textContent =
            "设备性能偏弱，不建议开启 WebLLM: " +
            profile.reasons.join("；") +
            "。";
        webllmPerformanceNote.className = "jyt-perf-note jyt-perf-warning";
    }

    function clampPercent(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return fallback;
        }
        return Math.max(5, Math.min(95, Math.round(n)));
    }

    function normalizeShortcut(value) {
        const raw = (value || "").trim();
        return raw;
    }

    function normalizeKeyName(key) {
        const raw = String(key || "").trim();
        if (!raw) return "";

        const alias = {
            " ": "Space",
            Escape: "Esc",
            ArrowUp: "Up",
            ArrowDown: "Down",
            ArrowLeft: "Left",
            ArrowRight: "Right",
            "+": "Plus",
        };

        if (alias[raw]) {
            return alias[raw];
        }

        if (raw.length === 1) {
            return raw.toUpperCase();
        }

        return raw;
    }

    function formatShortcutFromEvent(e) {
        const keyName = normalizeKeyName(e.key);
        const modifierOnlyKeys = new Set(["Control", "Shift", "Alt", "Meta"]);
        if (!keyName || modifierOnlyKeys.has(e.key)) {
            return "";
        }

        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey) parts.push("Meta");
        parts.push(keyName);
        return parts.join("+");
    }

    function updateEngineDependentUI() {
        if (!openaiSection) return;
        const engine = els.engine_select.value;
        const hideOpenAI =
            engine === "browser" ||
            engine === "webllm" ||
            engine === "google" ||
            engine === "bing";
        openaiSection.classList.toggle("jyt-hidden", hideOpenAI);

        if (webllmSection) {
            const showWebLLM = engine === "webllm" && isWebLLMSupportedBrowser;
            webllmSection.classList.toggle("jyt-hidden", !showWebLLM);
        }
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        if (theme === "auto") {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches;
            root.setAttribute("data-theme", prefersDark ? "dark" : "light");
        } else {
            root.setAttribute("data-theme", theme);
        }
    }

    function isLikelyPdfUrl(url) {
        if (!url || typeof url !== "string") return false;

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
            // keep raw search
        }

        return /\.pdf(?:$|[&#?])/i.test(decodedSearch);
    }

    function extractPdfUrlFromTabUrl(tabUrl) {
        if (!tabUrl || typeof tabUrl !== "string") {
            return "";
        }

        if (isLikelyPdfUrl(tabUrl)) {
            return tabUrl;
        }

        let parsed;
        try {
            parsed = new URL(tabUrl);
        } catch (err) {
            return "";
        }

        const fileParam = parsed.searchParams.get("file");
        if (!fileParam) {
            return "";
        }

        let decoded = fileParam;
        try {
            decoded = decodeURIComponent(fileParam);
        } catch (err) {
            // keep raw value
        }

        return isLikelyPdfUrl(decoded) ? decoded : "";
    }

    function getDisplayNameFromPdfUrl(pdfUrl) {
        if (!pdfUrl) return "";
        try {
            const parsed = new URL(pdfUrl);
            const fromPath = (parsed.pathname || "").split("/").pop() || "";
            if (fromPath) return decodeURIComponent(fromPath);
        } catch (err) {
            // ignore
        }
        return pdfUrl;
    }

    function setOpenButtonLabel(label) {
        if (!openLocalPdfBtn) return;
        openLocalPdfBtn.textContent = label;
    }

    function updateCurrentPdfStatusUI(activeTab, currentPdfUrl) {
        if (!currentPdfStatusEl) return;

        if (currentPdfUrl) {
            const fileName = getDisplayNameFromPdfUrl(currentPdfUrl);
            const isFilePdf = currentPdfUrl.startsWith("file://");

            if (isFirefoxRuntime && isFilePdf) {
                setOpenButtonLabel("选择本地 PDF（Firefox）");
                currentPdfStatusEl.textContent = `已检测到当前 PDF：${fileName}。Firefox 无法让扩展直接读取 file://，点击后会打开文件选择器，请选择该文件。`;
                return;
            }

            setOpenButtonLabel("用 LLM 翻译器打开当前 PDF");
            currentPdfStatusEl.textContent = `已检测到当前 PDF：${fileName}`;
            return;
        }

        setOpenButtonLabel("打开本地 PDF（Firefox 兼容）");
        if (activeTab?.url) {
            currentPdfStatusEl.textContent =
                "当前标签页未检测到 PDF 链接。点击后将进入内置 PDF.js 页面并弹出文件选择器。";
        } else {
            currentPdfStatusEl.textContent =
                "未获取到当前标签页信息。点击后将进入内置 PDF.js 页面并弹出文件选择器。";
        }
    }

    function getCurrentActiveTab() {
        return new Promise((resolve) => {
            try {
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        resolve(
                            Array.isArray(tabs) && tabs[0] ? tabs[0] : null,
                        );
                    },
                );
            } catch (err) {
                resolve(null);
            }
        });
    }

    async function refreshActivePdfContext() {
        const activeTab = await getCurrentActiveTab();
        cachedActiveTab = activeTab;
        const activeTabUrl =
            activeTab && typeof activeTab.url === "string" ? activeTab.url : "";
        cachedCurrentPdfUrl = extractPdfUrlFromTabUrl(activeTabUrl);
        updateCurrentPdfStatusUI(activeTab, cachedCurrentPdfUrl);
    }

    function load() {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
            els.enable_select.value = items.enabled;
            els.engine_select.value = items.engine;
            els.translate_shortcut.value = normalizeShortcut(
                items.translate_shortcut,
            );
            els.source_lang.value = items.source_lang || "auto";
            els.target_lang.value = items.target_lang || "auto";
            els.openai_api_url.value = items.openai_api_url;
            els.openai_api_key.value = items.openai_api_key;
            els.openai_model.value = items.openai_model;
            els.openai_thinking_model.value = items.openai_thinking_model;
            els.show_thoughts.value = items.show_thoughts ? "true" : "false";
            const savedModel = items.webllm_model || "Qwen3-0.6B-q4f16_1-MLC";
            els.webllm_custom_model.value = items.webllm_custom_model || "";
            els.webllm_show_thoughts.value = items.webllm_show_thoughts
                ? "true"
                : "false";
            els.webllm_model_mirror.value =
                items.webllm_model_mirror || "official";
            els.webllm_custom_mirror.value = items.webllm_custom_mirror || "";
            els.webllm_custom_mirror.disabled =
                els.webllm_model_mirror.value !== "custom";
            populateWebLLMModelSelect(RECOMMENDED_WEBLLM_MODELS, savedModel);
            if (isWebLLMSupportedBrowser) {
                void requestWebLLMModelList()
                    .then((res) => {
                        const modelIds = Array.isArray(res.modelIds)
                            ? res.modelIds
                            : [];
                        if (modelIds.length > 0) {
                            populateWebLLMModelSelect(modelIds, savedModel);
                        }
                    })
                    .catch(() => {
                        // keep fallback options silently
                    });
            }
            els.theme_mode.value = items.theme_mode || "auto";
            els.font_family.value = items.font_family || "";
            els.bubble_width_percent.value = clampPercent(
                items.bubble_width_percent,
                20,
            );
            els.bubble_height_percent.value = clampPercent(
                items.bubble_height_percent,
                40,
            );
            updateEngineDependentUI();
            applyTheme(items.theme_mode || "auto");
        });
    }

    document.getElementById("save").addEventListener("click", () => {
        const data = {
            enabled: els.enable_select.value,
            engine: els.engine_select.value,
            translate_shortcut: normalizeShortcut(els.translate_shortcut.value),
            source_lang: els.source_lang.value,
            target_lang: els.target_lang.value,
            openai_api_url: els.openai_api_url.value,
            openai_api_key: els.openai_api_key.value,
            openai_model: els.openai_model.value,
            openai_thinking_model: els.openai_thinking_model.value,
            show_thoughts: els.show_thoughts.value === "true",
            webllm_model: els.webllm_model_select.value,
            webllm_custom_model: (els.webllm_custom_model.value || "").trim(),
            webllm_show_thoughts: els.webllm_show_thoughts.value === "true",
            webllm_model_mirror: els.webllm_model_mirror.value,
            webllm_custom_mirror: (els.webllm_custom_mirror.value || "").trim(),
            theme_mode: els.theme_mode.value,
            font_family: els.font_family.value,
            bubble_width_percent: clampPercent(
                els.bubble_width_percent.value,
                20,
            ),
            bubble_height_percent: clampPercent(
                els.bubble_height_percent.value,
                40,
            ),
        };
        if (data.engine === "webllm" && !isWebLLMSupportedBrowser) {
            alert("当前浏览器不支持 WebLLM，请切换到 Chrome/Edge。");
            return;
        }

        if (
            data.engine === "webllm" &&
            webllmPerfProfile &&
            webllmPerfProfile.isWeak
        ) {
            const ok = window.confirm(
                "设备性能偏弱，继续启用 WebLLM 可能导致卡顿或加载失败，确定继续吗？",
            );
            if (!ok) {
                return;
            }
        }

        chrome.storage.sync.set(data, () => {
            applyTheme(data.theme_mode);
            alert("已保存");
        });
    });

    document.getElementById("reset").addEventListener("click", () => {
        chrome.storage.sync.clear(() => {
            load();
            alert("已恢复默认");
        });
    });

    els.translate_shortcut.addEventListener("keydown", (e) => {
        const allowClear = e.key === "Backspace" || e.key === "Delete";
        if (allowClear) {
            e.preventDefault();
            els.translate_shortcut.value = "";
            return;
        }

        e.preventDefault();
        const shortcut = formatShortcutFromEvent(e);
        if (shortcut) {
            els.translate_shortcut.value = shortcut;
        }
    });

    els.translate_shortcut.addEventListener("blur", () => {
        els.translate_shortcut.value = normalizeShortcut(
            els.translate_shortcut.value,
        );
    });

    els.engine_select.addEventListener("change", updateEngineDependentUI);

    els.theme_mode.addEventListener("change", () => {
        applyTheme(els.theme_mode.value);
    });

    els.webllm_model_select?.addEventListener("change", () => {
        const isCustom = els.webllm_model_select.value === "custom";
        els.webllm_custom_model.disabled = !isCustom;
    });

    els.webllm_model_mirror?.addEventListener("change", () => {
        const isCustom = els.webllm_model_mirror.value === "custom";
        els.webllm_custom_mirror.disabled = !isCustom;
    });

    webllmDownloadBtn?.addEventListener("click", () => {
        if (!isWebLLMSupportedBrowser) {
            setWebLLMStatus("当前浏览器不支持 WebLLM", true);
            return;
        }

        const modelId = getSelectedWebLLMModelId();
        if (!modelId) {
            setWebLLMStatus("请先选择或输入模型 ID", true);
            return;
        }

        const requestId = `webllm-preload-${Date.now()}`;
        setWebLLMButtonsEnabled(false);
        setWebLLMStatus("开始下载/加载模型...", false);

        try {
            const port = ensureWebLLMPort();
            port.postMessage({
                type: MESSAGE_TYPES.WEBLLM_PRELOAD || "WEBLLM_PRELOAD",
                requestId,
                modelId,
                settings: {
                    webllm_model_mirror: els.webllm_model_mirror.value,
                    webllm_custom_mirror: (
                        els.webllm_custom_mirror.value || ""
                    ).trim(),
                },
            });
        } catch (err) {
            setWebLLMButtonsEnabled(true);
            setWebLLMStatus("无法连接后台服务，请重试", true);
        }
    });

    webllmClearCacheBtn?.addEventListener("click", () => {
        const modelId = getSelectedWebLLMModelId();
        if (!modelId) {
            setWebLLMStatus("请先选择或输入模型 ID", true);
            return;
        }

        const requestId = `webllm-clear-${Date.now()}`;
        setWebLLMButtonsEnabled(false);
        setWebLLMStatus("正在清理模型缓存...", false);

        try {
            const port = ensureWebLLMPort();
            port.postMessage({
                type: MESSAGE_TYPES.WEBLLM_CLEAR_CACHE || "WEBLLM_CLEAR_CACHE",
                requestId,
                modelId,
                settings: {
                    webllm_model_mirror: els.webllm_model_mirror.value,
                    webllm_custom_mirror: (
                        els.webllm_custom_mirror.value || ""
                    ).trim(),
                },
            });
        } catch (err) {
            setWebLLMButtonsEnabled(true);
            setWebLLMStatus("无法连接后台服务，请重试", true);
        }
    });

    openLocalPdfBtn?.addEventListener("click", async () => {
        const runtimeBaseUrl = chrome.runtime.getURL("");
        const isFirefoxRuntime = runtimeBaseUrl.startsWith("moz-extension://");

        const activeTab = cachedActiveTab || (await getCurrentActiveTab());
        const activeTabUrl =
            activeTab && typeof activeTab.url === "string" ? activeTab.url : "";
        const currentPdfUrl =
            cachedCurrentPdfUrl || extractPdfUrlFromTabUrl(activeTabUrl);

        let viewerUrl;
        if (currentPdfUrl) {
            const isFilePdf = currentPdfUrl.startsWith("file://");
            if (isFirefoxRuntime && isFilePdf) {
                viewerUrl = chrome.runtime.getURL(
                    "vendor/pdfjs/web/viewer.html?file=&openFilePicker=1",
                );
                alert(
                    "Firefox 安全策略不允许扩展直接读取 file:// 文件。将打开文件选择器，请选择当前 PDF。",
                );
            } else {
                viewerUrl = chrome.runtime.getURL(
                    `vendor/pdfjs/web/viewer.html?file=${encodeURIComponent(currentPdfUrl)}`,
                );
            }
        } else {
            viewerUrl = chrome.runtime.getURL(
                "vendor/pdfjs/web/viewer.html?file=&openFilePicker=1",
            );
        }

        try {
            const maybePromise = chrome.tabs.create({ url: viewerUrl });
            if (maybePromise && typeof maybePromise.then === "function") {
                await maybePromise;
            }
            window.close();
        } catch (err) {
            alert("打开内置 PDF 页面失败，请重试");
        }
    });

    glossaryExportBtn?.addEventListener("click", async () => {
        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_EXPORT || "TERM_EXPORT",
            );
            if (!result?.ok) {
                throw new Error(result?.error || "导出失败");
            }

            const payload = result.payload || {
                glossary_version: 1,
                glossary_terms: [],
                exported_at: new Date().toISOString(),
            };
            const terms = Array.isArray(payload.glossary_terms)
                ? payload.glossary_terms
                : [];

            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            a.href = url;
            a.download = `jyt-glossary-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            setGlossaryStatus(`导出完成，共 ${terms.length} 条术语`, false);
            await refreshGlossaryList();
        } catch (err) {
            setGlossaryStatus(
                `导出失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossaryImportBtn?.addEventListener("click", () => {
        if (!glossaryImportFileInput) return;

        if (isFirefoxRuntime && isRunningInPopup()) {
            void openImportInNewTab()
                .then(() => {
                    setGlossaryStatus(
                        "Firefox 弹窗模式下已在新标签页打开导入页面",
                        false,
                    );
                })
                .catch((err) => {
                    setGlossaryStatus(
                        `打开导入页面失败: ${err && err.message ? err.message : String(err)}`,
                        true,
                    );
                });
            return;
        }

        glossaryImportFileInput.value = "";
        glossaryImportFileInput.click();
    });

    glossaryImportFileInput?.addEventListener("change", async () => {
        const file = glossaryImportFileInput.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setGlossaryStatus("导入失败: 文件过大，请控制在 5MB 以内", true);
            return;
        }

        try {
            const content = await readFileAsText(file);
            const parsed = JSON.parse(content);
            const importedTerms = sanitizeGlossaryTerms(
                parsed?.glossary_terms || parsed,
            );

            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_IMPORT || "TERM_IMPORT",
                { terms: importedTerms },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "导入失败");
            }

            setGlossaryStatus(
                `导入完成: 新增 ${result.created || 0}，覆盖 ${result.replaced || 0}，总计 ${result.total || 0}`,
                false,
            );
            await refreshGlossaryList();
            resetGlossaryEditor();
        } catch (err) {
            setGlossaryStatus(
                `导入失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossarySaveBtn?.addEventListener("click", async () => {
        const term = getGlossaryFormTerm();
        if (
            !term.sourceLang ||
            !term.targetLang ||
            !term.sourceTerm ||
            !term.targetTerm
        ) {
            setGlossaryStatus("保存失败: 请完整填写术语字段", true);
            return;
        }

        try {
            const nextKey = glossaryTermKey(term);
            const prevKey = glossaryEditingOriginal
                ? glossaryTermKey(glossaryEditingOriginal)
                : "";

            if (glossaryEditingOriginal && prevKey && prevKey !== nextKey) {
                const delRes = await sendTermMessage(
                    MESSAGE_TYPES.TERM_DELETE || "TERM_DELETE",
                    { term: glossaryEditingOriginal },
                );
                if (!delRes?.ok) {
                    throw new Error(delRes?.error || "旧术语删除失败");
                }
            }

            const saveRes = await sendTermMessage(
                MESSAGE_TYPES.TERM_UPSERT || "TERM_UPSERT",
                { term },
            );
            if (!saveRes?.ok) {
                throw new Error(saveRes?.error || "术语保存失败");
            }

            setGlossaryStatus("术语已保存", false);
            await refreshGlossaryList();
            resetGlossaryEditor();
        } catch (err) {
            setGlossaryStatus(
                `保存失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossaryCancelEditBtn?.addEventListener("click", () => {
        resetGlossaryEditor();
        setGlossaryStatus("", false);
    });

    glossaryClearBtn?.addEventListener("click", async () => {
        const ok = window.confirm("确定清空术语库吗？该操作不可撤销。");
        if (!ok) return;

        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_CLEAR || "TERM_CLEAR",
            );
            if (!result?.ok) {
                throw new Error(result?.error || "清空失败");
            }
            await refreshGlossaryList();
            resetGlossaryEditor();
            setGlossaryStatus("术语库已清空", false);
        } catch (err) {
            setGlossaryStatus(
                `清空失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossaryListEl?.addEventListener("click", async (e) => {
        const editBtn = e.target.closest(".jyt-glossary-row-edit");
        const deleteBtn = e.target.closest(".jyt-glossary-row-delete");
        if (!editBtn && !deleteBtn) return;

        const index = Number((editBtn || deleteBtn).getAttribute("data-index"));
        if (!Number.isInteger(index) || index < 0) return;
        const term = glossaryTermsCache[index];
        if (!term) return;

        if (editBtn) {
            populateGlossaryEditor(term);
            setGlossaryStatus("已载入术语，编辑后点击更新", false);
            return;
        }

        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_DELETE || "TERM_DELETE",
                { term },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "删除失败");
            }

            await refreshGlossaryList();
            if (
                glossaryEditingOriginal &&
                glossaryTermKey(glossaryEditingOriginal) ===
                    glossaryTermKey(term)
            ) {
                resetGlossaryEditor();
            }
            setGlossaryStatus("术语已删除", false);
        } catch (err) {
            setGlossaryStatus(
                `删除失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    // Listen for system theme changes
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
            if (els.theme_mode.value === "auto") {
                applyTheme("auto");
            }
        });

    load();
    void refreshActivePdfContext();
    resetGlossaryEditor();
    void refreshGlossaryList().catch((err) => {
        setGlossaryStatus(
            `术语列表加载失败: ${err && err.message ? err.message : String(err)}`,
            true,
        );
    });

    if (window.location.hash === "#glossary-import") {
        setTimeout(() => {
            glossaryImportBtn?.click();
            if (
                window.history &&
                typeof window.history.replaceState === "function"
            ) {
                window.history.replaceState(null, "", "options.html");
            }
        }, 60);
    }

    if (!isWebLLMSupportedBrowser) {
        const webllmOption = els.engine_select.querySelector(
            'option[value="webllm"]',
        );
        webllmOption?.remove();
        if (els.engine_select.value === "webllm") {
            els.engine_select.value = "auto";
        }
    }

    void evaluateWebLLMPerformance().then((profile) => {
        webllmPerfProfile = profile;
        renderWebLLMPerformance(profile);
    });
});
