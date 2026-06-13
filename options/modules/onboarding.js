// options/modules/onboarding.js — automated first-install onboarding
(function (global) {
    const ONBOARDING_PENDING_KEY = "onboarding_pending";
    const ONBOARDING_COMPLETED_KEY = "onboarding_completed";

    const PRESET_META = {
        cloud: {
            title: "云端高质量",
            description: "OpenAI 兼容模型，适合稳定高质量翻译。",
            effectiveEngine: "openai",
            apiKey: {
                field: "openai_api_key",
                label: "OpenAI API Key",
                placeholder: "sk-...",
                hint: "可在 platform.openai.com 创建密钥。",
            },
        },
        local: {
            title: "本地隐私",
            description: "Ollama 本地服务，文本不离开本机。",
            effectiveEngine: "ollama",
            apiKey: null,
        },
        free: {
            title: "免费保底",
            description: "OpenRouter 免费路由，适合轻量试用。",
            effectiveEngine: "openrouter",
            apiKey: {
                field: "openrouter_api_key",
                label: "OpenRouter API Key",
                placeholder: "sk-or-...",
                hint: "可在 openrouter.ai 注册并创建 API Key。",
            },
        },
        special: {
            title: "专用翻译模型",
            description: "Translationgemma 等专用翻译模型。",
            effectiveEngine: "special_translate",
            apiKey: null,
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

        function applyPreset(preset) {
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
                    nextBtn.textContent = "请选择上方方案";
                    nextBtn.disabled = true;
                } else if (stepName === "credentials") {
                    nextBtn.textContent = "下一步";
                    nextBtn.disabled = false;
                } else if (stepName === "test") {
                    nextBtn.textContent = "保存并完成";
                    nextBtn.disabled = false;
                } else {
                    nextBtn.textContent = "开始使用";
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
                        apiKeyHint.textContent = meta.apiKey.hint || "";
                    }
                }
            } else if (stepName === "test" && stepTest) {
                stepTest.classList.remove("jyt-hidden");
                setTestStatus("", "");
            } else if (stepName === "done" && stepDone) {
                stepDone.classList.remove("jyt-hidden");
                const meta = getPresetMeta(activePreset);
                if (doneTitleEl && meta) {
                    doneTitleEl.textContent = `已配置「${meta.title}」方案`;
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
            setStatus(`已选择「${getPresetMeta(preset)?.title || preset}」`, false);
            if (nextBtn) {
                nextBtn.textContent = "下一步";
                nextBtn.disabled = false;
            }
        }

        function syncApiKeyToForm() {
            const meta = getPresetMeta(activePreset);
            if (!meta?.apiKey || !apiKeyInput) return true;
            const value = String(apiKeyInput.value || "").trim();
            if (!value) {
                setStatus("请填写 API Key。", true);
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
                setTestStatus("连接测试不可用。", "error");
                return;
            }

            if (testBtn) testBtn.disabled = true;
            setTestStatus("⏳ 正在测试连接...", "testing");

            try {
                const result = await settingsForm.testEngineConnection(
                    meta.effectiveEngine,
                );
                if (result?.ok) {
                    const modelSuffix = result.model ? ` (${result.model})` : "";
                    setTestStatus(`✅ 连接成功${modelSuffix}`, "success");
                } else {
                    setTestStatus(
                        `❌ 连接失败: ${result?.error || "未知错误"}`,
                        "error",
                    );
                }
            } catch (err) {
                setTestStatus(
                    `❌ 发生错误: ${err && err.message ? err.message : String(err)}`,
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
                setStatus("无法保存设置。", true);
                return false;
            }

            saveButton.click();
            showToast("设置已保存");
            goToStep(stepIndex + 1);
            return true;
        }

        async function handleNext() {
            const stepName = currentStepName();
            if (stepName === "welcome") {
                if (!activePreset) {
                    setStatus("请先选择一个使用方案。", true);
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
