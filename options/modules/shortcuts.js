// options/modules/shortcuts.js — translate shortcut input helpers
(function (global) {
    function normalizeShortcut(value) {
        return (value || "").trim();
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

    function bindShortcutInput(shortcutEl) {
        if (!shortcutEl) return;

        shortcutEl.addEventListener("keydown", (e) => {
            const allowClear = e.key === "Backspace" || e.key === "Delete";
            if (allowClear) {
                e.preventDefault();
                shortcutEl.value = "";
                return;
            }

            e.preventDefault();
            const shortcut = formatShortcutFromEvent(e);
            if (shortcut) {
                shortcutEl.value = shortcut;
            }
        });

        shortcutEl.addEventListener("blur", () => {
            shortcutEl.value = normalizeShortcut(shortcutEl.value);
        });
    }

    global.JYT_OPTION_SHORTCUTS = {
        normalizeShortcut,
        normalizeKeyName,
        formatShortcutFromEvent,
        bindShortcutInput,
    };
})(globalThis);
