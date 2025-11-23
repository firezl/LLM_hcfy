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

    // --- MD5 Implementation for Baidu ---
    function md5(string) {
        function RotateLeft(lValue, iShiftBits) {
            return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
        }
        function AddUnsigned(lX, lY) {
            var lX4, lY4, lX8, lY8, lResult;
            lX8 = lX & 0x80000000;
            lY8 = lY & 0x80000000;
            lX4 = lX & 0x40000000;
            lY4 = lY & 0x40000000;
            lResult = (lX & 0x3fffffff) + (lY & 0x3fffffff);
            if (lX4 & lY4) {
                return lResult ^ 0x80000000 ^ lX8 ^ lY8;
            }
            if (lX4 | lY4) {
                if (lResult & 0x40000000) {
                    return lResult ^ 0xc0000000 ^ lX8 ^ lY8;
                } else {
                    return lResult ^ 0x40000000 ^ lX8 ^ lY8;
                }
            } else {
                return lResult ^ lX8 ^ lY8;
            }
        }
        function F(x, y, z) {
            return (x & y) | (~x & z);
        }
        function G(x, y, z) {
            return (x & z) | (y & ~z);
        }
        function H(x, y, z) {
            return x ^ y ^ z;
        }
        function I(x, y, z) {
            return y ^ (x | ~z);
        }
        function FF(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }
        function GG(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }
        function HH(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }
        function II(a, b, c, d, x, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }
        function ConvertToWordArray(string) {
            var lWordCount;
            var lMessageLength = string.length;
            var lNumberOfWords_temp1 = lMessageLength + 8;
            var lNumberOfWords_temp2 =
                (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
            var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
            var lWordArray = Array(lNumberOfWords - 1);
            var lBytePosition = 0;
            var lByteCount = 0;
            while (lByteCount < lMessageLength) {
                lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;
                lWordArray[lWordCount] =
                    lWordArray[lWordCount] |
                    (string.charCodeAt(lByteCount) << lBytePosition);
                lByteCount++;
            }
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] =
                lWordArray[lWordCount] | (0x80 << lBytePosition);
            lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
            lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
            return lWordArray;
        }
        function WordToHex(lValue) {
            var WordToHexValue = "",
                WordToHexValue_temp = "",
                lByte,
                lCount;
            for (lCount = 0; lCount <= 3; lCount++) {
                lByte = (lValue >>> (lCount * 8)) & 255;
                WordToHexValue_temp = "0" + lByte.toString(16);
                WordToHexValue =
                    WordToHexValue +
                    WordToHexValue_temp.substr(
                        WordToHexValue_temp.length - 2,
                        2
                    );
            }
            return WordToHexValue;
        }
        function Utf8Encode(string) {
            string = string.replace(/\r\n/g, "\n");
            var utftext = "";
            for (var n = 0; n < string.length; n++) {
                var c = string.charCodeAt(n);
                if (c < 128) {
                    utftext += String.fromCharCode(c);
                } else if (c > 127 && c < 2048) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                } else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                }
            }
            return utftext;
        }
        var x = Array();
        var k, AA, BB, CC, DD, a, b, c, d;
        var S11 = 7,
            S12 = 12,
            S13 = 17,
            S14 = 22;
        var S21 = 5,
            S22 = 9,
            S23 = 14,
            S24 = 20;
        var S31 = 4,
            S32 = 11,
            S33 = 16,
            S34 = 23;
        var S41 = 6,
            S42 = 10,
            S43 = 15,
            S44 = 21;
        string = Utf8Encode(string);
        x = ConvertToWordArray(string);
        a = 0x67452301;
        b = 0xefcdab89;
        c = 0x98badcfe;
        d = 0x10325476;
        for (k = 0; k < x.length; k += 16) {
            AA = a;
            BB = b;
            CC = c;
            DD = d;
            a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478);
            d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
            c = FF(c, d, a, b, x[k + 2], S13, 0x242070db);
            b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
            a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf);
            d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
            c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613);
            b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
            a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8);
            d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
            c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1);
            b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
            a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122);
            d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
            c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e);
            b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
            a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562);
            d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
            c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51);
            b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
            a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d);
            d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
            c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681);
            b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
            a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6);
            d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
            c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87);
            b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
            a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905);
            d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
            c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9);
            b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
            a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942);
            d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
            c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122);
            b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
            a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44);
            d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
            c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60);
            b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
            a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6);
            d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
            c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085);
            b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05);
            a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039);
            d = HH(d, a, b, c, x[k + 12], S32, 0xe6db99e5);
            c = HH(c, d, a, b, x[k + 15], S33, 0x1fa27cf8);
            b = HH(b, c, d, a, x[k + 2], S34, 0xc4ac5665);
            a = II(a, b, c, d, x[k + 0], S41, 0xf4292244);
            d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
            c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7);
            b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
            a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3);
            d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
            c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d);
            b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
            a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f);
            d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
            c = II(c, d, a, b, x[k + 6], S43, 0xa3014314);
            b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
            a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82);
            d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
            c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb);
            b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
            a = AddUnsigned(a, AA);
            b = AddUnsigned(b, BB);
            c = AddUnsigned(c, CC);
            d = AddUnsigned(d, DD);
        }
        var temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);
        return temp.toLowerCase();
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
