import { DEEPL_TRANSLATE_ENDPOINT_FREE } from "../constants.js";
import { resolveLanguagePair } from "../language.js";
import { postTranslateError, postTranslateTextResult } from "../port-utils.js";
import {
    buildDeepLAuthHeaders,
    buildDeepLRequestBody,
    extractDeepLTranslation,
} from "./deepl-utils.js";

function resolveDeepLEndpoint(settings) {
    const configured = String(settings?.deepl_api_url || "").trim();
    if (configured) {
        return configured;
    }
    return DEEPL_TRANSLATE_ENDPOINT_FREE;
}

async function requestDeepLTranslate(endpoint, apiKey, from, to, text) {
    const key = String(apiKey || "").trim();
    if (!key) {
        throw new Error("请先在设置中填写 DeepL API Key");
    }

    const body = buildDeepLRequestBody({
        text,
        from,
        to,
        official: true,
    });

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...buildDeepLAuthHeaders(key, { official: true }),
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        let detail = "";
        try {
            const errData = await res.json();
            detail =
                errData?.message ||
                errData?.error?.message ||
                JSON.stringify(errData);
        } catch (err) {
            detail = await res.text();
        }
        throw new Error(
            `DeepL 翻译请求失败: HTTP ${res.status}${detail ? ` - ${detail}` : ""}`,
        );
    }

    const data = await res.json();
    const translated = extractDeepLTranslation(data);
    if (!translated) {
        throw new Error("DeepL 翻译返回为空");
    }

    return translated;
}

export async function streamDeepLTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { from, to } = resolveLanguagePair(request);

    try {
        const endpoint = resolveDeepLEndpoint(settings);
        const translated = await requestDeepLTranslate(
            endpoint,
            settings?.deepl_api_key,
            from,
            to,
            text,
        );
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
