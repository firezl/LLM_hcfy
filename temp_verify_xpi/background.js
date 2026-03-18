// background.js
// Service worker translation runtime: orchestrates translation work and streams back progress/results.

const PORT_NAME = "jyt-translate";
const MESSAGE_TYPE_START = "TRANSLATE_START";
const PDF_VIEWER_PATH = "vendor/pdfjs/web/viewer.html";

function isInternalPdfViewerUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }
    return url.startsWith(chrome.runtime.getURL(PDF_VIEWER_PATH));
}

function isLikelyPdfUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }

    if (isInternalPdfViewerUrl(url)) {
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

function resolvePdfUrlForRedirect(url) {
    if (!url || typeof url !== "string") {
        return null;
    }

    if (isInternalPdfViewerUrl(url)) {
        return null;
    }

    if (isLikelyPdfUrl(url)) {
        return url;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return null;
    }

    const isFirefoxBuiltinViewer =
        parsed.protocol === "resource:" &&
        parsed.pathname.includes("/pdf.js/web/viewer.html");
    if (!isFirefoxBuiltinViewer) {
        return null;
    }

    const embeddedFile = parsed.searchParams.get("file");
    if (!embeddedFile) {
        return null;
    }

    let normalizedFile = embeddedFile;
    try {
        normalizedFile = decodeURIComponent(embeddedFile);
    } catch (err) {
        // keep raw value when decode fails
    }

    return isLikelyPdfUrl(normalizedFile) ? normalizedFile : null;
}

function toInternalPdfViewerUrl(pdfUrl) {
    return chrome.runtime.getURL(
        `${PDF_VIEWER_PATH}?file=${encodeURIComponent(pdfUrl)}`,
    );
}

function isIgnorableTabUpdateError(errorLike) {
    const message = String(
        (errorLike && errorLike.message) || errorLike || "",
    ).toLowerCase();
    return (
        message.includes("invalid tab id") ||
        message.includes("no tab with id") ||
        message.includes("tab not found")
    );
}

function safeUpdateTabUrl(tabId, url) {
    if (!Number.isInteger(tabId) || tabId < 0 || !url) {
        return;
    }

    try {
        const maybePromise = chrome.tabs.update(tabId, { url }, () => {
            const err = chrome.runtime.lastError;
            if (err && !isIgnorableTabUpdateError(err)) {
                console.warn("tabs.update failed", err);
            }
        });

        if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.catch((err) => {
                if (!isIgnorableTabUpdateError(err)) {
                    console.warn("tabs.update failed", err);
                }
            });
        }
    } catch (err) {
        if (!isIgnorableTabUpdateError(err)) {
            console.warn("tabs.update failed", err);
        }
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

function buildPrompt(text, to) {
    return `请把这段文字翻译为${to === "zh" ? "中文" : "英文"}，不要有多余的输出。输入:\n${text}`;
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

async function streamOpenAITranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { to } = resolveLanguagePair(request);
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
        messages: [{ role: "user", content: buildPrompt(text, to) }],
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

async function handleTranslateStart(message, port, state) {
    const engine = message?.settings?.engine || "auto";

    if (engine === "browser") {
        postTranslateError(
            port,
            state,
            message.requestId,
            "浏览器 Translation API 不支持在扩展 service worker 中运行，请使用 auto 或 openai",
        );
        return;
    }

    await streamOpenAITranslate(message, port, state);
}

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
        if (!message || message.type !== MESSAGE_TYPE_START) {
            return;
        }
        handleTranslateStart(message, port, state);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const nextUrl = changeInfo.url || tab?.url;
    const pdfUrl = resolvePdfUrlForRedirect(nextUrl);
    if (!pdfUrl) {
        return;
    }

    const targetUrl = toInternalPdfViewerUrl(pdfUrl);
    safeUpdateTabUrl(tabId, targetUrl);
});
