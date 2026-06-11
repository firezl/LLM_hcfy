// content/entry.js — esbuild entry for the content script bundle (do not load in manifest).
import contentUiCss from "../styles/content-ui.css";
import "./modules/state.js";
import "./modules/utils.js";
import "./modules/runtime.js";
import "./modules/settings.js";
import "./modules/lang-detect.js";
import "./modules/browser-translate.js";
import "./modules/pdf-prompt.js";
import "./modules/ui-host.js";
import "./modules/ui.js";
import "./modules/translate-port.js";
import "./modules/translate-orchestrator.js";
import "./modules/bootstrap.js";

(function () {
    const shared = globalThis.JYT_SHARED || {};
    const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS;
    const MESSAGE_TYPES = shared.MESSAGE_TYPES || {};

    const app = {
        ROOT_ID: "jyt-translate-root",
        BUTTON_ID: "jyt-translate-btn",
        BUBBLE_ID: "jyt-translate-bubble",
        CONTENT_UI_CSS: contentUiCss,
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
        globalThis.JYT_CS_UI_HOST,
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
