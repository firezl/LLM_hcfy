// options/modules/model-lists.js — model dropdown populate, fetch, refresh
(function (global) {
    const DEFAULT_OPENROUTER_API_URL =
        "https://openrouter.ai/api/v1/chat/completions";
    const DEFAULT_OPENROUTER_FREE_MODEL = "openrouter/free";
    const RECOMMENDED_SPECIAL_TRANSLATE_MODELS = ["translategemma"];
    const SPECIAL_PROVIDER_OLLAMA = "ollama";
    const SPECIAL_PROVIDER_OPENAI = "openai_compatible";
    const SPECIAL_DEFAULT_URL_BY_PROVIDER = {
        [SPECIAL_PROVIDER_OLLAMA]: "http://localhost:11434/api/chat",
        [SPECIAL_PROVIDER_OPENAI]: "https://api.openai.com/v1/chat/completions",
    };

    function createModelListController(deps) {
        const {
            els,
            MESSAGE_TYPES,
            messaging,
            modelListLoaded,
            debounceByKey,
            OPENAI_COMPAT_MODEL_ENGINES,
            enginesModule,
            getCurrentEffectiveEngine,
        } = deps;

        const ensureBackgroundPort = () => messaging.ensureBackgroundPort();
        const ollamaModelRequestResolvers = messaging.resolvers.ollama;
        const openaiCompatModelRequestResolvers = messaging.resolvers.openaiCompat;
        const openrouterModelRequestResolvers = messaging.resolvers.openrouter;
        const claudeModelRequestResolvers = messaging.resolvers.claude;
        const geminiModelRequestResolvers = messaging.resolvers.gemini;
        const specialModelRequestResolvers = messaging.resolvers.special;

            function populateOllamaModelSelect(modelIds, selectedModel) {
                if (!els.ollama_model_select) return;

                const orderedIds = Array.from(
                    new Set((modelIds || []).map((id) => String(id || "").trim())),
                ).filter(Boolean);

                els.ollama_model_select.innerHTML = "";
                orderedIds.forEach((id) => {
                    const option = document.createElement("option");
                    option.value = id;
                    option.textContent = id;
                    els.ollama_model_select.appendChild(option);
                });

                const customOption = document.createElement("option");
                customOption.value = "custom";
                customOption.textContent = "自定义模型名";
                els.ollama_model_select.appendChild(customOption);

                if (selectedModel && orderedIds.includes(selectedModel)) {
                    els.ollama_model_select.value = selectedModel;
                    els.ollama_custom_model.disabled = true;
                    return;
                }

                if (selectedModel && selectedModel !== "custom") {
                    const savedOption = document.createElement("option");
                    savedOption.value = selectedModel;
                    savedOption.textContent = `${selectedModel}（已保存）`;
                    els.ollama_model_select.insertBefore(savedOption, customOption);
                    els.ollama_model_select.value = selectedModel;
                    els.ollama_custom_model.disabled = true;
                    return;
                }

                if (selectedModel === "custom") {
                    els.ollama_model_select.value = "custom";
                    els.ollama_custom_model.disabled = false;
                    return;
                }

                if (orderedIds.length > 0) {
                    els.ollama_model_select.value = orderedIds[0];
                    els.ollama_custom_model.disabled = true;
                    return;
                }

                els.ollama_model_select.value = "custom";
                els.ollama_custom_model.disabled = false;
            }

            function populateOpenAICompatModelSelect(
                modelSelectEl,
                customModelEl,
                modelIds,
                selectedModel,
            ) {
                if (!modelSelectEl || !customModelEl) return;

                const orderedIds = Array.from(
                    new Set((modelIds || []).map((id) => String(id || "").trim())),
                ).filter(Boolean);

                modelSelectEl.innerHTML = "";
                orderedIds.forEach((id) => {
                    const option = document.createElement("option");
                    option.value = id;
                    option.textContent = id;
                    modelSelectEl.appendChild(option);
                });

                const customOption = document.createElement("option");
                customOption.value = "custom";
                customOption.textContent = "自定义模型名";
                modelSelectEl.appendChild(customOption);

                if (selectedModel && orderedIds.includes(selectedModel)) {
                    modelSelectEl.value = selectedModel;
                    customModelEl.disabled = true;
                    return;
                }

                if (selectedModel && selectedModel !== "custom") {
                    const savedOption = document.createElement("option");
                    savedOption.value = selectedModel;
                    savedOption.textContent = `${selectedModel}（已保存）`;
                    modelSelectEl.insertBefore(savedOption, customOption);
                    modelSelectEl.value = selectedModel;
                    customModelEl.disabled = true;
                    return;
                }

                if (selectedModel === "custom") {
                    modelSelectEl.value = "custom";
                    customModelEl.disabled = false;
                    return;
                }

                if (orderedIds.length > 0) {
                    modelSelectEl.value = orderedIds[0];
                    customModelEl.disabled = true;
                    return;
                }

                modelSelectEl.value = "custom";
                customModelEl.disabled = false;
            }

            function getSelectedOpenAICompatModel(modelSelectEl, customModelEl) {
                const selected = String(modelSelectEl?.value || "").trim();
                if (selected === "custom") {
                    return String(customModelEl?.value || "").trim();
                }
                return selected;
            }

            function normalizeOpenRouterModelItems(modelItems) {
                const seen = new Set();
                return (Array.isArray(modelItems) ? modelItems : [])
                    .map((item) => ({
                        id: String(item?.id || "").trim(),
                        name: String(item?.name || item?.id || "").trim(),
                        isFree: !!item?.isFree,
                        contextLength: Number(item?.contextLength || 0),
                        maxCompletionTokens: Number(item?.maxCompletionTokens || 0),
                        supportedParameters: Array.isArray(item?.supportedParameters)
                            ? item.supportedParameters
                            : [],
                        pricing:
                            item?.pricing && typeof item.pricing === "object"
                                ? item.pricing
                                : {},
                    }))
                    .filter((item) => {
                        if (!item.id || seen.has(item.id)) {
                            return false;
                        }
                        seen.add(item.id);
                        return true;
                    });
            }

            function populateOpenRouterModelSelect(modelItems, selectedModel) {
                if (!els.openrouter_model || !els.openrouter_custom_model) return;

                const normalizedItems = normalizeOpenRouterModelItems(modelItems);
                const freeItems = normalizedItems.filter(
                    (item) =>
                        item.isFree &&
                        item.id.toLowerCase() !== DEFAULT_OPENROUTER_FREE_MODEL,
                );
                const paidItems = normalizedItems.filter(
                    (item) =>
                        !item.isFree &&
                        item.id.toLowerCase() !== DEFAULT_OPENROUTER_FREE_MODEL,
                );
                const orderedItems = [...freeItems, ...paidItems];

                els.openrouter_model.innerHTML = "";

                const freeRouterOption = document.createElement("option");
                freeRouterOption.value = DEFAULT_OPENROUTER_FREE_MODEL;
                freeRouterOption.textContent =
                    "openrouter/free（自动免费模型）";
                els.openrouter_model.appendChild(freeRouterOption);

                orderedItems.forEach((item) => {
                    const option = document.createElement("option");
                    option.value = item.id;
                    option.textContent = item.isFree
                        ? `${item.id}（免费）`
                        : item.name && item.name !== item.id
                          ? `${item.name} (${item.id})`
                          : item.id;
                    els.openrouter_model.appendChild(option);
                });

                const customOption = document.createElement("option");
                customOption.value = "custom";
                customOption.textContent = "自定义模型名";
                els.openrouter_model.appendChild(customOption);

                const orderedIds = [
                    DEFAULT_OPENROUTER_FREE_MODEL,
                    ...orderedItems.map((item) => item.id),
                ];
                if (selectedModel && orderedIds.includes(selectedModel)) {
                    els.openrouter_model.value = selectedModel;
                    els.openrouter_custom_model.disabled = true;
                    return;
                }

                if (selectedModel && selectedModel !== "custom") {
                    const savedOption = document.createElement("option");
                    savedOption.value = selectedModel;
                    savedOption.textContent = `${selectedModel}（已保存）`;
                    const firstPaidIndex = 1 + freeItems.length;
                    const firstPaidOption =
                        els.openrouter_model.options[firstPaidIndex] || customOption;
                    els.openrouter_model.insertBefore(savedOption, firstPaidOption);
                    els.openrouter_model.value = selectedModel;
                    els.openrouter_custom_model.disabled = true;
                    return;
                }

                if (selectedModel === "custom") {
                    els.openrouter_model.value = "custom";
                    els.openrouter_custom_model.disabled = false;
                    return;
                }

                els.openrouter_model.value = DEFAULT_OPENROUTER_FREE_MODEL;
                els.openrouter_custom_model.disabled = true;
            }

            function getSelectedOpenRouterModel() {
                const selected = String(els.openrouter_model?.value || "").trim();
                if (selected === "custom") {
                    return String(els.openrouter_custom_model?.value || "").trim();
                }
                return selected;
            }

            function normalizeSpecialProvider(provider) {
                const normalized = String(provider || "")
                    .trim()
                    .toLowerCase();
                return normalized === SPECIAL_PROVIDER_OPENAI
                    ? SPECIAL_PROVIDER_OPENAI
                    : SPECIAL_PROVIDER_OLLAMA;
            }

            function getSpecialApiDefaultByProvider(provider) {
                return (
                    SPECIAL_DEFAULT_URL_BY_PROVIDER[
                        normalizeSpecialProvider(provider)
                    ] || SPECIAL_DEFAULT_URL_BY_PROVIDER[SPECIAL_PROVIDER_OLLAMA]
                );
            }

            function populateSpecialTranslateModelSelect(modelIds, selectedModel) {
                if (!els.special_translate_model_select) return;

                const orderedIds = Array.from(
                    new Set((modelIds || []).map((id) => String(id || "").trim())),
                ).filter(Boolean);

                els.special_translate_model_select.innerHTML = "";
                orderedIds.forEach((id) => {
                    const option = document.createElement("option");
                    option.value = id;
                    option.textContent = RECOMMENDED_SPECIAL_TRANSLATE_MODELS.includes(
                        id.toLowerCase(),
                    )
                        ? `${id}（推荐）`
                        : id;
                    els.special_translate_model_select.appendChild(option);
                });

                const customOption = document.createElement("option");
                customOption.value = "custom";
                customOption.textContent = "自定义模型名";
                els.special_translate_model_select.appendChild(customOption);

                if (selectedModel && orderedIds.includes(selectedModel)) {
                    els.special_translate_model_select.value = selectedModel;
                    els.special_translate_custom_model.disabled = true;
                    return;
                }

                if (selectedModel && selectedModel !== "custom") {
                    const savedOption = document.createElement("option");
                    savedOption.value = selectedModel;
                    savedOption.textContent = `${selectedModel}（已保存）`;
                    els.special_translate_model_select.insertBefore(
                        savedOption,
                        customOption,
                    );
                    els.special_translate_model_select.value = selectedModel;
                    els.special_translate_custom_model.disabled = true;
                    return;
                }

                if (selectedModel === "custom") {
                    els.special_translate_model_select.value = "custom";
                    els.special_translate_custom_model.disabled = false;
                    return;
                }

                if (orderedIds.length > 0) {
                    els.special_translate_model_select.value = orderedIds[0];
                    els.special_translate_custom_model.disabled = true;
                    return;
                }

                els.special_translate_model_select.value = "custom";
                els.special_translate_custom_model.disabled = false;
            }

            async function requestOllamaModelList(apiUrl) {
                return new Promise((resolve, reject) => {
                    const requestId = `ollama-models-${Date.now()}-${Math.random()}`;
                    const timer = setTimeout(() => {
                        ollamaModelRequestResolvers.delete(requestId);
                        reject(new Error("请求 Ollama 模型列表超时"));
                    }, 8000);

                    ollamaModelRequestResolvers.set(requestId, (payload) => {
                        clearTimeout(timer);
                        resolve(payload || {});
                    });

                    try {
                        const port = ensureBackgroundPort();
                        port.postMessage({
                            type:
                                MESSAGE_TYPES.OLLAMA_GET_MODELS || "OLLAMA_GET_MODELS",
                            requestId,
                            apiUrl: String(apiUrl || "").trim(),
                        });
                    } catch (err) {
                        clearTimeout(timer);
                        ollamaModelRequestResolvers.delete(requestId);
                        reject(err);
                    }
                });
            }

            async function requestOpenAICompatModelList(apiUrl, apiKey) {
                return new Promise((resolve, reject) => {
                    const requestId = `openai-compat-models-${Date.now()}-${Math.random()}`;
                    const timer = setTimeout(() => {
                        openaiCompatModelRequestResolvers.delete(requestId);
                        reject(new Error("请求 OpenAI 兼容模型列表超时"));
                    }, 8000);

                    openaiCompatModelRequestResolvers.set(requestId, (payload) => {
                        clearTimeout(timer);
                        resolve(payload || {});
                    });

                    try {
                        const port = ensureBackgroundPort();
                        port.postMessage({
                            type:
                                MESSAGE_TYPES.OPENAI_COMPAT_GET_MODELS ||
                                "OPENAI_COMPAT_GET_MODELS",
                            requestId,
                            apiUrl: String(apiUrl || "").trim(),
                            apiKey: String(apiKey || "").trim(),
                        });
                    } catch (err) {
                        clearTimeout(timer);
                        openaiCompatModelRequestResolvers.delete(requestId);
                        reject(err);
                    }
                });
            }

            async function requestOpenRouterModelList(apiUrl, apiKey) {
                return new Promise((resolve, reject) => {
                    const requestId = `openrouter-models-${Date.now()}-${Math.random()}`;
                    const timer = setTimeout(() => {
                        openrouterModelRequestResolvers.delete(requestId);
                        reject(new Error("请求 OpenRouter 模型列表超时"));
                    }, 8000);

                    openrouterModelRequestResolvers.set(requestId, (payload) => {
                        clearTimeout(timer);
                        resolve(payload || {});
                    });

                    try {
                        const port = ensureBackgroundPort();
                        port.postMessage({
                            type:
                                MESSAGE_TYPES.OPENROUTER_GET_MODELS ||
                                "OPENROUTER_GET_MODELS",
                            requestId,
                            apiUrl: String(apiUrl || "").trim(),
                            apiKey: String(apiKey || "").trim(),
                        });
                    } catch (err) {
                        clearTimeout(timer);
                        openrouterModelRequestResolvers.delete(requestId);
                        reject(err);
                    }
                });
            }

            async function requestClaudeModelList(apiUrl, apiKey) {
                return new Promise((resolve, reject) => {
                    const requestId = `claude-models-${Date.now()}-${Math.random()}`;
                    const timer = setTimeout(() => {
                        claudeModelRequestResolvers.delete(requestId);
                        reject(new Error("请求 Claude 模型列表超时"));
                    }, 8000);

                    claudeModelRequestResolvers.set(requestId, (payload) => {
                        clearTimeout(timer);
                        resolve(payload || {});
                    });

                    try {
                        const port = ensureBackgroundPort();
                        port.postMessage({
                            type:
                                MESSAGE_TYPES.CLAUDE_GET_MODELS || "CLAUDE_GET_MODELS",
                            requestId,
                            apiUrl: String(apiUrl || "").trim(),
                            apiKey: String(apiKey || "").trim(),
                        });
                    } catch (err) {
                        clearTimeout(timer);
                        claudeModelRequestResolvers.delete(requestId);
                        reject(err);
                    }
                });
            }

            async function requestGeminiModelList(apiUrl, apiKey) {
                return new Promise((resolve, reject) => {
                    const requestId = `gemini-models-${Date.now()}-${Math.random()}`;
                    const timer = setTimeout(() => {
                        geminiModelRequestResolvers.delete(requestId);
                        reject(new Error("请求 Gemini 模型列表超时"));
                    }, 8000);

                    geminiModelRequestResolvers.set(requestId, (payload) => {
                        clearTimeout(timer);
                        resolve(payload || {});
                    });

                    try {
                        const port = ensureBackgroundPort();
                        port.postMessage({
                            type:
                                MESSAGE_TYPES.GEMINI_GET_MODELS || "GEMINI_GET_MODELS",
                            requestId,
                            apiUrl: String(apiUrl || "").trim(),
                            apiKey: String(apiKey || "").trim(),
                        });
                    } catch (err) {
                        clearTimeout(timer);
                        geminiModelRequestResolvers.delete(requestId);
                        reject(err);
                    }
                });
            }

            async function requestSpecialTranslateModelList(provider, apiUrl, apiKey) {
                return new Promise((resolve, reject) => {
                    const requestId = `special-models-${Date.now()}-${Math.random()}`;
                    const timer = setTimeout(() => {
                        specialModelRequestResolvers.delete(requestId);
                        reject(new Error("请求专用翻译模型列表超时"));
                    }, 8000);

                    specialModelRequestResolvers.set(requestId, (payload) => {
                        clearTimeout(timer);
                        resolve(payload || {});
                    });

                    try {
                        const port = ensureBackgroundPort();
                        port.postMessage({
                            type:
                                MESSAGE_TYPES.SPECIAL_TRANSLATE_GET_MODELS ||
                                "SPECIAL_TRANSLATE_GET_MODELS",
                            requestId,
                            provider: normalizeSpecialProvider(provider),
                            apiUrl: String(apiUrl || "").trim(),
                            apiKey: String(apiKey || "").trim(),
                        });
                    } catch (err) {
                        clearTimeout(timer);
                        specialModelRequestResolvers.delete(requestId);
                        reject(err);
                    }
                });
            }

            function refreshOpenAICompatModels(cfg, force) {
                const selectEl = els[cfg.modelId];
                const customEl = els[cfg.customModelId];
                if (!selectEl || !customEl) {
                    return Promise.resolve();
                }

                if (!force && modelListLoaded.has(cfg.name)) {
                    return Promise.resolve();
                }

                const selectedModel = getSelectedOpenAICompatModel(selectEl, customEl);
                return requestOpenAICompatModelList(
                    els[cfg.apiUrlId]?.value,
                    els[cfg.apiKeyId]?.value,
                )
                    .then((res) => {
                        const modelIds = Array.isArray(res.modelIds)
                            ? res.modelIds
                            : [];
                        populateOpenAICompatModelSelect(
                            selectEl,
                            customEl,
                            modelIds,
                            selectedModel,
                        );
                        modelListLoaded.add(cfg.name);
                    })
                    .catch(() => {
                        populateOpenAICompatModelSelect(
                            selectEl,
                            customEl,
                            [],
                            selectedModel,
                        );
                        modelListLoaded.delete(cfg.name);
                    });
            }

            function refreshOpenRouterModels(force) {
                if (!force && modelListLoaded.has("openrouter")) {
                    return Promise.resolve();
                }
                const selectedModel = getSelectedOpenRouterModel();
                return requestOpenRouterModelList(
                    els.openrouter_api_url.value,
                    els.openrouter_api_key.value,
                )
                    .then((res) => {
                        const modelItems = Array.isArray(res.modelItems)
                            ? res.modelItems
                            : [];
                        populateOpenRouterModelSelect(modelItems, selectedModel);
                        modelListLoaded.add("openrouter");
                    })
                    .catch(() => {
                        populateOpenRouterModelSelect([], selectedModel);
                        modelListLoaded.delete("openrouter");
                    });
            }

            function refreshClaudeModels(force) {
                if (!force && modelListLoaded.has("claude")) {
                    return Promise.resolve();
                }
                const selectedModel = getSelectedOpenAICompatModel(
                    els.claude_model,
                    els.claude_custom_model,
                );
                return requestClaudeModelList(
                    els.claude_api_url.value,
                    els.claude_api_key.value,
                )
                    .then((res) => {
                        const modelIds = Array.isArray(res.modelIds)
                            ? res.modelIds
                            : [];
                        populateOpenAICompatModelSelect(
                            els.claude_model,
                            els.claude_custom_model,
                            modelIds,
                            selectedModel,
                        );
                        modelListLoaded.add("claude");
                    })
                    .catch(() => {
                        populateOpenAICompatModelSelect(
                            els.claude_model,
                            els.claude_custom_model,
                            [],
                            selectedModel,
                        );
                        modelListLoaded.delete("claude");
                    });
            }

            function refreshGeminiModels(force) {
                if (!force && modelListLoaded.has("gemini")) {
                    return Promise.resolve();
                }
                const selectedModel = getSelectedOpenAICompatModel(
                    els.gemini_model,
                    els.gemini_custom_model,
                );
                return requestGeminiModelList(
                    els.gemini_api_url.value,
                    els.gemini_api_key.value,
                )
                    .then((res) => {
                        const modelIds = Array.isArray(res.modelIds)
                            ? res.modelIds
                            : [];
                        populateOpenAICompatModelSelect(
                            els.gemini_model,
                            els.gemini_custom_model,
                            modelIds,
                            selectedModel,
                        );
                        modelListLoaded.add("gemini");
                    })
                    .catch(() => {
                        populateOpenAICompatModelSelect(
                            els.gemini_model,
                            els.gemini_custom_model,
                            [],
                            selectedModel,
                        );
                        modelListLoaded.delete("gemini");
                    });
            }

            function refreshSpecialTranslateModels(force) {
                if (!force && modelListLoaded.has("special_translate")) {
                    return Promise.resolve();
                }
                const selectedModel =
                    (els.special_translate_model_select?.value || "").trim() ||
                    "translategemma";
                return requestSpecialTranslateModelList(
                    els.special_translate_provider?.value,
                    els.special_translate_api_url?.value,
                    els.special_translate_api_key?.value,
                )
                    .then((res) => {
                        const modelIds = Array.isArray(res.modelIds)
                            ? res.modelIds
                            : RECOMMENDED_SPECIAL_TRANSLATE_MODELS;
                        populateSpecialTranslateModelSelect(modelIds, selectedModel);
                        modelListLoaded.add("special_translate");
                    })
                    .catch(() => {
                        populateSpecialTranslateModelSelect(
                            RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                            selectedModel,
                        );
                        modelListLoaded.delete("special_translate");
                    });
            }

            function refreshOllamaModels(force) {
                if (!force && modelListLoaded.has("ollama")) {
                    return Promise.resolve();
                }
                const selectedModel = (els.ollama_model_select?.value || "").trim();
                return requestOllamaModelList(els.ollama_api_url.value)
                    .then((res) => {
                        const modelIds = Array.isArray(res.modelIds)
                            ? res.modelIds
                            : [];
                        populateOllamaModelSelect(modelIds, selectedModel);
                        modelListLoaded.add("ollama");
                    })
                    .catch(() => {
                        populateOllamaModelSelect([], selectedModel);
                        modelListLoaded.delete("ollama");
                    });
            }

            function ensureActiveEngineModelListLoaded(engine) {
                if (typeof enginesModule.ensureActiveEngineModelListLoaded === "function") {
                    enginesModule.ensureActiveEngineModelListLoaded(
                        engine || getCurrentEffectiveEngine() || "auto",
                        {
                            refreshOpenAICompat: (cfg, force) =>
                                refreshOpenAICompatModels(cfg, force),
                            refreshOpenRouter: (force) =>
                                refreshOpenRouterModels(force),
                            refreshClaude: (force) => refreshClaudeModels(force),
                            refreshGemini: (force) => refreshGeminiModels(force),
                            refreshOllama: (force) => refreshOllamaModels(force),
                            refreshSpecialTranslate: (force) =>
                                refreshSpecialTranslateModels(force),
                        },
                    );
                }
            }

        function bindModelListEvents() {
                OPENAI_COMPAT_MODEL_ENGINES.forEach((cfg) => {
                    els[cfg.modelId]?.addEventListener("change", () => {
                        const isCustom = (els[cfg.modelId]?.value || "") === "custom";
                        if (els[cfg.customModelId]) {
                            els[cfg.customModelId].disabled = !isCustom;
                        }
                    });

                    els[cfg.apiUrlId]?.addEventListener("change", () => {
                        modelListLoaded.delete(cfg.name);
                        debounceByKey(`model-${cfg.name}`, () => {
                            void refreshOpenAICompatModels(cfg, true);
                        });
                    });

                    els[cfg.apiKeyId]?.addEventListener("change", () => {
                        modelListLoaded.delete(cfg.name);
                        debounceByKey(`model-${cfg.name}`, () => {
                            void refreshOpenAICompatModels(cfg, true);
                        });
                    });
                });

                els.openrouter_model?.addEventListener("change", () => {
                    const isCustom = els.openrouter_model.value === "custom";
                    els.openrouter_custom_model.disabled = !isCustom;
                });

                els.openrouter_api_url?.addEventListener("change", () => {
                    modelListLoaded.delete("openrouter");
                    debounceByKey("model-openrouter", () => {
                        void refreshOpenRouterModels(true);
                    });
                });

                els.openrouter_api_key?.addEventListener("change", () => {
                    modelListLoaded.delete("openrouter");
                    debounceByKey("model-openrouter", () => {
                        void refreshOpenRouterModels(true);
                    });
                });

                els.claude_model?.addEventListener("change", () => {
                    const isCustom = els.claude_model.value === "custom";
                    els.claude_custom_model.disabled = !isCustom;
                });

                els.gemini_model?.addEventListener("change", () => {
                    const isCustom = els.gemini_model.value === "custom";
                    els.gemini_custom_model.disabled = !isCustom;
                });

                els.claude_api_url?.addEventListener("change", () => {
                    modelListLoaded.delete("claude");
                    debounceByKey("model-claude", () => {
                        void refreshClaudeModels(true);
                    });
                });

                els.claude_api_key?.addEventListener("change", () => {
                    modelListLoaded.delete("claude");
                    debounceByKey("model-claude", () => {
                        void refreshClaudeModels(true);
                    });
                });

                els.gemini_api_url?.addEventListener("change", () => {
                    modelListLoaded.delete("gemini");
                    debounceByKey("model-gemini", () => {
                        void refreshGeminiModels(true);
                    });
                });

                els.gemini_api_key?.addEventListener("change", () => {
                    modelListLoaded.delete("gemini");
                    debounceByKey("model-gemini", () => {
                        void refreshGeminiModels(true);
                    });
                });

                els.special_translate_provider?.addEventListener("change", () => {
                    const provider = normalizeSpecialProvider(
                        els.special_translate_provider.value,
                    );
                    if (!String(els.special_translate_api_url.value || "").trim()) {
                        els.special_translate_api_url.value =
                            getSpecialApiDefaultByProvider(provider);
                    }
                    modelListLoaded.delete("special_translate");
                    debounceByKey("model-special", () => {
                        void refreshSpecialTranslateModels(true);
                    });
                });

                els.special_translate_api_url?.addEventListener("change", () => {
                    modelListLoaded.delete("special_translate");
                    debounceByKey("model-special", () => {
                        void refreshSpecialTranslateModels(true);
                    });
                });

                els.special_translate_api_key?.addEventListener("change", () => {
                    if (
                        normalizeSpecialProvider(els.special_translate_provider?.value) ===
                        SPECIAL_PROVIDER_OPENAI
                    ) {
                        modelListLoaded.delete("special_translate");
                        debounceByKey("model-special", () => {
                            void refreshSpecialTranslateModels(true);
                        });
                    }
                });

                els.ollama_api_url?.addEventListener("change", () => {
                    modelListLoaded.delete("ollama");
                    debounceByKey("model-ollama", () => {
                        void refreshOllamaModels(true);
                    });
                });
        }

        return {
            populateOllamaModelSelect,
            populateOpenAICompatModelSelect,
            populateOpenRouterModelSelect,
            populateSpecialTranslateModelSelect,
            getSelectedOpenAICompatModel,
            getSelectedOpenRouterModel,
            normalizeSpecialProvider,
            getSpecialApiDefaultByProvider,
            requestOllamaModelList,
            requestOpenAICompatModelList,
            requestOpenRouterModelList,
            requestClaudeModelList,
            requestGeminiModelList,
            requestSpecialTranslateModelList,
            refreshOpenAICompatModels,
            refreshOpenRouterModels,
            refreshClaudeModels,
            refreshGeminiModels,
            refreshSpecialTranslateModels,
            refreshOllamaModels,
            ensureActiveEngineModelListLoaded,
            bindModelListEvents,
            DEFAULT_OPENROUTER_API_URL,
            DEFAULT_OPENROUTER_FREE_MODEL,
            RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
            SPECIAL_PROVIDER_OLLAMA,
            SPECIAL_PROVIDER_OPENAI,
            SPECIAL_DEFAULT_URL_BY_PROVIDER,
        };
    }

    global.JYT_OPTION_MODEL_LISTS = {
        createModelListController,
    };
})(globalThis);
