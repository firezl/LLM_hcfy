// options/modules/onboarding.js — automated first-install onboarding
(function (global) {
    const ONBOARDING_PENDING_KEY = "onboarding_pending";
    const ONBOARDING_COMPLETED_KEY = "onboarding_completed";

    const PRESET_META = {
        cloud: {
            titleKey: "options.onboarding.preset.cloud.title",
            descriptionKey: "options.onboarding.preset.cloud.desc",
            effectiveEngine: "openai",
            apiKey: {
                field: "openai_api_key",
                label: "OpenAI API Key",
                placeholder: "sk-...",
            },
        },
        local: {
            titleKey: "options.onboarding.preset.local.title",
            descriptionKey: "options.onboarding.preset.local.desc",
            effectiveEngine: "ollama",
            apiKey: null,
        },
        free: {
            titleKey: "options.onboarding.preset.free.title",
            descriptionKey: "options.onboarding.preset.free.desc",
            effectiveEngine: "openrouter",
            apiKey: {
                field: "openrouter_api_key",
                label: "OpenRouter API Key",
                placeholder: "sk-or-...",
            },
        },
    };

    function createOnboarding(deps) {
        const {
            overlay,
            els,
            modelLists,
            updateEngineDependentUI,
            showToast,
            settingsForm,
        } = deps;

        const t = (key, vars) =>
            global.JYT_I18N?.t ? global.JYT_I18N.t(key, vars) : key;

        if (!overlay?.root) {
            return { maybeAutoStart() {} };
        }

        const {
            root,
            skipBtn,
            backBtn,
            nextBtn,
            statusEl,
            stepWelcome,
            stepCredentials,
            stepTest,
            stepDone,
            apiKeyInput,
            apiKeyLabel,
            apiKeyHint,
            testStatusEl,
            testBtn,
            doneTitleEl,
            presetButtons,
        } = overlay;

        const steps = [stepWelcome, stepCredentials, stepTest, stepDone];
        let activePreset = null;
        let stepFlow = ["welcome"];
        let stepIndex = 0;

        function setStatus(text, isError) {
            if (!statusEl) return;
            statusEl.textContent = text || "";
            statusEl.classList.toggle("jyt-status-error", !!isError);
        }

        function setTestStatus(text, className) {
            if (!testStatusEl) return;
            testStatusEl.textContent = text || "";
            testStatusEl.className = "jyt-onboarding-test-status";
            if (className) {
                testStatusEl.classList.add(className);
            }
        }

        function showOverlay() {
            root.classList.remove("jyt-hidden");
            root.hidden = false;
            document.body.classList.add("jyt-onboarding-open");
        }

        function hideOverlay() {
            root.classList.add("jyt-hidden");
            root.hidden = true;
            document.body.classList.remove("jyt-onboarding-open");
            if (
                window.history &&
                typeof window.history.replaceState === "function" &&
                window.location.hash === "#onboarding"
            ) {
                window.history.replaceState(null, "", "options.html");
            }
        }

        function markCompleted() {
            return new Promise((resolve) => {
                chrome.storage.local.set(
                    {
                        [ONBOARDING_COMPLETED_KEY]: Date.now(),
                        [ONBOARDING_PENDING_KEY]: false,
                    },
                    () => resolve(),
                );
            });
        }

        async function completeOnboarding() {
            await markCompleted();
            hideOverlay();
        }

        function getPresetMeta(preset) {
            return PRESET_META[String(preset || "")] || null;
        }

        function presetLabel(meta) {
            return meta?.titleKey ? t(meta.titleKey) : "";
        }

        function applyPreset(preset) {
            const value = String(preset || "");
            const {
                populateOllamaModelSelect,
                populateOpenAICompatModelSelect,
                populateOpenRouterModelSelect,
                DEFAULT_OPENROUTER_API_URL,
                DEFAULT_OPENROUTER_FREE_MODEL,
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
            } else if (value === "local") {
                els.engine_select.value = "llm";
                els.llm_engine_select.value = "ollama";
                els.ollama_api_url.value =
                    els.ollama_api_url.value || "http://localhost:11434/api/chat";
                populateOllamaModelSelect(
                    [],
                    els.ollama_model_select.value || "qwen3.5:latest",
                );
                els.ollama_show_thoughts.value = "false";
            } else if (value === "free") {
                els.engine_select.value = "llm";
                els.llm_engine_select.value = "openrouter";
                els.openrouter_api_url.value =
                    els.openrouter_api_url.value || DEFAULT_OPENROUTER_API_URL;
                populateOpenRouterModelSelect([], DEFAULT_OPENROUTER_FREE_MODEL);
                els.openrouter_show_thoughts.value = "false";
            }

            updateEngineDependentUI();
        }

        function buildStepFlow(preset) {
            const meta = getPresetMeta(preset);
            const flow = ["welcome"];
            if (meta?.apiKey) {
                flow.push("credentials");
            }
            flow.push("test", "done");
            return flow;
        }

        function currentStepName() {
            return stepFlow[stepIndex] || "welcome";
        }

        function updateNavButtons() {
            const stepName = currentStepName();
            if (backBtn) {
                const showBack = stepIndex > 0 && stepName !== "done";
                backBtn.classList.toggle("jyt-hidden", !showBack);
            }
            if (nextBtn) {
                if (stepName === "welcome") {
                    nextBtn.textContent = t("common.selectPreset");
                    nextBtn.disabled = true;
                } else if (stepName === "credentials") {
                    nextBtn.textContent = t("common.next");
                    nextBtn.disabled = false;
                } else if (stepName === "test") {
                    nextBtn.textContent = t("common.saveAndFinish");
                    nextBtn.disabled = false;
                } else {
                    nextBtn.textContent = t("common.startUsing");
                    nextBtn.disabled = false;
                }
            }
            if (skipBtn) {
                skipBtn.classList.toggle("jyt-hidden", stepName === "done");
            }
        }

        function renderStep() {
            const stepName = currentStepName();
            for (const stepEl of steps) {
                if (!stepEl) continue;
                stepEl.classList.add("jyt-hidden");
            }

            if (stepName === "welcome" && stepWelcome) {
                stepWelcome.classList.remove("jyt-hidden");
            } else if (stepName === "credentials" && stepCredentials) {
                stepCredentials.classList.remove("jyt-hidden");
                const meta = getPresetMeta(activePreset);
                if (meta?.apiKey) {
                    if (apiKeyLabel) {
                        apiKeyLabel.textContent = meta.apiKey.label;
                    }
                    if (apiKeyInput) {
                        apiKeyInput.placeholder = meta.apiKey.placeholder || "";
                        apiKeyInput.value = String(els[meta.apiKey.field]?.value || "");
                    }
                    if (apiKeyHint) {
                        apiKeyHint.textContent = t("options.onboarding.credentialsHint");
                    }
                }
            } else if (stepName === "test" && stepTest) {
                stepTest.classList.remove("jyt-hidden");
                setTestStatus("", "");
            } else if (stepName === "done" && stepDone) {
                stepDone.classList.remove("jyt-hidden");
                const meta = getPresetMeta(activePreset);
                if (doneTitleEl && meta) {
                    doneTitleEl.textContent = t("options.onboarding.doneConfigured", {
                        preset: presetLabel(meta),
                    });
                }
            }

            setStatus("", false);
            updateNavButtons();
        }

        function goToStep(index) {
            stepIndex = Math.max(0, Math.min(index, stepFlow.length - 1));
            renderStep();
        }

        function selectPreset(preset) {
            activePreset = preset;
            applyPreset(preset);
            stepFlow = buildStepFlow(preset);
            for (const button of presetButtons) {
                button.classList.toggle(
                    "jyt-onboarding-preset-active",
                    button.dataset.preset === preset,
                );
            }
            setStatus(presetLabel(getPresetMeta(preset)), false);
            if (nextBtn) {
                nextBtn.textContent = t("common.next");
                nextBtn.disabled = false;
            }
        }

        function syncApiKeyToForm() {
            const meta = getPresetMeta(activePreset);
            if (!meta?.apiKey || !apiKeyInput) return true;
            const value = String(apiKeyInput.value || "").trim();
            if (!value) {
                setStatus(t("options.validation.apiKeyRequired"), true);
                return false;
            }
            if (els[meta.apiKey.field]) {
                els[meta.apiKey.field].value = value;
            }
            return true;
        }

        async function runConnectionTest() {
            const meta = getPresetMeta(activePreset);
            if (!meta) return;

            if (!syncApiKeyToForm()) {
                return;
            }

            if (typeof settingsForm.testEngineConnection !== "function") {
                setTestStatus(t("options.error.messagingFailed"), "error");
                return;
            }

            if (testBtn) testBtn.disabled = true;
            setTestStatus(t("common.testing"), "testing");

            try {
                const result = await settingsForm.testEngineConnection(
                    meta.effectiveEngine,
                );
                if (result?.ok) {
                    const modelSuffix = result.model ? ` (${result.model})` : "";
                    setTestStatus(
                        t("options.onboarding.testSuccess", { modelSuffix }),
                        "success",
                    );
                } else {
                    setTestStatus(
                        t("options.onboarding.testFailed", {
                            error: result?.error || t("common.unknownError"),
                        }),
                        "error",
                    );
                }
            } catch (err) {
                setTestStatus(
                    t("options.onboarding.testError", {
                        error: err && err.message ? err.message : String(err),
                    }),
                    "error",
                );
            } finally {
                if (testBtn) testBtn.disabled = false;
            }
        }

        async function saveAndFinish() {
            const meta = getPresetMeta(activePreset);
            if (meta?.apiKey && !syncApiKeyToForm()) {
                return false;
            }

            const saveButton = document.getElementById("save");
            if (!saveButton) {
                setStatus(t("options.error.saveFailed", { error: "" }), true);
                return false;
            }

            saveButton.click();
            showToast(t("options.toast.settingsSaved"));
            goToStep(stepIndex + 1);
            return true;
        }

        async function handleNext() {
            const stepName = currentStepName();
            if (stepName === "welcome") {
                if (!activePreset) {
                    setStatus(t("common.selectPreset"), true);
                    return;
                }
                goToStep(stepIndex + 1);
                return;
            }

            if (stepName === "credentials") {
                if (!syncApiKeyToForm()) {
                    return;
                }
                goToStep(stepIndex + 1);
                return;
            }

            if (stepName === "test") {
                await saveAndFinish();
                goToStep(stepIndex + 1);
                return;
            }

            if (stepName === "done") {
                await completeOnboarding();
            }
        }

        function bindEvents() {
            for (const button of presetButtons) {
                button.addEventListener("click", () => {
                    selectPreset(button.dataset.preset);
                });
            }

            skipBtn?.addEventListener("click", () => {
                void completeOnboarding();
            });

            backBtn?.addEventListener("click", () => {
                goToStep(stepIndex - 1);
            });

            nextBtn?.addEventListener("click", () => {
                void handleNext();
            });

            testBtn?.addEventListener("click", () => {
                void runConnectionTest();
            });

            root.addEventListener("click", (event) => {
                if (event.target === root) {
                    /* 点击遮罩不关闭，避免误触 */
                }
            });
        }

        function shouldAutoStart(items) {
            if (items?.[ONBOARDING_COMPLETED_KEY]) {
                return false;
            }
            if (items?.[ONBOARDING_PENDING_KEY]) {
                return true;
            }
            return window.location.hash === "#onboarding";
        }

        function maybeAutoStart() {
            chrome.storage.local.get(
                [ONBOARDING_PENDING_KEY, ONBOARDING_COMPLETED_KEY],
                (items) => {
                    if (chrome.runtime.lastError) {
                        return;
                    }
                    if (!shouldAutoStart(items || {})) {
                        return;
                    }
                    showOverlay();
                    goToStep(0);
                },
            );
        }

        bindEvents();

        return {
            maybeAutoStart,
            show: showOverlay,
        };
    }

    global.JYT_OPTION_ONBOARDING = {
        createOnboarding,
    };
})(globalThis);
