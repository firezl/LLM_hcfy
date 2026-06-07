// options/modules/setup-wizard.js — first-run configuration wizard
(function (global) {
    function createSetupWizard(deps) {
        const {
            wizard,
            els,
            modelLists,
            updateEngineDependentUI,
            activateOptionsTab,
        } = deps;
        const { toggleBtn, panelEl, statusEl } = wizard;

        function setWizardStatus(text, isError) {
            if (!statusEl) return;
            statusEl.textContent = text || "";
            statusEl.classList.toggle("jyt-status-error", !!isError);
        }

        function applyWizardPreset(preset) {
            const value = String(preset || "");
            const {
                populateOllamaModelSelect,
                populateOpenAICompatModelSelect,
                populateOpenRouterModelSelect,
                populateSpecialTranslateModelSelect,
                DEFAULT_OPENROUTER_API_URL,
                DEFAULT_OPENROUTER_FREE_MODEL,
                RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                SPECIAL_PROVIDER_OLLAMA,
                SPECIAL_DEFAULT_URL_BY_PROVIDER,
            } = modelLists;

            if (value === "cloud") {
                els.engine_select.value = "llm";
                els.llm_engine_select.value = "openai";
                els.openai_api_url.value =
                    els.openai_api_url.value ||
                    "https://api.openai.com/v1/chat/completions";
                populateOpenAICompatModelSelect(
                    els.openai_model,
                    els.openai_custom_model,
                    [],
                    els.openai_model.value || "gpt-5.4-mini",
                );
                els.show_thoughts.value = "false";
                setWizardStatus("已套用云端高质量方案，请补全 API Key 后保存。", false);
            } else if (value === "local") {
                els.engine_select.value = "llm";
                els.llm_engine_select.value = "ollama";
                els.ollama_api_url.value =
                    els.ollama_api_url.value || "http://localhost:11434/api/chat";
                populateOllamaModelSelect([], els.ollama_model_select.value || "qwen3.5:latest");
                els.ollama_show_thoughts.value = "false";
                setWizardStatus("已套用本地隐私方案，请确认 Ollama 正在运行后保存。", false);
            } else if (value === "free") {
                els.engine_select.value = "llm";
                els.llm_engine_select.value = "openrouter";
                els.openrouter_api_url.value =
                    els.openrouter_api_url.value || DEFAULT_OPENROUTER_API_URL;
                populateOpenRouterModelSelect([], DEFAULT_OPENROUTER_FREE_MODEL);
                els.openrouter_show_thoughts.value = "false";
                setWizardStatus("已套用免费保底方案，请填写 OpenRouter API Key 后保存。", false);
            } else if (value === "special") {
                els.engine_select.value = "special_translate";
                els.special_translate_provider.value = SPECIAL_PROVIDER_OLLAMA;
                els.special_translate_api_url.value =
                    els.special_translate_api_url.value ||
                    SPECIAL_DEFAULT_URL_BY_PROVIDER[SPECIAL_PROVIDER_OLLAMA];
                populateSpecialTranslateModelSelect(
                    RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                    "translategemma",
                );
                els.special_translate_show_thoughts.value = "false";
                setWizardStatus("已套用专用翻译模型方案，请确认模型可用后保存。", false);
            }

            updateEngineDependentUI();
            activateOptionsTab("tab_engine");
        }

        function bindEvents() {
            toggleBtn?.addEventListener("click", () => {
                panelEl?.classList.toggle("jyt-hidden");
            });

            panelEl?.addEventListener("click", (event) => {
                const button = event.target.closest("button[data-preset]");
                if (!button) return;
                applyWizardPreset(button.dataset.preset);
            });
        }

        return {
            setWizardStatus,
            applyWizardPreset,
            bindEvents,
        };
    }

    global.JYT_OPTION_WIZARD = {
        createSetupWizard,
    };
})(globalThis);
