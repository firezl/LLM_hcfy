import { BING_AUTH_TTL_MS, BING_TRANSLATOR_PAGE_URL } from "../constants.js";
import {
    fetchWithTimeout,
    isFetchTimeoutError,
    isUserAbortError,
    reportTranslateFailure,
} from "../fetch-utils.js";
import { t, tDetail } from "../i18n.js";
import { resolveLanguagePair } from "../language.js";
import { postTranslateTextResult } from "../port-utils.js";

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
        throw new Error(t("translate.bing.authParseFailed"));
    }

    const helperRaw = helperMatch[1];
    const pairMatch = helperRaw.match(/(\"([^\"]+)\"|\d+)\s*,\s*\"([^\"]+)\"/);
    if (!pairMatch) {
        throw new Error(t("translate.bing.authFormatInvalid"));
    }

    const key = String((pairMatch[2] || pairMatch[1] || "").replace(/\"/g, ""));
    const token = String(pairMatch[3] || "");
    const ig = String(igMatch[1] || "");
    const iid = String(iidMatch?.[1] || "translator.5028");

    if (!key || !token || !ig) {
        throw new Error(t("translate.bing.authIncomplete"));
    }

    return { key, token, ig, iid };
}

async function ensureBingAuth(forceRefresh, requestId, state) {
    if (
        !forceRefresh &&
        bingAuthCache.key &&
        bingAuthCache.token &&
        bingAuthCache.ig &&
        Date.now() < bingAuthCache.expiresAt
    ) {
        return { ...bingAuthCache };
    }

    const pageRes = await fetchWithTimeout(
        BING_TRANSLATOR_PAGE_URL,
        {
            method: "GET",
            cache: "no-store",
        },
        { requestId, state },
    );
    if (!pageRes.ok) {
        throw new Error(
            tDetail("translate.bing.pageFailed", { status: pageRes.status }),
        );
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

async function requestBingTranslate(from, to, text, forceAuthRefresh, requestId, state) {
    const auth = await ensureBingAuth(!!forceAuthRefresh, requestId, state);
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

    const res = await fetchWithTimeout(
        endpoint.toString(),
        {
            method: "POST",
            headers: {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            },
            body: body.toString(),
        },
        { requestId, state },
    );

    if (!res.ok) {
        throw new Error(
            tDetail("translate.bing.httpFailed", { status: res.status }),
        );
    }

    const raw = await res.text();
    if (!raw || !raw.trim()) {
        throw new Error(t("translate.bing.emptyResponse"));
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        const snippet = raw.slice(0, 120).replace(/\s+/g, " ");
        throw new Error(tDetail("translate.bing.nonJson", { snippet }));
    }

    const translated = Array.isArray(data)
        ? data
              .map((item) => item?.translations?.[0]?.text || "")
              .join("\n")
              .trim()
        : "";

    if (!translated) {
        throw new Error(t("translate.bing.empty"));
    }

    return translated;
}

export async function streamBingTranslate(request, port, state) {
    const { requestId, text } = request;
    const { from, to } = resolveLanguagePair(request);

    try {
        let translated = "";
        try {
            translated = await requestBingTranslate(
                from,
                to,
                text,
                false,
                requestId,
                state,
            );
        } catch (firstErr) {
            if (isUserAbortError(firstErr) || isFetchTimeoutError(firstErr)) {
                throw firstErr;
            }
            translated = await requestBingTranslate(
                from,
                to,
                text,
                true,
                requestId,
                state,
            );
        }

        postTranslateTextResult(port, state, requestId, translated);
    } catch (err) {
        reportTranslateFailure(port, state, requestId, err);
    }
}
