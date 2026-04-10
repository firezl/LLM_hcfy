// content_script.js
// Handles selection UI, browser built-in translation path, and background fallback.

(function () {
    const BUTTON_ID = "jyt-translate-btn";
    const BUBBLE_ID = "jyt-translate-bubble";
    const FALLBACK_DEFAULT_SETTINGS = {
        enabled: "on",
        engine: "auto",
        translate_shortcut: "",
        source_lang: "auto",
        target_lang: "auto",
        openai_api_url: "",
        openai_api_key: "",
        openai_model: "gpt-4o-mini",
        openai_custom_prompt: "",
        openai_thinking_model: "gpt-5-thinking",
        show_thoughts: false,
        openai_reasoning_effort: "medium",
        openai_max_completion_tokens: 0,
        custom_openai_api_url: "https://api.openai.com/v1/chat/completions",
        custom_openai_api_key: "",
        custom_openai_model: "gpt-4o-mini",
        custom_openai_custom_prompt: "",
        custom_openai_show_thoughts: false,
        custom_openai_reasoning_effort: "medium",
        custom_openai_max_completion_tokens: 0,
        deepseek_api_url: "https://api.deepseek.com/chat/completions",
        deepseek_api_key: "",
        deepseek_model: "deepseek-chat",
        deepseek_custom_prompt: "",
        deepseek_show_thoughts: false,
        qwen_api_url:
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        qwen_api_key: "",
        qwen_model: "qwen-plus",
        qwen_custom_prompt: "",
        qwen_show_thoughts: false,
        qwen_thinking_budget: 0,
        qwen_preserve_thinking: false,
        glm_api_url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        glm_api_key: "",
        glm_model: "glm-5.1",
        glm_custom_prompt: "",
        glm_show_thoughts: false,
        glm_clear_thinking: true,
        xiaomi_api_url: "https://api.xiaomimimo.com/v1/chat/completions",
        xiaomi_api_key: "",
        xiaomi_model: "mimo-v2-pro",
        xiaomi_custom_prompt: "",
        xiaomi_show_thoughts: false,
        xiaomi_max_completion_tokens: 0,
        claude_api_url: "https://api.anthropic.com/v1/messages",
        claude_api_key: "",
        claude_model: "claude-sonnet-4-6",
        claude_custom_prompt: "",
        claude_show_thoughts: false,
        claude_max_tokens: 4096,
        claude_thinking_mode: "adaptive",
        claude_thinking_budget: 2048,
        claude_thinking_effort: "medium",
        gemini_api_url:
            "https://generativelanguage.googleapis.com/v1beta/models",
        gemini_api_key: "",
        gemini_model: "gemini-2.5-flash",
        gemini_custom_prompt: "",
        gemini_show_thoughts: false,
        gemini_thinking_level: "high",
        gemini_thinking_budget: -1,
        ollama_api_url: "http://localhost:11434/api/chat",
        ollama_model: "",
        ollama_custom_model: "",
        ollama_custom_prompt: "",
        ollama_show_thoughts: false,
        webllm_model: "Qwen3-0.6B-q4f16_1-MLC",
        webllm_custom_model: "",
        webllm_custom_prompt: "",
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
        config_updated_at: 0,
    };
    const shared = globalThis.JYT_SHARED || {};
    const DEFAULT_SETTINGS =
        shared.DEFAULT_SETTINGS || FALLBACK_DEFAULT_SETTINGS;
    const MESSAGE_TYPES = shared.MESSAGE_TYPES || {};

    let lastSelection = "";
    let isPinned = false;
    let translatePort = null;
    let activeRequest = null;
    let lastTranslateContext = null;
    let runtimeSettings = { ...DEFAULT_SETTINGS };

    const translatorCache = new Map();
    let translationModelReady = false;
    let languageDetectorModelReady = false;
    let languageDetectorInstance = null;

    function normalizeGlossaryLang(lang) {
        const value = String(lang || "")
            .trim()
            .toLowerCase();
        if (!value || value === "auto") return "";
        return value.split("-")[0];
    }

    function normalizeTermText(text) {
        return String(text || "").trim();
    }

    function getRuntimeApi() {
        if (
            typeof chrome !== "undefined" &&
            chrome.runtime &&
            typeof chrome.runtime.sendMessage === "function"
        ) {
            return chrome.runtime;
        }
        if (
            typeof browser !== "undefined" &&
            browser.runtime &&
            typeof browser.runtime.sendMessage === "function"
        ) {
            return browser.runtime;
        }
        return null;
    }

    function sendTermMessage(type, payload) {
        const runtimeApi = getRuntimeApi();
        if (!runtimeApi) {
            return Promise.reject(new Error("运行时消息接口不可用"));
        }

        const request = {
            type,
            ...(payload || {}),
        };

        if (typeof browser !== "undefined" && runtimeApi === browser.runtime) {
            return runtimeApi.sendMessage(request);
        }

        return new Promise((resolve, reject) => {
            try {
                runtimeApi.sendMessage(request, (resp) => {
                    const err = chrome?.runtime?.lastError;
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

    function getCleanTranslatedText() {
        const bubble = document.getElementById(BUBBLE_ID);
        if (!bubble) return "";
        const streamEl = bubble.querySelector("#jyt-stream");
        if (!streamEl) return "";
        return trimEdgeBlankLines(
            String(streamEl.innerText || "")
                .replace(/<think>[\s\S]*?<\/think>/g, "")
                .replace(/<think>[\s\S]*/g, ""),
        );
    }

    function setTermTip(message, isError) {
        const bubble = document.getElementById(BUBBLE_ID);
        if (!bubble) return;
        let tipEl = bubble.querySelector(".jyt-term-tip");
        if (!tipEl) {
            tipEl = document.createElement("div");
            tipEl.className = "jyt-term-tip";
            bubble.querySelector(".jyt-content")?.appendChild(tipEl);
        }
        tipEl.textContent = String(message || "");
        tipEl.classList.toggle("jyt-term-tip-error", !!isError);
    }

    function clearTermEditorUI(clearTip) {
        const bubble = document.getElementById(BUBBLE_ID);
        if (!bubble) return;

        const editor = bubble.querySelector(".jyt-term-editor");
        if (editor) {
            editor.remove();
        }

        if (clearTip) {
            const tip = bubble.querySelector(".jyt-term-tip");
            if (tip) {
                tip.remove();
            }
        }
    }

    async function upsertGlossaryTerm(entry) {
        const response = await sendTermMessage(
            MESSAGE_TYPES.TERM_UPSERT || "TERM_UPSERT",
            { term: entry },
        );
        if (!response?.ok) {
            throw new Error(response?.error || "术语保存失败");
        }
    }

    function showAddTermDialog(context) {
        const sourceTerm = normalizeTermText(context?.sourceText);
        const targetTerm = normalizeTermText(context?.translatedText);
        const sourceLang = normalizeGlossaryLang(context?.sourceLang);
        const targetLang = normalizeGlossaryLang(context?.targetLang);

        const bubble = document.getElementById(BUBBLE_ID);
        if (!bubble) return;
        const contentEl = bubble.querySelector(".jyt-content");
        if (!contentEl) return;

        clearTermEditorUI(false);

        if (!sourceTerm || !targetTerm || !sourceLang || !targetLang) {
            setTermTip("术语添加失败：请先完成一次有效翻译。", true);
            return;
        }

        const editor = document.createElement("div");
        editor.className = "jyt-term-editor";
        editor.innerHTML = `
            <div class="jyt-term-editor-title">添加术语（${sourceLang} -> ${targetLang}）</div>
            <label>原文术语</label>
            <textarea class="jyt-term-source"></textarea>
            <label>目标术语</label>
            <textarea class="jyt-term-target"></textarea>
            <div class="jyt-term-actions">
                <button class="jyt-term-confirm" type="button">确认保存</button>
                <button class="jyt-term-cancel" type="button">取消</button>
            </div>
        `;
        contentEl.appendChild(editor);

        const sourceInputEl = editor.querySelector(".jyt-term-source");
        const targetInputEl = editor.querySelector(".jyt-term-target");
        const confirmBtn = editor.querySelector(".jyt-term-confirm");
        const cancelBtn = editor.querySelector(".jyt-term-cancel");

        sourceInputEl.value = sourceTerm;
        targetInputEl.value = targetTerm;
        sourceInputEl.focus();

        cancelBtn.addEventListener("click", () => {
            editor.remove();
        });

        confirmBtn.addEventListener("click", () => {
            const normalizedSource = normalizeTermText(sourceInputEl.value);
            const normalizedTarget = normalizeTermText(targetInputEl.value);
            if (!normalizedSource || !normalizedTarget) {
                setTermTip("术语添加失败：原文和译文都不能为空。", true);
                return;
            }

            const now = Date.now();
            const termEntry = {
                sourceTerm: normalizedSource,
                targetTerm: normalizedTarget,
                sourceLang,
                targetLang,
                createdAt: now,
                updatedAt: now,
            };

            upsertGlossaryTerm(termEntry)
                .then(() => {
                    setTermTip("术语已保存", false);
                    editor.remove();
                })
                .catch((err) => {
                    setTermTip(
                        `术语保存失败: ${err && err.message ? err.message : String(err)}`,
                        true,
                    );
                });
        });
    }

    function trimEdgeBlankLines(text) {
        const raw = String(text || "");
        return raw
            .replace(/^(?:[ \t\u3000]*\r?\n)+/, "")
            .replace(/(?:\r?\n[ \t\u3000]*)+$/, "");
    }

    function clampPercent(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(5, Math.min(95, n));
    }

    function applyBubbleSizeConfig(bubble, settings) {
        const widthPercent = clampPercent(settings.bubble_width_percent, 20);
        const heightPercent = clampPercent(settings.bubble_height_percent, 40);
        bubble.style.setProperty("--jyt-max-width", `${widthPercent}vw`);
        bubble.style.setProperty("--jyt-max-height", `${heightPercent}vh`);
    }

    function applyTheme(theme) {
        const bubble = document.getElementById(BUBBLE_ID);
        if (!bubble) return;

        if (theme === "auto") {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches;
            bubble.setAttribute("data-theme", prefersDark ? "dark" : "light");
        } else {
            bubble.setAttribute("data-theme", theme);
        }
    }

    function createButton() {
        let btn = document.getElementById(BUTTON_ID);
        if (btn) return btn;

        btn = document.createElement("div");
        btn.id = BUTTON_ID;
        btn.innerText = "翻译";
        btn.className = "jyt-btn";
        btn.style.display = "none";
        document.body.appendChild(btn);
        btn.addEventListener("click", onTranslateClick);
        return btn;
    }

    function createBubble() {
        let bubble = document.getElementById(BUBBLE_ID);
        if (bubble) return bubble;

        bubble = document.createElement("div");
        bubble.id = BUBBLE_ID;
        bubble.className = "jyt-bubble";
        bubble.innerHTML = `
      <div class="jyt-header">
        <span class="jyt-title">翻译</span>
        <div class="jyt-controls">
                    <button class="jyt-add-term" title="添加术语">术</button>
          <button class="jyt-pin" title="固定窗口">
            <svg viewBox="0 0 24 24"><path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" /></svg>
          </button>
          <button class="jyt-close" title="关闭">
            <svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg>
          </button>
        </div>
      </div>
      <div class="jyt-content">
        <div class="jyt-stream" id="jyt-stream"></div>
        <details class="jyt-thought" id="jyt-thought"><summary>思考（展开）</summary><div id="jyt-thought-content"></div></details>
      </div>
    `;
        document.body.appendChild(bubble);

        const header = bubble.querySelector(".jyt-header");
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        header.addEventListener("mousedown", (e) => {
            if (e.target.closest("button")) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = bubble.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            header.style.cursor = "grabbing";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            bubble.style.left = `${initialLeft + dx + window.scrollX}px`;
            bubble.style.top = `${initialTop + dy + window.scrollY}px`;
        });

        document.addEventListener("mouseup", () => {
            if (!isDragging) return;
            isDragging = false;
            header.style.cursor = "move";
        });

        bubble.querySelector(".jyt-close").addEventListener("click", () => {
            clearTermEditorUI(true);
            bubble.style.display = "none";
            isPinned = false;
            updatePinState(bubble);
        });

        bubble.querySelector(".jyt-pin").addEventListener("click", (e) => {
            isPinned = !isPinned;
            updatePinState(bubble);
            e.stopPropagation();
        });

        bubble.querySelector(".jyt-add-term").addEventListener("click", (e) => {
            e.stopPropagation();
            const contextSourceLang =
                activeRequest?.from ||
                lastTranslateContext?.from ||
                runtimeSettings.source_lang ||
                "auto";
            const contextTargetLang =
                activeRequest?.to ||
                lastTranslateContext?.to ||
                runtimeSettings.target_lang ||
                "auto";

            const context = {
                sourceText:
                    activeRequest?.text ||
                    lastTranslateContext?.text ||
                    lastSelection ||
                    "",
                translatedText: getCleanTranslatedText(),
                sourceLang: contextSourceLang,
                targetLang: contextTargetLang,
            };
            showAddTermDialog(context);
        });

        const thoughtDetails = bubble.querySelector("#jyt-thought");
        const thoughtSummary = thoughtDetails?.querySelector("summary");
        const updateThoughtSummary = () => {
            if (!thoughtSummary || !thoughtDetails) return;
            thoughtSummary.textContent = thoughtDetails.open
                ? "思考（收起）"
                : "思考（展开）";
        };
        thoughtDetails?.addEventListener("toggle", updateThoughtSummary);
        updateThoughtSummary();

        return bubble;
    }

    function updatePinState(bubble) {
        const pinBtn = bubble.querySelector(".jyt-pin");
        pinBtn.classList.toggle("active", isPinned);
    }

    function setBubbleLoading(bubble, loading) {
        bubble.querySelector("#jyt-stream").innerText = loading
            ? "加载中..."
            : "";
        bubble.querySelector("#jyt-thought-content").innerText = "";
    }

    function positionButton(btn, x, y) {
        btn.style.left = x + 12 + window.scrollX + "px";
        btn.style.top = y + 12 + window.scrollY + "px";
        btn.style.display = "block";
    }

    function positionBubble(bubble, x, y) {
        bubble.style.left = x + 8 + window.scrollX + "px";
        bubble.style.top = y + 8 + window.scrollY + "px";
        bubble.style.display = "block";
    }

    function hideButton() {
        const btn = document.getElementById(BUTTON_ID);
        if (btn) btn.style.display = "none";
    }

    function loadRuntimeSettings() {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
            runtimeSettings = { ...DEFAULT_SETTINGS, ...items };
            applyTheme(runtimeSettings.theme_mode || "auto");
        });
    }

    function parseShortcut(shortcut) {
        const raw = String(shortcut || "").trim();
        if (!raw) return null;

        const parts = raw
            .split("+")
            .map((part) => part.trim())
            .filter(Boolean);

        const cfg = {
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
            key: "",
        };
        for (const part of parts) {
            const lower = part.toLowerCase();
            if (lower === "ctrl" || lower === "control") {
                cfg.ctrl = true;
                continue;
            }
            if (lower === "alt") {
                cfg.alt = true;
                continue;
            }
            if (lower === "shift") {
                cfg.shift = true;
                continue;
            }
            if (
                lower === "meta" ||
                lower === "cmd" ||
                lower === "command" ||
                lower === "win"
            ) {
                cfg.meta = true;
                continue;
            }
            cfg.key = lower;
        }

        return cfg.key ? cfg : null;
    }

    function isShortcutPressed(e, shortcut) {
        const cfg = parseShortcut(shortcut);
        if (!cfg) return false;

        const key = String(e.key || "").toLowerCase();
        return (
            e.ctrlKey === cfg.ctrl &&
            e.altKey === cfg.alt &&
            e.shiftKey === cfg.shift &&
            e.metaKey === cfg.meta &&
            key === cfg.key
        );
    }

    function getSelectionAnchorPoint(sel) {
        try {
            if (!sel || sel.rangeCount === 0) {
                return { x: window.innerWidth / 2, y: 80 };
            }
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            if (rect && (rect.width || rect.height)) {
                return { x: rect.right, y: rect.bottom };
            }
        } catch (err) {
            // ignore
        }
        return { x: window.innerWidth / 2, y: 80 };
    }

    function detectLangHeuristic(text) {
        return /[\u4e00-\u9fff]/.test(text) ? "zh" : "en";
    }

    function normalizeBasicLang(lang) {
        if (!lang || typeof lang !== "string") return "";
        const lower = lang.toLowerCase();
        if (lower.startsWith("zh")) return "zh";
        if (lower.startsWith("en")) return "en";
        if (lower.startsWith("ja")) return "ja";
        if (lower.startsWith("ko")) return "ko";
        if (lower.startsWith("fr")) return "fr";
        if (lower.startsWith("de")) return "de";
        if (lower.startsWith("es")) return "es";
        if (lower.startsWith("ru")) return "ru";
        return lower.split("-")[0] || "";
    }

    function detectBrowserLangByNavigator() {
        const navLang =
            (navigator && (navigator.language || navigator.userLanguage)) || "";
        return normalizeBasicLang(navLang) || null;
    }

    async function detectTextLangByChromeI18n(text) {
        if (!chrome?.i18n?.detectLanguage) return null;
        try {
            const result = await new Promise((resolve) => {
                chrome.i18n.detectLanguage(text, (res) => resolve(res || null));
            });
            if (
                !result ||
                !Array.isArray(result.languages) ||
                !result.languages[0]
            ) {
                return null;
            }
            return (
                normalizeBasicLang(result.languages[0].language || "") || null
            );
        } catch (err) {
            console.warn("chrome.i18n.detectLanguage failed", err);
            return null;
        }
    }

    function isBrowserAITranslatorSupported() {
        return (
            typeof self.Translator !== "undefined" &&
            typeof self.Translator.availability === "function" &&
            typeof self.Translator.create === "function"
        );
    }

    function isBrowserAILanguageDetectorSupported() {
        return (
            typeof self.LanguageDetector !== "undefined" &&
            typeof self.LanguageDetector.availability === "function" &&
            typeof self.LanguageDetector.create === "function"
        );
    }

    async function detectLangByLanguageDetector(text, streamEl) {
        if (!isBrowserAILanguageDetectorSupported()) return null;

        try {
            if (languageDetectorInstance) {
                const results = await languageDetectorInstance.detect(text);
                return (
                    normalizeBasicLang(results?.[0]?.detectedLanguage || "") ||
                    null
                );
            }

            const availability = await self.LanguageDetector.availability();
            if (availability === "available") languageDetectorModelReady = true;
            if (availability === "unavailable") return null;

            const createOptions = {};
            if (
                !languageDetectorModelReady &&
                (availability === "downloadable" ||
                    availability === "downloading")
            ) {
                createOptions.monitor = (m) => {
                    m.addEventListener("downloadprogress", (e) => {
                        const percent = Math.round((e.loaded || 0) * 100);
                        if (percent > 0 && percent < 100) {
                            streamEl.innerText =
                                "正在下载 LanguageDetector 模型: " +
                                percent +
                                "%";
                        }
                    });
                };
            }

            const detector = await self.LanguageDetector.create(createOptions);
            if (detector.ready) await detector.ready;

            languageDetectorModelReady = true;
            languageDetectorInstance = detector;

            const results = await detector.detect(text);
            return (
                normalizeBasicLang(results?.[0]?.detectedLanguage || "") || null
            );
        } catch (err) {
            console.warn("LanguageDetector failed", err);
            return null;
        }
    }

    async function getBrowserTranslator(from, to, streamEl) {
        if (!isBrowserAITranslatorSupported()) {
            throw new Error(
                "当前浏览器不支持 Translation API（需 Chrome 138+ 实验功能）",
            );
        }

        const key = `${from}->${to}`;
        if (translatorCache.has(key)) return translatorCache.get(key);

        const availability = await self.Translator.availability({
            sourceLanguage: from,
            targetLanguage: to,
        });

        if (availability === "available") translationModelReady = true;
        if (availability === "unavailable") {
            throw new Error(`Translation API 不支持语言对: ${from} -> ${to}`);
        }

        const createOptions = { sourceLanguage: from, targetLanguage: to };
        if (
            !translationModelReady &&
            (availability === "downloadable" || availability === "downloading")
        ) {
            createOptions.monitor = (m) => {
                m.addEventListener("downloadprogress", (e) => {
                    const percent = Math.round((e.loaded || 0) * 100);
                    if (percent > 0 && percent < 100) {
                        streamEl.innerText =
                            "正在下载 Translation 模型: " + percent + "%";
                    }
                });
            };
        }

        const translator = await self.Translator.create(createOptions);
        if (translator.ready) await translator.ready;

        translationModelReady = true;
        translatorCache.set(key, translator);
        return translator;
    }

    async function translateWithBrowserAPI(text, from, to, streamEl) {
        const translator = await getBrowserTranslator(from, to, streamEl);

        if (typeof translator.translateStreaming === "function") {
            let output = "";
            const stream = translator.translateStreaming(text);
            for await (const chunk of stream) {
                output += chunk;
                streamEl.innerText = trimEdgeBlankLines(output);
                streamEl.scrollTop = streamEl.scrollHeight;
            }
            return;
        }

        streamEl.innerText = trimEdgeBlankLines(
            await translator.translate(text),
        );
    }

    function ensureTranslatePort() {
        if (translatePort) return translatePort;

        const runtimeApi =
            typeof chrome !== "undefined" &&
            chrome.runtime &&
            typeof chrome.runtime.connect === "function"
                ? chrome.runtime
                : typeof browser !== "undefined" &&
                    browser.runtime &&
                    typeof browser.runtime.connect === "function"
                  ? browser.runtime
                  : null;

        if (!runtimeApi) {
            return null;
        }

        translatePort = runtimeApi.connect({ name: "jyt-translate" });
        translatePort.onMessage.addListener((message) => {
            if (!activeRequest || !message) return;
            if (message.requestId !== activeRequest.requestId) return;

            const { streamEl, thoughtEl, thoughtDetails, isThinking } =
                activeRequest;

            if (message.type === "TRANSLATE_CHUNK") {
                activeRequest.buffer += message.content || "";
                renderContentAndThought(
                    activeRequest.buffer,
                    streamEl,
                    thoughtEl,
                    thoughtDetails,
                    isThinking,
                );
                streamEl.scrollTop = streamEl.scrollHeight;
                return;
            }

            if (message.type === "WEBLLM_MODEL_PROGRESS") {
                const percent = Number.isFinite(message.progress)
                    ? Math.max(0, Math.min(100, Math.round(message.progress)))
                    : null;
                const suffix = percent === null ? "" : ` (${percent}%)`;
                streamEl.innerText = `${message.text || "模型加载中"}${suffix}`;
                return;
            }

            if (message.type === "TRANSLATE_THOUGHT") {
                thoughtEl.textContent =
                    (thoughtEl.textContent || "") + (message.content || "");
                if (isThinking && thoughtDetails)
                    thoughtDetails.style.display = "block";
                return;
            }

            if (message.type === "TRANSLATE_ERROR") {
                const currentRequest = activeRequest;
                const errorText = message.error || "未知错误";

                if (
                    currentRequest.allowBrowserFallback &&
                    !currentRequest.browserFallbackTried
                ) {
                    currentRequest.browserFallbackTried = true;
                    streamEl.innerText = "OpenAI 不可用，正在回退浏览器 AI...";

                    translateWithBrowserAPI(
                        currentRequest.text,
                        currentRequest.from,
                        currentRequest.to,
                        streamEl,
                    )
                        .then(() => {
                            if (activeRequest === currentRequest) {
                                activeRequest = null;
                            }
                        })
                        .catch((fallbackErr) => {
                            if (activeRequest !== currentRequest) return;
                            const browserErr =
                                fallbackErr && fallbackErr.message
                                    ? fallbackErr.message
                                    : String(fallbackErr || "未知错误");
                            streamEl.innerText = `翻译失败: OpenAI 与浏览器 AI 均不可用（OpenAI: ${errorText}；浏览器: ${browserErr}）`;
                            activeRequest = null;
                        });
                    return;
                }

                streamEl.innerText = "翻译失败: " + errorText;
                activeRequest = null;
                return;
            }

            if (message.type === "TRANSLATE_DONE") {
                lastTranslateContext = {
                    text: activeRequest?.text || lastSelection || "",
                    from: activeRequest?.from || "",
                    to: activeRequest?.to || "",
                };
                activeRequest = null;
            }
        });

        translatePort.onDisconnect.addListener(() => {
            translatePort = null;
        });

        return translatePort;
    }

    function sendTranslateStart(payload) {
        let port = ensureTranslatePort();
        if (!port) {
            return false;
        }

        try {
            port.postMessage(payload);
            return true;
        } catch (err) {
            translatePort = null;
            try {
                port = ensureTranslatePort();
                if (!port) {
                    return false;
                }
                port.postMessage(payload);
                return true;
            } catch (retryErr) {
                return false;
            }
        }
    }

    function renderContentAndThought(
        buffer,
        streamEl,
        thoughtEl,
        thoughtDetails,
        isThinking,
    ) {
        if (!isThinking) {
            if (thoughtDetails) {
                thoughtDetails.style.display = "none";
                thoughtDetails.removeAttribute("open");
            }
            thoughtEl.textContent = "";
            const clean = buffer
                .replace(/<think>[\s\S]*?<\/think>/g, "")
                .replace(/<think>[\s\S]*/g, "");
            streamEl.innerText = trimEdgeBlankLines(clean);
            return;
        }

        const tstart = buffer.indexOf("<think>");
        const tend = buffer.indexOf("</think>");

        if (tstart !== -1 && tend !== -1 && tend > tstart) {
            const thought = buffer.substring(tstart + 7, tend).trim();
            thoughtEl.innerText = thought;
            if (isThinking && thoughtDetails)
                thoughtDetails.style.display = "block";

            const clean =
                buffer.substring(0, tstart) + buffer.substring(tend + 8);
            streamEl.innerText = trimEdgeBlankLines(clean);
            activeRequest.buffer = clean;
            return;
        }

        if (tstart !== -1) {
            const cleanBuffer = buffer
                .replace(/<think>[\s\S]*?<\/think>/g, "")
                .replace(/<think>[\s\S]*/g, "");
            streamEl.innerText = trimEdgeBlankLines(cleanBuffer);

            if (tend === -1) {
                thoughtEl.innerText = buffer.substring(tstart + 7);
                if (isThinking && thoughtDetails)
                    thoughtDetails.style.display = "block";
            }
            return;
        }

        streamEl.innerText = trimEdgeBlankLines(buffer);
    }

    function startBackgroundTranslate(
        text,
        preferredFrom,
        preferredTo,
        settings,
        streamEl,
        thoughtEl,
        thoughtDetails,
        options,
    ) {
        const extraOptions = options || {};
        const requestId = `${Date.now()}-${Math.random()}`;
        const isThinking =
            typeof extraOptions.isThinking === "boolean"
                ? extraOptions.isThinking
                : !!settings.show_thoughts;

        activeRequest = {
            requestId,
            streamEl,
            thoughtEl,
            thoughtDetails,
            isThinking,
            buffer: "",
            text,
            from: preferredFrom,
            to: preferredTo,
            allowBrowserFallback: !!extraOptions.allowBrowserFallback,
            browserFallbackTried: false,
        };

        lastTranslateContext = {
            text,
            from: preferredFrom,
            to: preferredTo,
        };

        const sent = sendTranslateStart({
            type: MESSAGE_TYPES.TRANSLATE_START || "TRANSLATE_START",
            requestId,
            text,
            preferredFrom,
            preferredTo,
            settings,
        });

        if (!sent) {
            streamEl.innerText =
                "翻译失败: 无法连接扩展后台（请刷新页面或重载扩展）";
            activeRequest = null;
        }
    }

    async function translateText(text, settings, bubble) {
        const engine = settings.engine || "auto";
        const sourceSetting = settings.source_lang || "auto";
        const targetSetting = settings.target_lang || "auto";

        let from = sourceSetting === "auto" ? "" : sourceSetting;
        const streamEl = bubble.querySelector("#jyt-stream");
        const thoughtEl = bubble.querySelector("#jyt-thought-content");
        const thoughtDetails = bubble.querySelector("#jyt-thought");

        if (settings.font_family) {
            bubble.style.setProperty("--jyt-font", settings.font_family);
        }
        applyBubbleSizeConfig(bubble, settings);

        thoughtDetails.style.display = "none";
        thoughtDetails.removeAttribute("open");
        streamEl.innerText = "";
        thoughtEl.innerText = "";
        activeRequest = null;

        if (!from) from = await detectLangByLanguageDetector(text, streamEl);
        if (!from) from = await detectTextLangByChromeI18n(text);
        if (!from) from = detectLangHeuristic(text);

        let to = targetSetting === "auto" ? "" : targetSetting;
        if (!to) to = detectBrowserLangByNavigator();
        if (!to) to = "zh";
        if (to === from) to = from === "zh" ? "en" : "zh";

        if (engine === "browser") {
            try {
                lastTranslateContext = { text, from, to };
                await translateWithBrowserAPI(text, from, to, streamEl);
                return;
            } catch (err) {
                streamEl.innerText = "翻译失败: " + err.message;
                return;
            }
        }

        if (engine === "webllm") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.webllm_show_thoughts,
                },
            );
            return;
        }

        if (engine === "ollama") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.ollama_show_thoughts,
                },
            );
            return;
        }

        if (engine === "claude") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.claude_show_thoughts,
                },
            );
            return;
        }

        if (engine === "gemini") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.gemini_show_thoughts,
                },
            );
            return;
        }

        if (engine === "deepseek") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.deepseek_show_thoughts,
                },
            );
            return;
        }

        if (engine === "qwen") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.qwen_show_thoughts,
                },
            );
            return;
        }

        if (engine === "glm") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.glm_show_thoughts,
                },
            );
            return;
        }

        if (engine === "xiaomi") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.xiaomi_show_thoughts,
                },
            );
            return;
        }

        if (engine === "custom_openai") {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings.custom_openai_show_thoughts,
                },
            );
            return;
        }

        if (engine === "auto") {
            const openAIConfigured =
                !!settings.openai_api_url && !!settings.openai_api_key;
            if (!openAIConfigured) {
                try {
                    streamEl.innerText =
                        "未配置 OpenAI，正在使用浏览器 AI 翻译...";
                    await translateWithBrowserAPI(text, from, to, streamEl);
                    return;
                } catch (err) {
                    streamEl.innerText =
                        "翻译失败: 未配置 OpenAI，且浏览器 AI 不可用（" +
                        (err && err.message ? err.message : String(err)) +
                        "）";
                    return;
                }
            }
        }

        startBackgroundTranslate(
            text,
            from,
            to,
            settings,
            streamEl,
            thoughtEl,
            thoughtDetails,
            { allowBrowserFallback: engine === "auto" },
        );
    }

    function onTranslateClick(e) {
        const selection = lastSelection.trim();
        if (!selection) return;
        triggerTranslate(selection, e.clientX, e.clientY);
    }

    function triggerTranslate(selection, x, y) {
        const text = (selection || "").trim();
        if (!text) return;

        const bubble = createBubble();
        clearTermEditorUI(true);
        bubble.style.display = "block";
        isPinned = false;
        updatePinState(bubble);
        positionBubble(bubble, x, y);
        setBubbleLoading(bubble, true);
        applyTheme(runtimeSettings.theme_mode || "auto");
        translateText(text, runtimeSettings, bubble);
    }

    const btn = createButton();
    createBubble();
    loadRuntimeSettings();

    // Listen for system theme changes
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
            if (runtimeSettings.theme_mode === "auto") {
                applyTheme("auto");
            }
        });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        for (const key of Object.keys(changes)) {
            runtimeSettings[key] = changes[key].newValue;
            if (key === "theme_mode") {
                applyTheme(changes[key].newValue);
            }
        }
    });

    document.addEventListener("mouseup", (e) => {
        if (runtimeSettings.enabled !== "on") {
            hideButton();
            return;
        }

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        const btnEl = document.getElementById(BUTTON_ID);
        if (btnEl && (e.target === btnEl || btnEl.contains(e.target))) return;

        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel) {
                hideButton();
                return;
            }

            const text = sel.toString();
            if (text && text.trim().length > 0) {
                lastSelection = text;
                positionButton(btn, mouseX, mouseY);
            } else {
                hideButton();
            }
        }, 10);
    });

    document.addEventListener("keydown", (e) => {
        if (!isShortcutPressed(e, runtimeSettings.translate_shortcut)) return;

        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : "";
        if (!text) return;

        e.preventDefault();
        lastSelection = text;
        const point = getSelectionAnchorPoint(sel);
        triggerTranslate(text, point.x, point.y);
    });

    document.addEventListener("click", (e) => {
        const btnEl = document.getElementById(BUTTON_ID);
        const bubble = document.getElementById(BUBBLE_ID);

        if (btnEl && (e.target === btnEl || btnEl.contains(e.target))) return;
        if (bubble && bubble.contains(e.target)) return;

        hideButton();
        if (bubble && !isPinned) {
            clearTermEditorUI(true);
            bubble.style.display = "none";
        }
    });

    window.addEventListener("pagehide", () => {
        if (!translatePort) return;
        try {
            translatePort.disconnect();
        } catch (err) {
            // ignore
        }
        translatePort = null;
    });
})();
