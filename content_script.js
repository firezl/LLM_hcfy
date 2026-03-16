// content_script.js
// 负责监听划词、显示翻译按钮与弹窗，调用翻译适配器并支持 OpenAI 流式输出

(function () {
    const BUTTON_ID = "jyt-translate-btn";
    const BUBBLE_ID = "jyt-translate-bubble";

    let lastSelection = "";
    let isPinned = false;
    let translatePort = null;
    let activeRequest = null;
    const translatorCache = new Map();

    function clampPercent(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return fallback;
        }
        return Math.max(5, Math.min(95, n));
    }

    function applyBubbleSizeConfig(bubble, settings) {
        const widthPercent = clampPercent(settings.bubble_width_percent, 20);
        const heightPercent = clampPercent(settings.bubble_height_percent, 58);
        bubble.style.setProperty("--jyt-max-width", `${widthPercent}vw`);
        bubble.style.setProperty("--jyt-max-height", `${heightPercent}vh`);
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
        let b = document.getElementById(BUBBLE_ID);
        if (b) return b;
        b = document.createElement("div");
        b.id = BUBBLE_ID;
        b.className = "jyt-bubble";
        b.innerHTML = `
      <div class="jyt-header">
        <span class="jyt-title">翻译</span>
        <div class="jyt-controls">
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
        document.body.appendChild(b);

        // Drag functionality
        const header = b.querySelector(".jyt-header");
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener("mousedown", (e) => {
            // Prevent drag if clicking buttons
            if (e.target.closest("button")) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = b.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            header.style.cursor = "grabbing";
            e.preventDefault(); // Prevent text selection
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Use fixed positioning logic or update absolute position relative to document
            // Since we use absolute positioning with window.scrollX/Y in positionBubble,
            // we should update left/top.
            // Note: b.style.left includes 'px'.

            b.style.left = `${initialLeft + dx + window.scrollX}px`;
            b.style.top = `${initialTop + dy + window.scrollY}px`;
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = "move";
            }
        });

        // Event listeners
        b.querySelector(".jyt-close").addEventListener("click", () => {
            b.style.display = "none";
            isPinned = false;
            updatePinState(b);
        });

        b.querySelector(".jyt-pin").addEventListener("click", (e) => {
            isPinned = !isPinned;
            updatePinState(b);
            e.stopPropagation();
        });

        return b;
    }

    function updatePinState(bubble) {
        const pinBtn = bubble.querySelector(".jyt-pin");
        if (isPinned) {
            pinBtn.classList.add("active");
        } else {
            pinBtn.classList.remove("active");
        }
    }

    function onTranslateClick(e) {
        const selection = lastSelection.trim();
        if (!selection) return;
        const bubble = createBubble();
        bubble.style.display = "block";

        isPinned = false;
        updatePinState(bubble);

        positionBubble(bubble, e.clientX, e.clientY);
        setBubbleLoading(bubble, true);
        // get settings and call translate
        chrome.storage.sync.get(
            {
                engine: "auto",
                openai_api_url: "",
                openai_api_key: "",
                openai_model: "gpt-4o-mini",
                openai_thinking_model: "gpt-5-thinking",
                show_thoughts: false,
                font_family: "",
                bubble_width_percent: 52,
                bubble_height_percent: 58,
            },
            (items) => {
                translateText(selection, items, bubble);
            },
        );
    }

    function setBubbleLoading(bubble, loading) {
        const s = bubble.querySelector("#jyt-stream");
        s.innerText = loading ? "加载中..." : "";
        bubble.querySelector("#jyt-thought-content").innerText = "";
    }

    function positionButton(btn, x, y) {
        // Position button near mouse cursor (bottom-right)
        const offsetX = 12;
        const offsetY = 12;
        btn.style.left = x + offsetX + window.scrollX + "px";
        btn.style.top = y + offsetY + window.scrollY + "px";
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

    function detectLang(text) {
        // 简单基于字符集检测中文
        const zh = /[\u4e00-\u9fff]/;
        return zh.test(text) ? "zh" : "en";
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

    function normalizeLanguageTag(lang) {
        if (!lang || typeof lang !== "string") {
            return "";
        }
        const lower = lang.toLowerCase();
        if (lower.startsWith("zh")) {
            return "zh";
        }
        if (lower.startsWith("en")) {
            return "en";
        }
        const base = lower.split("-")[0];
        return base || "";
    }

    async function detectLangByLanguageDetector(text, streamEl) {
        if (!isBrowserAILanguageDetectorSupported()) {
            return null;
        }

        try {
            const availability = await self.LanguageDetector.availability();
            if (availability === "unavailable") {
                return null;
            }

            const detector = await self.LanguageDetector.create({
                monitor(m) {
                    m.addEventListener("downloadprogress", (e) => {
                        const percent = Math.round((e.loaded || 0) * 100);
                        streamEl.innerText =
                            "正在下载 LanguageDetector 模型: " + percent + "%";
                    });
                },
            });

            if (detector.ready) {
                await detector.ready;
            }

            const results = await detector.detect(text);
            const detected = normalizeLanguageTag(
                results && results[0] ? results[0].detectedLanguage : "",
            );
            return detected || null;
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
        if (translatorCache.has(key)) {
            return translatorCache.get(key);
        }

        const availability = await self.Translator.availability({
            sourceLanguage: from,
            targetLanguage: to,
        });

        if (availability === "unavailable") {
            throw new Error(`Translation API 不支持语言对: ${from} -> ${to}`);
        }

        const translator = await self.Translator.create({
            sourceLanguage: from,
            targetLanguage: to,
            monitor(m) {
                m.addEventListener("downloadprogress", (e) => {
                    const percent = Math.round((e.loaded || 0) * 100);
                    streamEl.innerText =
                        "正在下载 Translation 模型: " + percent + "%";
                });
            },
        });

        if (translator.ready) {
            await translator.ready;
        }

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
                streamEl.innerText = output;
                streamEl.scrollTop = streamEl.scrollHeight;
            }
            return;
        }

        const translated = await translator.translate(text);
        streamEl.innerText = translated;
    }

    function ensureTranslatePort() {
        if (translatePort) {
            return translatePort;
        }

        translatePort = chrome.runtime.connect({ name: "jyt-translate" });
        translatePort.onMessage.addListener((message) => {
            if (!activeRequest || !message) {
                return;
            }
            if (message.requestId !== activeRequest.requestId) {
                return;
            }

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

            if (message.type === "TRANSLATE_THOUGHT") {
                thoughtEl.textContent =
                    (thoughtEl.textContent || "") + (message.content || "");
                if (isThinking && thoughtDetails) {
                    thoughtDetails.style.display = "block";
                }
                return;
            }

            if (message.type === "TRANSLATE_ERROR") {
                streamEl.innerText =
                    "翻译失败: " + (message.error || "未知错误");
                activeRequest = null;
                return;
            }

            if (message.type === "TRANSLATE_DONE") {
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
        try {
            port.postMessage(payload);
            return true;
        } catch (err) {
            // BFCache 恢复后旧端口可能已失效，重建一次并重试。
            translatePort = null;
            try {
                port = ensureTranslatePort();
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
        const tstart = buffer.indexOf("<think>");
        const tend = buffer.indexOf("</think>");

        if (tstart !== -1 && tend !== -1 && tend > tstart) {
            const thought = buffer
                .substring(tstart + "<think>".length, tend)
                .trim();
            thoughtEl.innerText = thought;
            if (isThinking && thoughtDetails) {
                thoughtDetails.style.display = "block";
            }

            const before = buffer.substring(0, tstart);
            const after = buffer.substring(tend + "</think>".length);
            const clean = before + after;
            streamEl.innerText = clean;
            activeRequest.buffer = clean;
            return;
        }

        if (tstart !== -1) {
            const cleanBuffer = buffer
                .replace(/<think>[\s\S]*?<\/think>/g, "")
                .replace(/<think>[\s\S]*/g, "");
            streamEl.innerText = cleanBuffer;

            if (tend === -1) {
                thoughtEl.innerText = buffer.substring(
                    tstart + "<think>".length,
                );
                if (isThinking && thoughtDetails) {
                    thoughtDetails.style.display = "block";
                }
            }
            return;
        }

        streamEl.innerText = buffer;
    }

    function startOpenAITranslate(
        text,
        from,
        to,
        settings,
        streamEl,
        thoughtEl,
        thoughtDetails,
    ) {
        const requestId = `${Date.now()}-${Math.random()}`;
        activeRequest = {
            requestId,
            streamEl,
            thoughtEl,
            thoughtDetails,
            isThinking: !!settings.show_thoughts,
            buffer: "",
        };

        const sent = sendTranslateStart({
            type: "TRANSLATE_START",
            requestId,
            text,
            from,
            to,
            settings,
        });
        if (!sent) {
            streamEl.innerText = "翻译失败: 通信通道已关闭，请重试";
            activeRequest = null;
        }
    }

    async function translateText(text, settings, bubble) {
        const engine = settings.engine || "auto";
        let from = detectLang(text);
        const streamEl = bubble.querySelector("#jyt-stream");
        const thoughtEl = bubble.querySelector("#jyt-thought-content");
        const thoughtDetails = bubble.querySelector("#jyt-thought");

        // Apply font family if set
        if (settings.font_family) {
            bubble.style.setProperty("--jyt-font", settings.font_family);
        }
        applyBubbleSizeConfig(bubble, settings);

        // Always hide thought initially, show only when content arrives in streaming
        thoughtDetails.style.display = "none";
        thoughtDetails.removeAttribute("open");

        streamEl.innerText = "";
        thoughtEl.innerText = "";
        activeRequest = null;

        const shouldUseBrowser = engine === "browser" || engine === "auto";
        if (shouldUseBrowser) {
            const detectedByAPI = await detectLangByLanguageDetector(
                text,
                streamEl,
            );
            if (detectedByAPI) {
                from = detectedByAPI;
            }
            const toByAPI = from === "zh" ? "en" : "zh";

            try {
                await translateWithBrowserAPI(text, from, toByAPI, streamEl);
                return;
            } catch (err) {
                if (engine === "browser") {
                    streamEl.innerText = "翻译失败: " + err.message;
                    return;
                }
                // auto 模式下浏览器内置 API 不可用时回退到 OpenAI。
                streamEl.innerText = "浏览器内置翻译不可用，正在回退 OpenAI...";
            }
        }

        const to = from === "zh" ? "en" : "zh";
        startOpenAITranslate(
            text,
            from,
            to,
            settings,
            streamEl,
            thoughtEl,
            thoughtDetails,
        );
    }

    // selection handling
    const btn = createButton();
    createBubble();

    document.addEventListener("mouseup", (e) => {
        // Capture mouse position immediately
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // If clicking on the button, do not trigger selection logic which might hide it
        const btn = document.getElementById(BUTTON_ID);
        if (btn && (e.target === btn || btn.contains(e.target))) return;

        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel) {
                hideButton();
                return;
            }
            const text = sel.toString();
            if (text && text.trim().length > 0) {
                lastSelection = text;
                // Pass mouse coordinates instead of rect
                positionButton(btn, mouseX, mouseY);
            } else {
                hideButton();
            }
        }, 10);
    });

    // hide UI on click outside
    /* 
    // Removed scroll listener as per user request: scrolling should not close the window
    document.addEventListener(
        "scroll",
        (e) => {
            const bubble = document.getElementById(BUBBLE_ID);
            // If scrolling inside the bubble, do not hide
            if (bubble && bubble.contains(e.target)) return;

            hideButton();

            if (!isPinned) {
                if (bubble) bubble.style.display = "none";
            }
        },
        true
    );
    */

    document.addEventListener("click", (e) => {
        const btn = document.getElementById(BUTTON_ID);
        const bubble = document.getElementById(BUBBLE_ID);

        // If click is on the button or bubble, ignore
        if (btn && (e.target === btn || btn.contains(e.target))) return;
        if (bubble && bubble.contains(e.target)) return;

        // Clicked outside
        hideButton(); // This hides the button

        // Only hide bubble if NOT pinned
        if (bubble && !isPinned) {
            bubble.style.display = "none";
        }
    });

    window.addEventListener("pagehide", () => {
        if (translatePort) {
            try {
                translatePort.disconnect();
            } catch (err) {
                // ignore
            }
            translatePort = null;
        }
    });
})();
