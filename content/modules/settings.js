// content/modules/settings.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function getCleanTranslatedText() {
                const bubble = app.getTranslateBubble?.();
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
                if (selectedEngine === "special_translate") {
                    return "ollama";
                }
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
                // content 仅持有非敏感的同步设置（引擎、语言、UI、prompt 等）；
                // *_api_key 与 *_custom_headers 留在 background，避免凭据驻留任意网页上下文。
                chrome.storage.sync.get(app.DEFAULT_SETTINGS, (syncItems) => {
                    const syncErr = chrome.runtime.lastError;
                    const safeSyncItems = syncErr ? {} : syncItems || {};
                    state.runtimeSettings = {
                        ...app.DEFAULT_SETTINGS,
                        ...safeSyncItems,
                    };
                    if (typeof app.resolveContextMode === "function") {
                        state.runtimeSettings.context_translate_mode =
                            app.resolveContextMode(state.runtimeSettings);
                    }
                    app.applyTheme(state.runtimeSettings.theme_mode || "auto");
                    if (global.JYT_I18N?.setLang) {
                        global.JYT_I18N.setLang(
                            state.runtimeSettings.ui_lang || "auto",
                        );
                        app.refreshBubbleI18n?.();
                    }
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
