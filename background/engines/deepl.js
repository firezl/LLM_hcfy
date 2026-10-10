import { DEEPL_TRANSLATE_ENDPOINT_FREE } from "../constants.js";
import { fetchWithTimeout, reportTranslateFailure } from "../fetch-utils.js";
import { t, tDetail } from "../i18n.js";
import { resolveLanguagePair } from "../language.js";
import { postTranslateTextResult } from "../port-utils.js";
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

async function requestDeepLTranslate(endpoint, apiKey, from, to, text, requestId, state) {
    const key = String(apiKey || "").trim();
    if (!key) {
        throw new Error(t("translate.deepl.missingKey"));
    }

    const body = buildDeepLRequestBody({
        text,
        from,
        to,
        official: true,
    });

    const res = await fetchWithTimeout(
        endpoint,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...buildDeepLAuthHeaders(key, { official: true }),
            },
            body: JSON.stringify(body),
        },
        { requestId, state },
    );

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
            tDetail("translate.deepl.httpFailed", {
                status: res.status,
                detail: detail ? ` - ${detail}` : "",
            }),
        );
    }

    const data = await res.json();
    const translated = extractDeepLTranslation(data);
    if (!translated) {
        throw new Error(t("translate.deepl.empty"));
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
            requestId,
            state,
        );
        postTranslateTextResult(port, state, requestId, translated);
    } catch (err) {
        reportTranslateFailure(port, state, requestId, err);
    }
}
