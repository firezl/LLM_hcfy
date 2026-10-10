import { GOOGLE_TRANSLATE_ENDPOINT } from "../constants.js";
import { fetchWithTimeout, reportTranslateFailure } from "../fetch-utils.js";
import { t, tDetail } from "../i18n.js";
import { resolveLanguagePair } from "../language.js";
import { postTranslateTextResult } from "../port-utils.js";

export async function streamGoogleTranslate(request, port, state) {
    const { requestId, text } = request;
    const { from, to } = resolveLanguagePair(request);
    const params = new URLSearchParams({
        client: "gtx",
        sl: from || "auto",
        tl: to,
        dt: "t",
        q: String(text || ""),
    });

    try {
        const res = await fetchWithTimeout(
            `${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`,
            {
                method: "GET",
            },
            { requestId, state },
        );
        if (!res.ok) {
            throw new Error(
                tDetail("translate.google.httpFailed", { status: res.status }),
            );
        }

        const data = await res.json();
        const segments = Array.isArray(data?.[0]) ? data[0] : [];
        const translated = segments
            .map((item) => (Array.isArray(item) ? item[0] : ""))
            .join("")
            .trim();

        if (!translated) {
            throw new Error(t("translate.google.empty"));
        }

        postTranslateTextResult(port, state, requestId, translated);
    } catch (err) {
        reportTranslateFailure(port, state, requestId, err);
    }
}
