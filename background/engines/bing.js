import { BING_AUTH_TTL_MS, BING_TRANSLATOR_PAGE_URL } from "../constants.js";
import { resolveLanguagePair } from "../language.js";
import { postTranslateError, postTranslateTextResult } from "../port-utils.js";

const bingAuthCache = {
    key: "",
    token: "",
    ig: "",
    iid: "translator.5028",
    hostOrigin: "https://www.bing.com",
    expiresAt: 0,
};

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
    const pairMatch = helperRaw.match(/(\"([^\"]+)\"|\d+)\s*,\s*\"([^\"]+)\"/);
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

export async function streamBingTranslate(request, port, state) {
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
