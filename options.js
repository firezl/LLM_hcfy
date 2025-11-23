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
    ];
    const els = {};
    ids.forEach((id) => (els[id] = document.getElementById(id)));

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
            }
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
