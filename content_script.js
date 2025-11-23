// content_script.js
// 负责监听划词、显示翻译按钮与弹窗，调用翻译适配器并支持 OpenAI 流式输出

(function () {
    const BUTTON_ID = "jyt-translate-btn";
    const BUBBLE_ID = "jyt-translate-bubble";

    let lastSelection = "";

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
        <button class="jyt-close">×</button>
      </div>
      <div class="jyt-content">
        <div class="jyt-stream" id="jyt-stream"></div>
        <details class="jyt-thought" id="jyt-thought"><summary>思考（展开）</summary><div id="jyt-thought-content"></div></details>
      </div>
    `;
        document.body.appendChild(b);
        b.querySelector(".jyt-close").addEventListener(
            "click",
            () => (b.style.display = "none")
        );
        return b;
    }

    function onTranslateClick(e) {
        const selection = lastSelection.trim();
        if (!selection) return;
        const bubble = createBubble();
        bubble.style.display = "block";
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

    function positionButton(btn, rect) {
        const x = rect.right - 50 + window.scrollX;
        const y = rect.bottom + 8 + window.scrollY;
        btn.style.left = x + "px";
        btn.style.top = y + "px";
        btn.style.display = "block";
    }

    function positionBubble(bubble, x, y) {
        bubble.style.left = x + 8 + "px";
        bubble.style.top = y + 8 + "px";
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
            if (engine === "openai") {
                // custom OpenAI-like API with streaming support
                await openaiTranslateStream(
                    text,
                    from,
                    to,
                    settings,
                    streamEl,
                    thoughtEl,
                    thoughtDetails // Pass details element to control visibility
                );
            } else if (engine === "google") {
                const res = await googleTranslate(text, from, to, settings);
                streamEl.innerText = res;
            } else if (engine === "bing") {
                const res = await bingTranslate(text, from, to, settings);
                streamEl.innerText = res;
            } else if (engine === "baidu") {
                const res = await baiduTranslate(text, from, to, settings);
                streamEl.innerText = res;
            } else {
                // auto choose OpenAI if api key exists, otherwise fallback to Google/Bing
                if (settings.openai_api_key && settings.openai_api_url) {
                    await openaiTranslateStream(
                        text,
                        from,
                        to,
                        settings,
                        streamEl,
                        thoughtEl
                    );
                } else {
                    const res = await googleTranslate(text, from, to, settings);
                    streamEl.innerText = res;
                }
            }
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
    async function googleTranslate(text, from, to, settings) {
        // requires user to set Google Cloud Translate API key in settings.openai_api_key (reuse field) or extend settings
        const key = settings.google_api_key || settings.openai_api_key;
        if (!key) throw new Error("缺少 Google API Key，请在扩展设置中配置");
        const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
            key
        )}`;
        const body = {
            q: text,
            target: to === "zh" ? "zh-CN" : "en",
            format: "text",
        };
        const r = await fetch(url, {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        });
        const j = await r.json();
        if (j.error) throw new Error(j.error.message || "Google 翻译错误");
        return j.data.translations[0].translatedText;
    }

    async function bingTranslate(text, from, to, settings) {
        const key = settings.bing_api_key;
        const region = settings.bing_region || "";
        if (!key) throw new Error("缺少 Bing 翻译 API Key，请在扩展设置中配置");
        const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(
            to === "zh" ? "zh-Hans" : "en"
        )}`;
        const r = await fetch(url, {
            method: "POST",
            body: JSON.stringify([{ Text: text }]),
            headers: {
                "Ocp-Apim-Subscription-Key": key,
                "Content-Type": "application/json",
                "Ocp-Apim-Subscription-Region": region,
            },
        });
        const j = await r.json();
        if (j.error) throw new Error(JSON.stringify(j));
        return j[0].translations[0].text;
    }

    async function baiduTranslate(text, from, to, settings) {
        // Baidu Translate requires appid+secret + sign.
        const appid = settings.baidu_appid;
        const secret = settings.baidu_secret;
        if (!appid || !secret)
            throw new Error("缺少百度翻译 AppID/Secret，请在扩展设置中配置");

        const url = `https://fanyi-api.baidu.com/api/trans/vip/translate`;
        const salt = Date.now();
        const sign = md5(appid + text + salt + secret);
        const params = new URLSearchParams();
        params.append("q", text);
        params.append("from", from === "zh" ? "zh" : "auto");
        params.append("to", to === "zh" ? "zh" : "en");
        params.append("appid", appid);
        params.append("salt", salt);
        params.append("sign", sign);
        const r = await fetch(url + "?" + params.toString());
        const j = await r.json();
        if (j.error_code) throw new Error(JSON.stringify(j));
        return j.trans_result.map((t) => t.dst).join("\n");
    }

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
        }。输入:\n${text}`;
        if (isThinking) {
            prompt = `请把这段文字翻译为${
                to === "zh" ? "中文" : "英文"
            }，并在输出中包含思考部分，用特殊分隔符<<<THOUGHT>>>思考内容<<<END>>>。只需返回翻译内容的文字流和思考（可选）。输入:\n${text}`;
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
                                    const tstart =
                                        buffer.indexOf("<<<THOUGHT>>>");
                                    const tend = buffer.indexOf("<<<END>>>");

                                    if (
                                        tstart !== -1 &&
                                        tend !== -1 &&
                                        tend > tstart
                                    ) {
                                        // Extract thought
                                        const thought = buffer
                                            .substring(
                                                tstart + "<<<THOUGHT>>>".length,
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
                                            tend + "<<<END>>>".length
                                        );
                                        buffer = before + after;
                                        streamEl.innerText = buffer;
                                    } else if (tstart !== -1) {
                                        // Partial thought
                                        const cleanBuffer = buffer
                                            .replace(
                                                /<<<THOUGHT>>>[\s\S]*?<<<END>>>/g,
                                                ""
                                            )
                                            .replace(
                                                /<<<THOUGHT>>>[\s\S]*/g,
                                                ""
                                            );
                                        streamEl.innerText = cleanBuffer;

                                        // Update thoughtEl with partial thought if we are inside one
                                        if (tstart !== -1 && tend === -1) {
                                            thoughtEl.innerText =
                                                buffer.substring(
                                                    tstart +
                                                        "<<<THOUGHT>>>".length
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
        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel) {
                hideButton();
                return;
            }
            const text = sel.toString();
            if (text && text.trim().length > 0) {
                lastSelection = text;
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                if (rect) positionButton(btn, rect);
            } else {
                hideButton();
            }
        }, 10);
    });

    // hide UI on scroll or click outside
    document.addEventListener(
        "scroll",
        () => {
            hideButton();
        },
        true
    );
    document.addEventListener("click", (e) => {
        const btn = document.getElementById(BUTTON_ID);
        const bubble = document.getElementById(BUBBLE_ID);
        if (!btn) return;
        if (e.target === btn) return;
        if (bubble && bubble.contains(e.target)) return;
        hideButton();
    });
})();
