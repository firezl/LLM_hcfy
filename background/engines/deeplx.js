import { DEEPLX_TRANSLATE_ENDPOINT } from "../constants.js";
import { fetchWithTimeout, reportTranslateFailure } from "../fetch-utils.js";
import { t, tDetail } from "../i18n.js";
import { resolveLanguagePair } from "../language.js";
import { postTranslateTextResult } from "../port-utils.js";
import {
    buildDeepLAuthHeaders,
    buildDeepLRequestBody,
    extractDeepLTranslation,
    isOfficialDeepLEndpoint,
} from "./deepl-utils.js";

function resolveDeepLXEndpoint(settings) {
    const configured = String(settings?.deeplx_api_url || "").trim();
    return configured || DEEPLX_TRANSLATE_ENDPOINT;
}

async function requestDeepLXTranslate(endpoint, apiKey, from, to, text, requestId, state) {
    const official = isOfficialDeepLEndpoint(endpoint);
    const body = buildDeepLRequestBody({
        text,
        from,
        to,
        official,
    });

    const headers = {
        "Content-Type": "application/json",
        ...buildDeepLAuthHeaders(apiKey, { official }),
    };

    const res = await fetchWithTimeout(
        endpoint,
        {
            method: "POST",
            headers,
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
                (typeof errData?.data === "string" ? errData.data : "") ||
                JSON.stringify(errData);
        } catch (err) {
            detail = await res.text();
        }
        throw new Error(
            tDetail("translate.deeplx.httpFailed", {
                status: res.status,
                detail: detail ? ` - ${detail}` : "",
            }),
        );
    }

    const data = await res.json();
    const translated = extractDeepLTranslation(data);
    if (!translated) {
        throw new Error(t("translate.deeplx.empty"));
    }

    return translated;
}

export async function streamDeepLXTranslate(request, port, state) {
    const { requestId, text, settings } = request;
    const { from, to } = resolveLanguagePair(request);

    try {
        const endpoint = resolveDeepLXEndpoint(settings);
        const translated = await requestDeepLXTranslate(
            endpoint,
            settings?.deeplx_api_key,
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
