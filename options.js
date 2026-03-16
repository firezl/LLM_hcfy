// options.js
document.addEventListener("DOMContentLoaded", () => {
    const ids = [
        "enable_select",
        "engine_select",
        "openai_api_url",
        "openai_api_key",
        "openai_model",
        "openai_thinking_model",
        "show_thoughts",
        "font_family",
        "bubble_width_percent",
        "bubble_height_percent",
    ];
    const els = {};
    ids.forEach((id) => (els[id] = document.getElementById(id)));

    function clampPercent(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return fallback;
        }
        return Math.max(5, Math.min(95, Math.round(n)));
    }

    function load() {
        chrome.storage.sync.get(
            {
                enabled: "on",
                engine: "auto",
                openai_api_url: "",
                openai_api_key: "",
                openai_model: "gpt-4-mini",
                openai_thinking_model: "gpt-5-thinking",
                show_thoughts: false,
                font_family: "",
                bubble_width_percent: 52,
                bubble_height_percent: 58,
            },
            (items) => {
                els.enable_select.value = items.enabled;
                els.engine_select.value = items.engine;
                els.openai_api_url.value = items.openai_api_url;
                els.openai_api_key.value = items.openai_api_key;
                els.openai_model.value = items.openai_model;
                els.openai_thinking_model.value = items.openai_thinking_model;
                els.show_thoughts.value = items.show_thoughts
                    ? "true"
                    : "false";
                els.font_family.value = items.font_family || "";
                els.bubble_width_percent.value = clampPercent(
                    items.bubble_width_percent,
                    20,
                );
                els.bubble_height_percent.value = clampPercent(
                    items.bubble_height_percent,
                    30,
                );
            },
        );
    }

    document.getElementById("save").addEventListener("click", () => {
        const data = {
            enabled: els.enable_select.value,
            engine: els.engine_select.value,
            openai_api_url: els.openai_api_url.value,
            openai_api_key: els.openai_api_key.value,
            openai_model: els.openai_model.value,
            openai_thinking_model: els.openai_thinking_model.value,
            show_thoughts: els.show_thoughts.value === "true",
            font_family: els.font_family.value,
            bubble_width_percent: clampPercent(
                els.bubble_width_percent.value,
                52,
            ),
            bubble_height_percent: clampPercent(
                els.bubble_height_percent.value,
                58,
            ),
        };
        chrome.storage.sync.set(data, () => {
            alert("已保存");
        });
    });

    document.getElementById("reset").addEventListener("click", () => {
        chrome.storage.sync.clear(() => {
            load();
            alert("已恢复默认");
        });
    });

    load();
});
