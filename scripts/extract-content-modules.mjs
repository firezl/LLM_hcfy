import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "content/modules");
fs.mkdirSync(outDir, { recursive: true });

const gitSrc = fs.readFileSync(path.join(root, "content_script.js"), "utf8");
const src =
    gitSrc.includes("Handles selection UI") ||
    gitSrc.includes("function withTimeout")
        ? gitSrc
        : execSync("git show HEAD:content_script.js", {
              cwd: root,
              encoding: "utf8",
          });
const lines = src.split("\n");

function slice(start, end) {
    return lines.slice(start - 1, end).join("\n");
}

const STATE_VARS = [
    "lastSelection",
    "isPinned",
    "translatePort",
    "activeRequest",
    "translateGeneration",
    "lastTranslateContext",
    "copyStatusTimer",
    "runtimeSettings",
    "pdfPromptState",
    "pdfPromptEl",
    "pdfPromptAutoCloseTimer",
    "pdfPromptCountdownInterval",
    "translatePortClosing",
    "translationModelReady",
    "languageDetectorModelReady",
    "languageDetectorInstance",
];

const CONST_REFS = [
    "BUTTON_ID",
    "BUBBLE_ID",
    "MESSAGE_TYPES",
    "DEFAULT_SETTINGS",
    "API_KEY_FIELDS",
    "PDF_PROMPT_AUTO_CLOSE_MS",
    "LANG_DETECT_TIMEOUT_MS",
    "TRANSLATE_RESPONSE_TIMEOUT_MS",
];

const ALL_FN_NAMES = [
    "withTimeout",
    "clearActiveRequestTimeout",
    "armActiveRequestTimeout",
    "touchActiveRequestTimeout",
    "drainRuntimeLastError",
    "isBfcachePortError",
    "releaseTranslatePortForPageHide",
    "handleTranslatePortDisconnect",
    "normalizeGlossaryLang",
    "normalizeTermText",
    "getRuntimeApi",
    "sendTermMessage",
    "isLikelyPdfUrl",
    "ensurePdfPrompt",
    "updatePdfPromptStatus",
    "hidePdfPrompt",
    "clearPdfPromptAutoCloseTimer",
    "updatePdfPromptCountdown",
    "openPdfInBrowser",
    "schedulePdfPromptAutoClose",
    "setPdfPromptOpenEnabled",
    "showPdfPrompt",
    "checkPdfUrlAndUpdatePrompt",
    "registerPdfRuntimeListener",
    "restorePendingPdfPrompt",
    "getCleanTranslatedText",
    "getEffectiveEngine",
    "getEffectiveModel",
    "setBubbleState",
    "setCopyButtonStatus",
    "copyTranslatedText",
    "saveTranslationHistory",
    "setTermTip",
    "clearTermEditorUI",
    "upsertGlossaryTerm",
    "showAddTermDialog",
    "trimEdgeBlankLines",
    "clampPercent",
    "applyBubbleSizeConfig",
    "applyTheme",
    "createButton",
    "createBubble",
    "updatePinState",
    "setBubbleLoading",
    "positionButton",
    "positionBubble",
    "hideButton",
    "loadRuntimeSettings",
    "parseShortcut",
    "isShortcutPressed",
    "getSelectionAnchorPoint",
    "detectLangHeuristic",
    "normalizeBasicLang",
    "detectBrowserLangByNavigator",
    "detectTextLangByChromeI18n",
    "isBrowserAITranslatorSupported",
    "isBrowserAILanguageDetectorSupported",
    "detectLangByLanguageDetector",
    "getBrowserTranslator",
    "translateWithBrowserAPI",
    "resetTranslatePort",
    "ensureTranslatePort",
    "sendTranslateStart",
    "cancelActiveTranslateRequest",
    "renderContentAndThought",
    "startBackgroundTranslate",
    "maybeNormalizePdfSelectionText",
    "translateText",
    "onTranslateClick",
    "triggerTranslate",
];

function transformCode(code, localFns, indent = 8) {
    let result = code;

    for (const v of STATE_VARS) {
        result = result.replace(new RegExp(`\\b${v}\\b`, "g"), `state.${v}`);
    }

    for (const c of CONST_REFS) {
        result = result.replace(new RegExp(`\\b${c}\\b`, "g"), `app.${c}`);
    }

    result = result.replace(
        /\btranslatorCache\b/g,
        "state.translatorCache",
    );

    for (const fn of ALL_FN_NAMES) {
        if (localFns.includes(fn)) continue;
        result = result.replace(
            new RegExp(`\\b${fn}\\s*(\\()`, "g"),
            `app.${fn}$1`,
        );
    }

    const pad = " ".repeat(indent);
    return result
        .split("\n")
        .map((line) => (line.trim() ? pad + line : line))
        .join("\n");
}

function buildModule(name, globalName, lineRanges, localFns, extra = "") {
    const chunks = lineRanges.map(([s, e]) => slice(s, e)).join("\n\n");
    const transformed = transformCode(chunks, localFns);

    return `// content/modules/${name} — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
${transformed}
        Object.assign(app, {
            ${localFns.join(",\n            ")},
        });
    }

    global.${globalName} = { install${extra ? `, ${extra}` : ""} };
})(globalThis);
`;
}

const modules = [
    [
        "utils.js",
        "JYT_CS_UTILS",
        [[31, 54], [136, 146], [855, 866]],
        [
            "withTimeout",
            "normalizeGlossaryLang",
            "normalizeTermText",
            "trimEdgeBlankLines",
            "clampPercent",
        ],
    ],
    [
        "runtime.js",
        "JYT_CS_RUNTIME",
        [[82, 96], [148, 195]],
        ["drainRuntimeLastError", "getRuntimeApi", "sendTermMessage"],
    ],
    [
        "pdf-prompt.js",
        "JYT_CS_PDF",
        [[197, 586]],
        [
            "isLikelyPdfUrl",
            "ensurePdfPrompt",
            "updatePdfPromptStatus",
            "hidePdfPrompt",
            "clearPdfPromptAutoCloseTimer",
            "updatePdfPromptCountdown",
            "openPdfInBrowser",
            "schedulePdfPromptAutoClose",
            "setPdfPromptOpenEnabled",
            "showPdfPrompt",
            "checkPdfUrlAndUpdatePrompt",
            "registerPdfRuntimeListener",
            "restorePendingPdfPrompt",
        ],
    ],
    [
        "settings.js",
        "JYT_CS_SETTINGS",
        [[588, 647], [1057, 1132]],
        [
            "getCleanTranslatedText",
            "getEffectiveEngine",
            "getEffectiveModel",
            "loadRuntimeSettings",
            "parseShortcut",
            "isShortcutPressed",
        ],
    ],
    [
        "lang-detect.js",
        "JYT_CS_LANG",
        [[1134, 1200], [1209, 1286]],
        [
            "getSelectionAnchorPoint",
            "detectLangHeuristic",
            "normalizeBasicLang",
            "detectBrowserLangByNavigator",
            "detectTextLangByChromeI18n",
            "isBrowserAILanguageDetectorSupported",
            "detectLangByLanguageDetector",
        ],
    ],
    [
        "browser-translate.js",
        "JYT_CS_BROWSER_AI",
        [[1201, 1207], [1288, 1349]],
        [
            "isBrowserAITranslatorSupported",
            "getBrowserTranslator",
            "translateWithBrowserAPI",
        ],
    ],
    [
        "ui.js",
        "JYT_CS_UI",
        [[649, 696], [721, 853], [875, 1055]],
        [
            "setBubbleState",
            "setCopyButtonStatus",
            "copyTranslatedText",
            "saveTranslationHistory",
            "setTermTip",
            "clearTermEditorUI",
            "upsertGlossaryTerm",
            "showAddTermDialog",
            "applyBubbleSizeConfig",
            "applyTheme",
            "createButton",
            "createBubble",
            "updatePinState",
            "setBubbleLoading",
            "positionButton",
            "positionBubble",
            "hideButton",
        ],
    ],
    [
        "translate-port.js",
        "JYT_CS_PORT",
        [[56, 78], [98, 129], [1351, 1692]],
        [
            "clearActiveRequestTimeout",
            "armActiveRequestTimeout",
            "touchActiveRequestTimeout",
            "isBfcachePortError",
            "releaseTranslatePortForPageHide",
            "handleTranslatePortDisconnect",
            "resetTranslatePort",
            "ensureTranslatePort",
            "sendTranslateStart",
            "cancelActiveTranslateRequest",
            "renderContentAndThought",
            "startBackgroundTranslate",
        ],
    ],
];

for (const [file, globalName, ranges, fns] of modules) {
    fs.writeFileSync(
        path.join(outDir, file),
        buildModule(file, globalName, ranges, fns),
    );
}

// orchestrator with engine table refactor
const orchestratorBase = slice(1694, 1785);
const orchestratorAuto = slice(1939, 1993);
const orchestratorTail = slice(1995, 2017);

const engineTableDispatch = `        const BACKGROUND_ENGINE_THOUGHTS = {
            ollama: "ollama_show_thoughts",
            claude: "claude_show_thoughts",
            gemini: "gemini_show_thoughts",
            deepseek: "deepseek_show_thoughts",
            siliconflow: "siliconflow_show_thoughts",
            qwen: "qwen_show_thoughts",
            glm: "glm_show_thoughts",
            xiaomi: "xiaomi_show_thoughts",
            custom_openai: "custom_openai_show_thoughts",
            openrouter: "openrouter_show_thoughts",
        };

        const backgroundEngine = BACKGROUND_ENGINE_THOUGHTS[engine];
        if (backgroundEngine) {
            startBackgroundTranslate(
                text,
                from,
                to,
                settings,
                streamEl,
                thoughtEl,
                thoughtDetails,
                {
                    allowBrowserFallback: false,
                    isThinking: !!settings[backgroundEngine],
                },
            );
            return;
        }
`;

const orchestratorJs = `// content/modules/translate-orchestrator.js
(function (global) {
    function install(app) {
        const state = app.state;

${transformCode(orchestratorBase, ["maybeNormalizePdfSelectionText", "translateText"], 8)}

${transformCode(engineTableDispatch, ["translateText"], 8)}

${transformCode(orchestratorAuto, ["translateText"], 8)}

${transformCode(orchestratorTail, ["onTranslateClick", "triggerTranslate"], 8)}

        Object.assign(app, {
            maybeNormalizePdfSelectionText,
            translateText,
            onTranslateClick,
            triggerTranslate,
        });
    }

    global.JYT_CS_ORCHESTRATOR = { install };
})(globalThis);
`;

fs.writeFileSync(path.join(outDir, "translate-orchestrator.js"), orchestratorJs);

// bootstrap
const bootstrapJs = `// content/modules/bootstrap.js — event wiring and startup
(function (global) {
    function init(app) {
        const state = app.state;

        app.createButton();
        app.createBubble();
        app.loadRuntimeSettings();
        app.registerPdfRuntimeListener();
        void app.restorePendingPdfPrompt();

        window
            .matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", () => {
                if (state.runtimeSettings.theme_mode === "auto") {
                    app.applyTheme("auto");
                }
            });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync") {
                for (const key of Object.keys(changes)) {
                    state.runtimeSettings[key] = changes[key].newValue;
                    if (key === "theme_mode") {
                        app.applyTheme(changes[key].newValue);
                    }
                }
                return;
            }

            if (area === "local") {
                for (const key of Object.keys(changes)) {
                    if (!app.API_KEY_FIELDS.includes(key)) {
                        continue;
                    }
                    state.runtimeSettings[key] = String(
                        changes[key].newValue || "",
                    );
                }
            }
        });

${transformCode(slice(2055, 2162), [], 8)}

        window.addEventListener("pagehide", () => {
            app.hidePdfPrompt();
            app.releaseTranslatePortForPageHide();
        });

        window.addEventListener("pageshow", (event) => {
            if (!event.persisted) return;
            app.releaseTranslatePortForPageHide();
        });
    }

    global.JYT_CS_BOOTSTRAP = { init };
})(globalThis);
`;

fs.writeFileSync(path.join(outDir, "bootstrap.js"), bootstrapJs);

// state.js
fs.writeFileSync(
    path.join(outDir, "state.js"),
    `// content/modules/state.js
(function (global) {
    function createSessionState(defaultSettings) {
        return {
            lastSelection: "",
            isPinned: false,
            translatePort: null,
            activeRequest: null,
            translateGeneration: 0,
            lastTranslateContext: null,
            copyStatusTimer: null,
            runtimeSettings: { ...defaultSettings },
            pdfPromptState: null,
            pdfPromptEl: null,
            pdfPromptAutoCloseTimer: null,
            pdfPromptCountdownInterval: null,
            translatorCache: new Map(),
            translationModelReady: false,
            languageDetectorModelReady: false,
            languageDetectorInstance: null,
            translatePortClosing: false,
        };
    }

    global.JYT_CS_STATE = { createSessionState };
})(globalThis);
`,
);

// content/entry.js bootstrap
const contentEntry = `// content/entry.js — esbuild entry for the content script bundle (do not load in manifest).
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
`;

fs.writeFileSync(path.join(root, "content/entry.js"), contentEntry);

console.log("Generated content modules and content/entry.js bootstrap");
