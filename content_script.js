// content_script.js
// 负责监听划词、显示翻译按钮与弹窗，调用翻译适配器并支持 OpenAI 流式输出

(function () {
    const BUTTON_ID = "jyt-translate-btn";
    const BUBBLE_ID = "jyt-translate-bubble";

    let lastSelection = "";
    let isPinned = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

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
                show_thoughts: false,
                font_family: "",
            },
            (items) => {
                translateText(selection, items, bubble);
            }
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

    async function translateText(text, settings, bubble) {
        const engine = settings.engine || "auto";
        let from = detectLang(text);
        let to = from === "zh" ? "en" : "zh";
        // If engine supports detect, could call API to detect. For now use local detect.
        const streamEl = bubble.querySelector("#jyt-stream");
        const thoughtEl = bubble.querySelector("#jyt-thought-content");
        const thoughtDetails = bubble.querySelector("#jyt-thought");

        // Apply font family if set
        if (settings.font_family) {
            bubble.style.setProperty("--jyt-font", settings.font_family);
        }

        // Always hide thought initially, show only when content arrives in streaming
        thoughtDetails.style.display = "none";
        thoughtDetails.removeAttribute("open");

        streamEl.innerText = "";
        thoughtEl.innerText = "";

        try {
            // Always use OpenAI-like API (LLM)
            await openaiTranslateStream(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails
            );
        } catch (err) {
            streamEl.innerText = "翻译失败: " + err.message;
        }
    }

    // --- Placeholder adapters ---
    // Legacy adapters (Google, Bing, Baidu) removed as per request. Only LLM is supported.

    async function openaiTranslateStream(
        text,
        from,
        to,
        settings,
        streamEl,
        thoughtEl,
        thoughtDetails
    ) {
        const apiUrl = settings.openai_api_url;
        const key = settings.openai_api_key;
        if (!apiUrl || !key)
            throw new Error("请在设置中配置 OpenAI API 地址与 Key");

        const isThinking = settings.show_thoughts;
        const model = isThinking
            ? settings.openai_thinking_model || "Jan-v1"
            : settings.openai_model || "hunyuan-mt";

        // Build prompt
        let prompt = `请把这段文字翻译为${
            to === "zh" ? "中文" : "英文"
        }，不要有多余的输出。输入:\n${text}`;
        if (isThinking) {
            prompt = `请把这段文字翻译为${
                to === "zh" ? "中文" : "英文"
            }，不要有多余的输出。输入:\n${text}`;
        }

        const body = {
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            stream: true,
        };

        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const textErr = await res.text();
            throw new Error("OpenAI 请求失败: " + textErr);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        let buffer = "";

        while (!done) {
            const { value, done: d } = await reader.read();
            done = d;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === "data: [DONE]") continue;
                    if (trimmed.startsWith("data: ")) {
                        try {
                            const jsonStr = trimmed.substring(6);
                            const json = JSON.parse(jsonStr);
                            const delta = json.choices?.[0]?.delta;
                            if (delta) {
                                // Handle content
                                if (delta.content) {
                                    buffer += delta.content;
                                    // Check for thought markers in buffer
                                    const tstart = buffer.indexOf("<think>");
                                    const tend = buffer.indexOf("</think>");

                                    if (
                                        tstart !== -1 &&
                                        tend !== -1 &&
                                        tend > tstart
                                    ) {
                                        // Extract thought
                                        const thought = buffer
                                            .substring(
                                                tstart + "<think>".length,
                                                tend
                                            )
                                            .trim();
                                        thoughtEl.innerText = thought;
                                        if (isThinking && thoughtDetails)
                                            thoughtDetails.style.display =
                                                "block";

                                        // Remove thought from buffer/display
                                        const before = buffer.substring(
                                            0,
                                            tstart
                                        );
                                        const after = buffer.substring(
                                            tend + "</think>".length
                                        );
                                        buffer = before + after;
                                        streamEl.innerText = buffer;
                                    } else if (tstart !== -1) {
                                        // Partial thought
                                        const cleanBuffer = buffer
                                            .replace(
                                                /<think>[\s\S]*?<\/think>/g,
                                                ""
                                            )
                                            .replace(/<think>[\s\S]*/g, "");
                                        streamEl.innerText = cleanBuffer;

                                        // Update thoughtEl with partial thought if we are inside one
                                        if (tstart !== -1 && tend === -1) {
                                            thoughtEl.innerText =
                                                buffer.substring(
                                                    tstart + "<think>".length
                                                );
                                            if (isThinking && thoughtDetails)
                                                thoughtDetails.style.display =
                                                    "block";
                                        }
                                    } else {
                                        streamEl.innerText = buffer;
                                    }
                                }
                                // Handle native reasoning_content if available (e.g. DeepSeek)
                                if (delta.reasoning_content) {
                                    thoughtEl.innerText =
                                        (thoughtEl.innerText || "") +
                                        delta.reasoning_content;
                                    if (isThinking && thoughtDetails)
                                        thoughtDetails.style.display = "block";
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing stream chunk", e);
                        }
                    }
                }
                // auto scroll
                streamEl.scrollTop = streamEl.scrollHeight;
            }
        }
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
})();
