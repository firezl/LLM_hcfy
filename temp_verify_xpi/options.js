// options.js
document.addEventListener("DOMContentLoaded", () => {
    const ids = [
        "enable_select",
        "engine_select",
        "translate_shortcut",
        "source_lang",
        "target_lang",
        "openai_api_url",
        "openai_api_key",
        "openai_model",
        "openai_thinking_model",
        "show_thoughts",
        "theme_mode",
        "font_family",
        "bubble_width_percent",
        "bubble_height_percent",
    ];
    const els = {};
    ids.forEach((id) => (els[id] = document.getElementById(id)));
    const openaiSection = document.getElementById("openai_section");

    function clampPercent(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return fallback;
        }
        return Math.max(5, Math.min(95, Math.round(n)));
    }

    function normalizeShortcut(value) {
        const raw = (value || "").trim();
        return raw;
    }

    function normalizeKeyName(key) {
        const raw = String(key || "").trim();
        if (!raw) return "";

        const alias = {
            " ": "Space",
            Escape: "Esc",
            ArrowUp: "Up",
            ArrowDown: "Down",
            ArrowLeft: "Left",
            ArrowRight: "Right",
            "+": "Plus",
        };

        if (alias[raw]) {
            return alias[raw];
        }

        if (raw.length === 1) {
            return raw.toUpperCase();
        }

        return raw;
    }

    function formatShortcutFromEvent(e) {
        const keyName = normalizeKeyName(e.key);
        const modifierOnlyKeys = new Set(["Control", "Shift", "Alt", "Meta"]);
        if (!keyName || modifierOnlyKeys.has(e.key)) {
            return "";
        }

        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey) parts.push("Meta");
        parts.push(keyName);
        return parts.join("+");
    }

    function updateEngineDependentUI() {
        if (!openaiSection) return;
        const hideOpenAI = els.engine_select.value === "browser";
        openaiSection.classList.toggle("jyt-hidden", hideOpenAI);
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        if (theme === "auto") {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches;
            root.setAttribute("data-theme", prefersDark ? "dark" : "light");
        } else {
            root.setAttribute("data-theme", theme);
        }
    }

    function load() {
        chrome.storage.sync.get(
            {
                enabled: "on",
                engine: "auto",
                translate_shortcut: "",
                source_lang: "auto",
                target_lang: "auto",
                openai_api_url: "",
                openai_api_key: "",
                openai_model: "gpt-4o-mini",
                openai_thinking_model: "gpt-5-thinking",
                show_thoughts: false,
                theme_mode: "auto",
                font_family: "",
                bubble_width_percent: 52,
                bubble_height_percent: 58,
            },
            (items) => {
                els.enable_select.value = items.enabled;
                els.engine_select.value = items.engine;
                els.translate_shortcut.value = normalizeShortcut(
                    items.translate_shortcut,
                );
                els.source_lang.value = items.source_lang || "auto";
                els.target_lang.value = items.target_lang || "auto";
                els.openai_api_url.value = items.openai_api_url;
                els.openai_api_key.value = items.openai_api_key;
                els.openai_model.value = items.openai_model;
                els.openai_thinking_model.value = items.openai_thinking_model;
                els.show_thoughts.value = items.show_thoughts
                    ? "true"
                    : "false";
                els.theme_mode.value = items.theme_mode || "auto";
                els.font_family.value = items.font_family || "";
                els.bubble_width_percent.value = clampPercent(
                    items.bubble_width_percent,
                    20,
                );
                els.bubble_height_percent.value = clampPercent(
                    items.bubble_height_percent,
                    30,
                );
                updateEngineDependentUI();
                applyTheme(items.theme_mode || "auto");
            },
        );
    }

    document.getElementById("save").addEventListener("click", () => {
        const data = {
            enabled: els.enable_select.value,
            engine: els.engine_select.value,
            translate_shortcut: normalizeShortcut(els.translate_shortcut.value),
            source_lang: els.source_lang.value,
            target_lang: els.target_lang.value,
            openai_api_url: els.openai_api_url.value,
            openai_api_key: els.openai_api_key.value,
            openai_model: els.openai_model.value,
            openai_thinking_model: els.openai_thinking_model.value,
            show_thoughts: els.show_thoughts.value === "true",
            theme_mode: els.theme_mode.value,
            font_family: els.font_family.value,
            bubble_width_percent: clampPercent(
                els.bubble_width_percent.value,
                20,
            ),
            bubble_height_percent: clampPercent(
                els.bubble_height_percent.value,
                40,
            ),
        };
        chrome.storage.sync.set(data, () => {
            applyTheme(data.theme_mode);
            alert("已保存");
        });
    });

    document.getElementById("reset").addEventListener("click", () => {
        chrome.storage.sync.clear(() => {
            load();
            alert("已恢复默认");
        });
    });

    els.translate_shortcut.addEventListener("keydown", (e) => {
        const allowClear = e.key === "Backspace" || e.key === "Delete";
        if (allowClear) {
            e.preventDefault();
            els.translate_shortcut.value = "";
            return;
        }

        e.preventDefault();
        const shortcut = formatShortcutFromEvent(e);
        if (shortcut) {
            els.translate_shortcut.value = shortcut;
        }
    });

    els.translate_shortcut.addEventListener("blur", () => {
        els.translate_shortcut.value = normalizeShortcut(
            els.translate_shortcut.value,
        );
    });

    els.engine_select.addEventListener("change", updateEngineDependentUI);

    els.theme_mode.addEventListener("change", () => {
        applyTheme(els.theme_mode.value);
    });

    // Listen for system theme changes
    window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
            if (els.theme_mode.value === "auto") {
                applyTheme("auto");
            }
        });

    load();
});
