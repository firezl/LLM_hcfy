// content/modules/settings.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function getCleanTranslatedText() {
                const bubble = document.getElementById(app.BUBBLE_ID);
                if (!bubble) return "";
                const streamEl = bubble.querySelector("#jyt-stream");
                if (!streamEl) return "";
                return app.trimEdgeBlankLines(
                    String(streamEl.innerText || "")
                        .replace(/<think>[\s\S]*?<\/think>/g, "")
                        .replace(/<think>[\s\S]*/g, ""),
                );
            }

            function getEffectiveEngine(settings) {
                const selectedEngine = String(settings?.engine || "auto").trim();
                if (selectedEngine === "llm") {
                    return String(settings?.llm_engine || "openai").trim() || "openai";
                }
                return selectedEngine || "auto";
            }

            function getEffectiveModel(settings, engine) {
                const keyByEngine = {
                    auto: "openai_model",
                    openai: "openai_model",
                    custom_openai: "custom_openai_model",
                    openrouter: "openrouter_model",
                    deepseek: "deepseek_model",
                    siliconflow: "siliconflow_model",
                    qwen: "qwen_model",
                    glm: "glm_model",
                    xiaomi: "xiaomi_model",
                    grok: "grok_model",
                    nim: "nim_model",
                    claude: "claude_model",
                    gemini: "gemini_model",
                    ollama: "ollama_model",
                    special_translate: "special_translate_model",
                };
                const customKeyByEngine = {
                    openai: "openai_custom_model",
                    custom_openai: "custom_openai_custom_model",
                    openrouter: "openrouter_custom_model",
                    deepseek: "deepseek_custom_model",
                    siliconflow: "siliconflow_custom_model",
                    qwen: "qwen_custom_model",
                    glm: "glm_custom_model",
                    xiaomi: "xiaomi_custom_model",
                    grok: "grok_custom_model",
                    nim: "nim_custom_model",
                    claude: "claude_custom_model",
                    gemini: "gemini_custom_model",
                    ollama: "ollama_custom_model",
                    special_translate: "special_translate_custom_model",
                };
                const modelKey = keyByEngine[engine] || keyByEngine.auto;
                const customKey = customKeyByEngine[engine];
                const model = String(settings?.[modelKey] || "").trim();
                if (model === "custom" && customKey) {
                    return String(settings?.[customKey] || "").trim();
                }
                return model;
            }

            function loadRuntimeSettings() {
                chrome.storage.sync.get(app.DEFAULT_SETTINGS, (syncItems) => {
                    const syncErr = chrome.runtime.lastError;
                    const safeSyncItems = syncErr ? {} : syncItems || {};

                    chrome.storage.local.get(app.API_KEY_FIELDS, (localItems) => {
                        const localErr = chrome.runtime.lastError;
                        const safeLocalItems = localErr ? {} : localItems || {};
                        state.runtimeSettings = {
                            ...app.DEFAULT_SETTINGS,
                            ...safeSyncItems,
                            ...safeLocalItems,
                        };
                        app.applyTheme(state.runtimeSettings.theme_mode || "auto");
                    });
                });
            }

            function parseShortcut(shortcut) {
                const raw = String(shortcut || "").trim();
                if (!raw) return null;

                const parts = raw
                    .split("+")
                    .map((part) => part.trim())
                    .filter(Boolean);

                const cfg = {
                    ctrl: false,
                    alt: false,
                    shift: false,
                    meta: false,
                    key: "",
                };
                for (const part of parts) {
                    const lower = part.toLowerCase();
                    if (lower === "ctrl" || lower === "control") {
                        cfg.ctrl = true;
                        continue;
                    }
                    if (lower === "alt") {
                        cfg.alt = true;
                        continue;
                    }
                    if (lower === "shift") {
                        cfg.shift = true;
                        continue;
                    }
                    if (
                        lower === "meta" ||
                        lower === "cmd" ||
                        lower === "command" ||
                        lower === "win"
                    ) {
                        cfg.meta = true;
                        continue;
                    }
                    cfg.key = lower;
                }

                return cfg.key ? cfg : null;
            }

            function isShortcutPressed(e, shortcut) {
                const cfg = parseShortcut(shortcut);
                if (!cfg) return false;

                const key = String(e.key || "").toLowerCase();
                return (
                    e.ctrlKey === cfg.ctrl &&
                    e.altKey === cfg.alt &&
                    e.shiftKey === cfg.shift &&
                    e.metaKey === cfg.meta &&
                    key === cfg.key
                );
            }
        Object.assign(app, {
            getCleanTranslatedText,
            getEffectiveEngine,
            getEffectiveModel,
            loadRuntimeSettings,
            parseShortcut,
            isShortcutPressed,
        });
    }

    global.JYT_CS_SETTINGS = { install };
})(globalThis);
