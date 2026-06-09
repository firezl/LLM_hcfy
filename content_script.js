// content_script.js — bootstrap entry for content script modules
(function () {
    const shared = globalThis.JYT_SHARED || {};
    const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS;
    const MESSAGE_TYPES = shared.MESSAGE_TYPES || {};

    const app = {
        BUTTON_ID: "jyt-translate-btn",
        BUBBLE_ID: "jyt-translate-bubble",
        MESSAGE_TYPES,
        DEFAULT_SETTINGS,
        PDF_PROMPT_AUTO_CLOSE_MS: 10 * 1000,
        LANG_DETECT_TIMEOUT_MS: 8000,
        TRANSLATE_RESPONSE_TIMEOUT_MS: 30000,
        API_KEY_FIELDS: Object.keys(DEFAULT_SETTINGS || {}).filter((key) =>
            key.endsWith("_api_key") || key.endsWith("_custom_headers"),
        ),
        state: globalThis.JYT_CS_STATE.createSessionState(DEFAULT_SETTINGS),
    };

    const installers = [
        globalThis.JYT_CS_UTILS,
        globalThis.JYT_CS_RUNTIME,
        globalThis.JYT_CS_PDF,
        globalThis.JYT_CS_SETTINGS,
        globalThis.JYT_CS_LANG,
        globalThis.JYT_CS_BROWSER_AI,
        globalThis.JYT_CS_UI,
        globalThis.JYT_CS_PORT,
        globalThis.JYT_CS_ORCHESTRATOR,
    ];

    for (const mod of installers) {
        if (mod && typeof mod.install === "function") {
            mod.install(app);
        }
    }

    globalThis.JYT_CS_BOOTSTRAP.init(app);
})();
