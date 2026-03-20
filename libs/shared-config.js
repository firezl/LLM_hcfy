(function (global) {
    const DEFAULT_SETTINGS = {
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
        webllm_model: "Qwen3-0.6B-q4f16_1-MLC",
        webllm_custom_model: "",
        webllm_show_thoughts: false,
        webllm_model_mirror: "official",
        webllm_custom_mirror: "",
        theme_mode: "auto",
        font_family: "",
        bubble_width_percent: 20,
        bubble_height_percent: 40,
    };

    const MESSAGE_TYPES = {
        TRANSLATE_START: "TRANSLATE_START",
        WEBLLM_PRELOAD: "WEBLLM_PRELOAD",
        WEBLLM_CLEAR_CACHE: "WEBLLM_CLEAR_CACHE",
        WEBLLM_GET_MODELS: "WEBLLM_GET_MODELS",
    };

    const RECOMMENDED_WEBLLM_MODELS = [
        "Qwen3-0.6B-q4f16_1-MLC",
        "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    ];

    global.JYT_SHARED = {
        DEFAULT_SETTINGS,
        MESSAGE_TYPES,
        RECOMMENDED_WEBLLM_MODELS,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
