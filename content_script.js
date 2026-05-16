// content_script.js
// Handles selection UI, browser built-in translation path, and background fallback.

(function () {
    const BUTTON_ID = "jyt-translate-btn";
    const BUBBLE_ID = "jyt-translate-bubble";
    const shared = globalThis.JYT_SHARED || {};
    const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS;
    const MESSAGE_TYPES = shared.MESSAGE_TYPES || {};

    let lastSelection = "";
    let isPinned = false;
    let translatePort = null;
    let activeRequest = null;
    let lastTranslateContext = null;
    let runtimeSettings = { ...DEFAULT_SETTINGS };
    const API_KEY_FIELDS = Object.keys(DEFAULT_SETTINGS || {}).filter((key) =>
        key.endsWith("_api_key"),
    );
    let pdfPromptState = null;
    let pdfPromptEl = null;
    let pdfPromptAutoCloseTimer = null;
    let pdfPromptCountdownInterval = null;

    const PDF_PROMPT_AUTO_CLOSE_MS = 10 * 1000;

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

    function isLikelyPdfUrl(url) {
        if (!url || typeof url !== "string") return false;

        let parsed;
        try {
            parsed = new URL(url, window.location.href);
        } catch (err) {
            return false;
        }

        if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
            return false;
        }

        if (/\.pdf$/i.test(parsed.pathname)) {
            return true;
        }

        if (/\/(pdf)(\/|$)/i.test(parsed.pathname || "")) {
            return true;
        }

        let decodedSearch = parsed.search || "";
        try {
            decodedSearch = decodeURIComponent(decodedSearch);
        } catch (err) {
            // keep raw search
        }
        if (/\.pdf(?:$|[&#?])/i.test(decodedSearch)) {
            return true;
        }

        return /(?:^|[?&])(format|type|mime|contenttype)=pdf(?:$|[&#])/i.test(
            decodedSearch,
        );
    }

    function ensurePdfPrompt() {
        if (pdfPromptEl && document.body.contains(pdfPromptEl)) {
            return pdfPromptEl;
        }

        pdfPromptEl = document.createElement("div");
        pdfPromptEl.className = "jyt-pdf-prompt";
        pdfPromptEl.innerHTML = `
            <div class="jyt-pdf-prompt-title">检测到可能是 PDF</div>
            <div class="jyt-pdf-prompt-desc">是否使用插件内置查看器打开？</div>
            <div class="jyt-pdf-prompt-countdown">10 秒后将自动使用浏览器打开</div>
            <div class="jyt-pdf-progress" aria-hidden="true">
                <div class="jyt-pdf-progress-bar"></div>
            </div>
            <div class="jyt-pdf-prompt-status"></div>
            <div class="jyt-pdf-prompt-actions">
                <button type="button" class="jyt-pdf-open">用划词翻译插件打开</button>
                <button type="button" class="jyt-pdf-browser">保持浏览器打开</button>
            </div>
        `;

        const openBtn = pdfPromptEl.querySelector(".jyt-pdf-open");
        const browserBtn = pdfPromptEl.querySelector(".jyt-pdf-browser");

        openBtn.addEventListener("click", async () => {
            clearPdfPromptAutoCloseTimer();
            if (!pdfPromptState?.pdfUrl) {
                return;
            }
            if (pdfPromptState.isPdf === false) {
                return;
            }

            openBtn.disabled = true;
            browserBtn.disabled = true;
            updatePdfPromptStatus("正在打开插件内置 PDF 查看器...");

            try {
                if (pdfPromptState.source === "background") {
                    await sendTermMessage(
                        MESSAGE_TYPES.PDF_PROMPT_DECISION ||
                            "PDF_PROMPT_DECISION",
                        {
                            promptId: pdfPromptState.promptId,
                            pdfUrl: pdfPromptState.pdfUrl,
                            action: "open",
                        },
                    );
                } else {
                    await sendTermMessage(
                        MESSAGE_TYPES.PDF_OPEN_IN_VIEWER ||
                            "PDF_OPEN_IN_VIEWER",
                        {
                            pdfUrl: pdfPromptState.pdfUrl,
                        },
                    );
                }
                hidePdfPrompt();
            } catch (err) {
                openBtn.disabled = false;
                browserBtn.disabled = false;
                const message = err?.message || String(err);
                updatePdfPromptStatus(`打开失败：${message}`, true);
            }
        });

        browserBtn.addEventListener("click", async () => {
            clearPdfPromptAutoCloseTimer();
            const currentState = pdfPromptState;
            await openPdfInBrowser(currentState);
        });

        document.body.appendChild(pdfPromptEl);
        return pdfPromptEl;
    }

    function updatePdfPromptStatus(text, isError) {
        const prompt = ensurePdfPrompt();
        const statusEl = prompt.querySelector(".jyt-pdf-prompt-status");
        statusEl.textContent = String(text || "");
        statusEl.classList.toggle("jyt-pdf-prompt-error", !!isError);
    }

    function hidePdfPrompt() {
        clearPdfPromptAutoCloseTimer();
        if (pdfPromptEl && pdfPromptEl.parentNode) {
            pdfPromptEl.remove();
        }
        pdfPromptEl = null;
        pdfPromptState = null;
    }

    function clearPdfPromptAutoCloseTimer() {
        if (pdfPromptAutoCloseTimer) {
            window.clearTimeout(pdfPromptAutoCloseTimer);
            pdfPromptAutoCloseTimer = null;
        }
        if (pdfPromptCountdownInterval) {
            window.clearInterval(pdfPromptCountdownInterval);
            pdfPromptCountdownInterval = null;
        }
    }

    function updatePdfPromptCountdown(msRemaining) {
        if (!pdfPromptEl) {
            return;
        }

        const countdownEl = pdfPromptEl.querySelector(
            ".jyt-pdf-prompt-countdown",
        );
        const progressBarEl = pdfPromptEl.querySelector(
            ".jyt-pdf-progress-bar",
        );
        if (!countdownEl || !progressBarEl) {
            return;
        }

        const remaining = Math.max(0, Number(msRemaining) || 0);
        const remainSeconds = Math.ceil(remaining / 1000);
        const ratio = Math.max(
            0,
            Math.min(1, remaining / PDF_PROMPT_AUTO_CLOSE_MS),
        );

        countdownEl.textContent = `${remainSeconds} 秒后将自动使用浏览器打开`;
        progressBarEl.style.width = `${Math.round(ratio * 100)}%`;
    }

    async function openPdfInBrowser(state) {
        const currentState = state || pdfPromptState;
        hidePdfPrompt();

        if (!currentState?.pdfUrl) {
            return;
        }

        if (currentState.source === "background") {
            try {
                await sendTermMessage(
                    MESSAGE_TYPES.PDF_PROMPT_DECISION || "PDF_PROMPT_DECISION",
                    {
                        promptId: currentState.promptId,
                        pdfUrl: currentState.pdfUrl,
                        action: "skip",
                    },
                );
            } catch (err) {
                // ignore decision failures when user chooses skip
            }
        }

        if (window.location.href !== currentState.pdfUrl) {
            window.location.href = currentState.pdfUrl;
        }
    }

    function schedulePdfPromptAutoClose() {
        clearPdfPromptAutoCloseTimer();
        const snapshot =
            pdfPromptState && pdfPromptState.pdfUrl
                ? {
                      source: pdfPromptState.source,
                      promptId: pdfPromptState.promptId,
                      pdfUrl: pdfPromptState.pdfUrl,
                  }
                : null;

        if (!snapshot) {
            return;
        }

        const deadline = Date.now() + PDF_PROMPT_AUTO_CLOSE_MS;
        updatePdfPromptCountdown(PDF_PROMPT_AUTO_CLOSE_MS);
        pdfPromptCountdownInterval = window.setInterval(() => {
            const remain = deadline - Date.now();
            updatePdfPromptCountdown(remain);
            if (remain <= 0) {
                if (pdfPromptCountdownInterval) {
                    window.clearInterval(pdfPromptCountdownInterval);
                    pdfPromptCountdownInterval = null;
                }
            }
        }, 100);

        pdfPromptAutoCloseTimer = window.setTimeout(() => {
            if (!pdfPromptState || pdfPromptState.pdfUrl !== snapshot.pdfUrl) {
                return;
            }
            void openPdfInBrowser(snapshot);
        }, PDF_PROMPT_AUTO_CLOSE_MS);
    }

    function setPdfPromptOpenEnabled(enabled) {
        if (!pdfPromptEl) {
            return;
        }
        const openBtn = pdfPromptEl.querySelector(".jyt-pdf-open");
        if (openBtn) {
            openBtn.disabled = !enabled;
        }
    }

    function showPdfPrompt(state) {
        pdfPromptState = {
            source: state?.source || "click",
            promptId: state?.promptId || "",
            pdfUrl: state?.pdfUrl || "",
            isPdf: state?.isPdf ?? null,
        };

        ensurePdfPrompt();
        if (pdfPromptState.isPdf === false) {
            setPdfPromptOpenEnabled(false);
            updatePdfPromptStatus(
                "校验结果：该链接不像 PDF（已禁用划词翻译插件打开）",
                true,
            );
            return;
        }

        setPdfPromptOpenEnabled(true);
        if (pdfPromptState.isPdf === true) {
            updatePdfPromptStatus(
                "校验结果：该链接是 PDF，可以选择用划词翻译插件打开。",
                false,
            );
        } else {
            updatePdfPromptStatus("正在校验文件类型，可稍候再决定。", false);
        }

        schedulePdfPromptAutoClose();
    }

    async function checkPdfUrlAndUpdatePrompt(pdfUrl) {
        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.PDF_CHECK_URL || "PDF_CHECK_URL",
                {
                    pdfUrl,
                },
            );

            if (!pdfPromptState || pdfPromptState.pdfUrl !== pdfUrl) {
                return;
            }

            if (!result?.ok) {
                setPdfPromptOpenEnabled(true);
                updatePdfPromptStatus("校验失败，可按需继续打开。", true);
                return;
            }

            pdfPromptState.isPdf = result.isPdf;
            if (result.isPdf === false) {
                setPdfPromptOpenEnabled(false);
                updatePdfPromptStatus(
                    "校验结果：该链接不是 PDF（将保持浏览器默认行为）。",
                    true,
                );
                return;
            }

            setPdfPromptOpenEnabled(true);
            if (result.isPdf === true) {
                updatePdfPromptStatus("校验结果：确认是 PDF。", false);
            } else {
                updatePdfPromptStatus(
                    "未能完全确认类型，但可按需继续打开。",
                    false,
                );
            }
        } catch (err) {
            if (!pdfPromptState || pdfPromptState.pdfUrl !== pdfUrl) {
                return;
            }
            setPdfPromptOpenEnabled(true);
            updatePdfPromptStatus("校验请求失败，可按需继续打开。", true);
        }
    }

    function registerPdfRuntimeListener() {
        if (!chrome?.runtime?.onMessage?.addListener) {
            return;
        }

        chrome.runtime.onMessage.addListener((message) => {
            const type = String(message?.type || "");
            if (
                type === (MESSAGE_TYPES.PDF_PROMPT_OFFER || "PDF_PROMPT_OFFER")
            ) {
                showPdfPrompt({
                    source: "background",
                    promptId: String(message?.promptId || ""),
                    pdfUrl: String(message?.pdfUrl || ""),
                    isPdf: null,
                });
                return false;
            }

            if (
                type ===
                (MESSAGE_TYPES.PDF_PROMPT_VERDICT || "PDF_PROMPT_VERDICT")
            ) {
                const promptId = String(message?.promptId || "");
                if (!pdfPromptState || pdfPromptState.promptId !== promptId) {
                    return false;
                }

                pdfPromptState.isPdf = message?.isPdf ?? null;
                if (pdfPromptState.isPdf === false) {
                    setPdfPromptOpenEnabled(false);
                    updatePdfPromptStatus("校验结果：该链接不是 PDF。", true);
                    return false;
                }

                setPdfPromptOpenEnabled(true);
                if (pdfPromptState.isPdf === true) {
                    updatePdfPromptStatus("校验结果：确认是 PDF。", false);
                } else {
                    updatePdfPromptStatus(
                        "未能完全确认类型，但你仍可按需选择划词翻译插件打开。",
                        false,
                    );
                }
            }

            return false;
        });
    }

    async function restorePendingPdfPrompt() {
        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.PDF_GET_PENDING_PROMPT ||
                    "PDF_GET_PENDING_PROMPT",
                {},
            );
            const pending = result?.pending;
            if (!result?.ok || !pending?.pdfUrl) {
                return;
            }

            showPdfPrompt({
                source: "background",
                promptId: String(pending.promptId || ""),
                pdfUrl: String(pending.pdfUrl || ""),
                isPdf: pending.isPdf ?? null,
            });
        } catch (err) {
            // ignore restore errors
        }
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
        const titleEl = document.createElement("div");
        const sourceLabelEl = document.createElement("label");
        const sourceInputEl = document.createElement("textarea");
        const targetLabelEl = document.createElement("label");
        const targetInputEl = document.createElement("textarea");
        const actionsEl = document.createElement("div");
        const confirmBtn = document.createElement("button");
        const cancelBtn = document.createElement("button");

        titleEl.className = "jyt-term-editor-title";
        titleEl.textContent = `添加术语（${sourceLang} -> ${targetLang}）`;
        sourceLabelEl.textContent = "原文术语";
        sourceInputEl.className = "jyt-term-source";
        targetLabelEl.textContent = "目标术语";
        targetInputEl.className = "jyt-term-target";
        actionsEl.className = "jyt-term-actions";
        confirmBtn.className = "jyt-term-confirm";
        confirmBtn.type = "button";
        confirmBtn.textContent = "确认保存";
        cancelBtn.className = "jyt-term-cancel";
        cancelBtn.type = "button";
        cancelBtn.textContent = "取消";

        actionsEl.append(confirmBtn, cancelBtn);
        editor.append(
            titleEl,
            sourceLabelEl,
            sourceInputEl,
            targetLabelEl,
            targetInputEl,
            actionsEl,
        );
        contentEl.appendChild(editor);

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
        const btn = document.getElementById(BUTTON_ID);
        let currentTheme = theme;

        if (theme === "auto") {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches;
            currentTheme = prefersDark ? "dark" : "light";
        }

        if (bubble) bubble.setAttribute("data-theme", currentTheme);
        if (btn) btn.setAttribute("data-theme", currentTheme);
    }

    function createButton() {
        let btn = document.getElementById(BUTTON_ID);
        if (btn) return btn;

        btn = document.createElement("div");
        btn.id = BUTTON_ID;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z"/></svg>`;
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
            cancelActiveTranslateRequest();
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
        chrome.storage.sync.get(DEFAULT_SETTINGS, (syncItems) => {
            const syncErr = chrome.runtime.lastError;
            const safeSyncItems = syncErr ? {} : syncItems || {};

            chrome.storage.local.get(API_KEY_FIELDS, (localItems) => {
                const localErr = chrome.runtime.lastError;
                const safeLocalItems = localErr ? {} : localItems || {};
                runtimeSettings = {
                    ...DEFAULT_SETTINGS,
                    ...safeSyncItems,
                    ...safeLocalItems,
                };
                applyTheme(runtimeSettings.theme_mode || "auto");
            });
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

    function cancelActiveTranslateRequest() {
        const currentRequest = activeRequest;
        activeRequest = null;

        if (!currentRequest || !translatePort) {
            return;
        }

        try {
            translatePort.postMessage({
                type: MESSAGE_TYPES.TRANSLATE_CANCEL || "TRANSLATE_CANCEL",
                requestId: currentRequest.requestId,
            });
        } catch (err) {
            // Ignore port send failures when runtime is unavailable.
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
        const selectedEngine = settings.engine || "auto";
        const llmEngine = settings.llm_engine || "openai";
        const engine = selectedEngine === "llm" ? llmEngine : selectedEngine;
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

        cancelActiveTranslateRequest();

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
    registerPdfRuntimeListener();
    void restorePendingPdfPrompt();

    // Listen for system theme changes
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
            if (runtimeSettings.theme_mode === "auto") {
                applyTheme("auto");
            }
        });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync") {
            for (const key of Object.keys(changes)) {
                runtimeSettings[key] = changes[key].newValue;
                if (key === "theme_mode") {
                    applyTheme(changes[key].newValue);
                }
            }
            return;
        }

        if (area === "local") {
            for (const key of Object.keys(changes)) {
                if (!API_KEY_FIELDS.includes(key)) {
                    continue;
                }
                runtimeSettings[key] = String(changes[key].newValue || "");
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

    document.addEventListener(
        "click",
        (e) => {
            if (runtimeSettings.enabled !== "on") {
                return;
            }

            if (e.defaultPrevented || e.button !== 0) {
                return;
            }

            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                return;
            }

            const target = e.target;
            if (!target || typeof target.closest !== "function") {
                return;
            }

            const anchor = target.closest("a[href]");
            if (!anchor || !anchor.href) {
                return;
            }

            if (!isLikelyPdfUrl(anchor.href)) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            const pdfUrl = anchor.href;
            showPdfPrompt({
                source: "click",
                pdfUrl,
                isPdf: null,
            });
            void checkPdfUrlAndUpdatePrompt(pdfUrl);
        },
        true,
    );

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
        hidePdfPrompt();
        if (!translatePort) return;
        try {
            translatePort.disconnect();
        } catch (err) {
            // ignore
        }
        translatePort = null;
    });
})();
