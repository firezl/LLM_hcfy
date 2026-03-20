import { GOOGLE_TRANSLATE_ENDPOINT } from "../constants.js";
import { resolveLanguagePair } from "../language.js";
import { postTranslateError, postTranslateTextResult } from "../port-utils.js";

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
        const res = await fetch(
            `${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`,
            {
                method: "GET",
            },
        );
        if (!res.ok) {
            throw new Error(`Google 翻译请求失败: HTTP ${res.status}`);
        }

        const data = await res.json();
        const segments = Array.isArray(data?.[0]) ? data[0] : [];
        const translated = segments
            .map((item) => (Array.isArray(item) ? item[0] : ""))
            .join("")
            .trim();

        if (!translated) {
            throw new Error("Google 翻译返回为空");
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
