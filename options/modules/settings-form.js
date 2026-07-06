// options/modules/settings-form.js — load, save, reset settings form
(function (global) {
    function createSettingsForm(deps) {
        const {
            els,
            showToast,
            applyTheme,
            DEFAULT_SETTINGS,
            API_KEY_FIELDS,
            LLM_ENGINES,
            OPENAI_COMPAT_MODEL_ENGINES,
            modelLists,
            shortcutsModule,
            updateEngineDependentUI,
            extractApiKeyPayload,
            collectMissingLocalApiKeys,
            stripApiKeyPayload,
            requestOptionalHostPermissions,
        } = deps;

        const {
            populateOllamaModelSelect,
            populateOpenAICompatModelSelect,
            populateOpenRouterModelSelect,
            getSelectedOpenAICompatModel,
            getSelectedOpenRouterModel,
            DEFAULT_OPENROUTER_API_URL,
            DEFAULT_OPENROUTER_FREE_MODEL,
        } = modelLists;

        function resolveContextMode(items) {
            const raw = String(items?.context_translate_mode || "").trim();
            if (raw === "off" || raw === "lightweight" || raw === "enhanced") {
                return raw;
            }
            if (items?.context_translate_enabled === false) {
                return "off";
            }
            return "enhanced";
        }

        const { normalizeShortcut } = shortcutsModule;
        const modelListLoaded = deps.modelListLoaded;
        const t = (key, vars) =>
            global.JYT_I18N?.t ? global.JYT_I18N.t(key, vars) : key;

        function applyUiLang(value) {
            if (!global.JYT_I18N?.setLang) {
                return;
            }
            global.JYT_I18N.setLang(value);
            global.JYT_I18N.applyDom(document);
            updateEngineDependentUI();
        }

        const registry = global.JYT_ENGINE_REGISTRY || {};

        let loadedSettings = null;

        // 判定自定义端点是否为非本机的 HTTP（明文）地址，用于在保存时提醒用户 API Key 将明文传输。
        // loopback / localhost 视为本机，不告警。
        function isInsecureHttpEndpoint(rawUrl) {
            const trimmed = String(rawUrl || "").trim();
            if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
                return false;
            }
            try {
                const url = new URL(trimmed);
                if (url.protocol !== "http:") {
                    return false;
                }
                const host = String(url.hostname || "")
                    .toLowerCase()
                    .replace(/^\[|\]$/g, "");
                if (!host) {
                    return false;
                }
                if (host === "localhost" || host.endsWith(".localhost")) {
                    return false;
                }
                if (host === "::1" || /^127\./.test(host)) {
                    return false;
                }
                return true;
            } catch (err) {
                return false;
            }
        }

        function isDeepEqual(a, b) {
            if (a === b) return true;
            if (
                typeof a !== "object" ||
                a === null ||
                typeof b !== "object" ||
                b === null
            ) {
                return false;
            }
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;
            for (const key of keysA) {
                if (!keysB.includes(key)) return false;
                if (!isDeepEqual(a[key], b[key])) return false;
            }
            return true;
        }

        const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
        const BLOCKED_CUSTOM_HEADER_NAMES = new Set([
            "accept",
            "authorization",
            "content-type",
            "x-api-key",
            "anthropic-version",
        ]);
        const PROMPT_UI_CONFIGS = Array.from(
            new Map(
                (registry.ENGINE_DEFINITIONS || [])
                    .filter(
                        (def) =>
                            def?.customPromptKey &&
                            def?.systemPromptKey &&
                            def?.userPromptKey &&
                            def?.customHeadersKey &&
                            def?.customPayloadKey,
                    )
                    .map((def) => [
                        def.customPromptKey,
                        {
                            legacyKey: def.customPromptKey,
                            systemKey: def.systemPromptKey,
                            userKey: def.userPromptKey,
                            customHeadersKey: def.customHeadersKey,
                            customPayloadKey: def.customPayloadKey,
                        },
                    ]),
            ).values(),
        );

        function clampPercent(value, fallback) {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return fallback;
            }
            return Math.max(5, Math.min(95, Math.round(n)));
        }

        function fieldValue(key, fallback = "") {
            const el = els[key];
            if (!el) {
                return fallback;
            }
            return el.value;
        }

        function fieldTrim(key, fallback = "") {
            return String(fieldValue(key, fallback)).trim();
        }

        function fieldBool(key) {
            return fieldValue(key) === "true";
        }

        function fieldNumber(key, fallback = 0) {
            return Number(fieldValue(key, fallback) || fallback);
        }

        function insertAfter(referenceEl, newEl) {
            referenceEl.parentNode.insertBefore(newEl, referenceEl.nextSibling);
            return newEl;
        }

        function createPromptTextarea(id, labelText, placeholder) {
            const label = document.createElement("label");
            label.htmlFor = id;
            label.textContent = labelText;

            const textarea = document.createElement("textarea");
            textarea.id = id;
            textarea.dataset.jytSetting = id;
            textarea.rows = 4;
            textarea.placeholder = placeholder;

            return { label, textarea };
        }

        function createHeaderRow(editor, item) {
            const row = document.createElement("div");
            row.className = "jyt-custom-header-row";

            const enabled = document.createElement("input");
            enabled.type = "checkbox";
            enabled.checked = item?.enabled !== false;
            enabled.setAttribute("data-header-enabled", "");
            enabled.title = t("options.advanced.headerEnabled");

            const name = document.createElement("input");
            name.type = "text";
            name.placeholder = t("options.advanced.headerNamePlaceholder");
            name.value = item?.name || "";
            name.setAttribute("data-header-name", "");

            const value = document.createElement("input");
            value.type = "text";
            value.placeholder = t("options.advanced.headerValuePlaceholder");
            value.value = item?.value || "";
            value.setAttribute("data-header-value", "");

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "jyt-custom-header-remove";
            remove.textContent = t("options.advanced.headerRemove");
            remove.addEventListener("click", () => row.remove());

            row.append(enabled, name, value, remove);
            editor.appendChild(row);
        }

        function createHeaderEditor(id, customHeadersKey) {
            const wrap = document.createElement("div");
            wrap.id = id;
            wrap.className = "jyt-custom-header-editor";
            wrap.setAttribute("data-custom-headers-key", customHeadersKey);

            const rows = document.createElement("div");
            rows.className = "jyt-custom-header-rows";
            rows.setAttribute("data-header-rows", "");

            const add = document.createElement("button");
            add.type = "button";
            add.className = "jyt-custom-header-add";
            add.textContent = t("options.advanced.headerAdd");
            add.addEventListener("click", () => createHeaderRow(rows, {}));

            const hint = document.createElement("div");
            hint.className = "jyt-hint";
            hint.textContent = t("options.advanced.headerHint");

            wrap.append(rows, add, hint);
            return { wrap, rows };
        }

        function ensureAdvancedLLMFields() {
            for (const cfg of PROMPT_UI_CONFIGS) {
                const legacyEl = document.getElementById(cfg.legacyKey);
                if (!legacyEl || document.getElementById(cfg.systemKey)) {
                    continue;
                }

                const legacyLabel = legacyEl.previousElementSibling;
                if (
                    legacyLabel &&
                    legacyLabel.tagName &&
                    legacyLabel.tagName.toLowerCase() === "label"
                ) {
                    legacyLabel.classList.add("jyt-hidden");
                }
                legacyEl.classList.add("jyt-hidden");

                const system = createPromptTextarea(
                    cfg.systemKey,
                    t("options.advanced.systemPrompt"),
                    t("options.advanced.systemPromptPlaceholder"),
                );
                const user = createPromptTextarea(
                    cfg.userKey,
                    t("options.advanced.userPrompt"),
                    t("options.advanced.userPromptPlaceholder"),
                );
                const payload = createPromptTextarea(
                    cfg.customPayloadKey,
                    t("options.advanced.customPayload"),
                    t("options.advanced.customPayloadPlaceholder"),
                );

                let anchor = legacyEl;
                anchor = insertAfter(anchor, system.label);
                anchor = insertAfter(anchor, system.textarea);
                anchor = insertAfter(anchor, user.label);
                anchor = insertAfter(anchor, user.textarea);
                anchor = insertAfter(anchor, payload.label);
                anchor = insertAfter(anchor, payload.textarea);

                const headerLabel = document.createElement("label");
                headerLabel.textContent = t("options.advanced.customHeaders");
                const headerEditor = createHeaderEditor(
                    `${cfg.customHeadersKey}_editor`,
                    cfg.customHeadersKey,
                );
                anchor = insertAfter(anchor, headerLabel);
                insertAfter(anchor, headerEditor.wrap);

                els[cfg.systemKey] = system.textarea;
                els[cfg.userKey] = user.textarea;
                els[cfg.customPayloadKey] = payload.textarea;
                els[cfg.customHeadersKey] = headerEditor.wrap;
            }
        }

        function normalizeCustomHeaders(value) {
            const input = Array.isArray(value) ? value : [];
            return input
                .map((item) => ({
                    enabled: item?.enabled !== false,
                    name: String(item?.name || "").trim(),
                    value: String(item?.value || "").trim(),
                }))
                .filter((item) => item.name && item.value);
        }

        function renderCustomHeaders(customHeadersKey, value) {
            const editor = document.querySelector(
                `[data-custom-headers-key="${customHeadersKey}"]`,
            );
            const rows = editor?.querySelector("[data-header-rows]");
            if (!rows) {
                return;
            }
            rows.textContent = "";
            for (const item of normalizeCustomHeaders(value)) {
                createHeaderRow(rows, item);
            }
        }

        function collectCustomHeaders(customHeadersKey) {
            const editor = document.querySelector(
                `[data-custom-headers-key="${customHeadersKey}"]`,
            );
            if (!editor) {
                return { headers: [], blockedCount: 0 };
            }

            const headers = [];
            let blockedCount = 0;
            const seen = new Set();

            for (const row of editor.querySelectorAll(".jyt-custom-header-row")) {
                const enabledEl = row.querySelector("[data-header-enabled]");
                const name = String(
                    row.querySelector("[data-header-name]")?.value || "",
                ).trim();
                const value = String(
                    row.querySelector("[data-header-value]")?.value || "",
                ).trim();
                if (!name || !value || !HEADER_NAME_RE.test(name)) {
                    continue;
                }

                const normalizedName = name.toLowerCase();
                let enabled =
                    enabledEl?.checked !== false;
                if (
                    BLOCKED_CUSTOM_HEADER_NAMES.has(normalizedName) ||
                    seen.has(normalizedName)
                ) {
                    enabled = false;
                    if (enabledEl) {
                        enabledEl.checked = false;
                    }
                    blockedCount += 1;
                }
                seen.add(normalizedName);
                headers.push({ name, value, enabled });
            }

            return { headers, blockedCount };
        }

        function normalizeCustomPayload(value) {
            const raw = String(value || "").trim();
            if (!raw) {
                return { ok: true, value: "" };
            }

            try {
                const parsed = JSON.parse(raw);
                if (
                    !parsed ||
                    typeof parsed !== "object" ||
                    Array.isArray(parsed)
                ) {
                    return {
                        ok: false,
                        error: t("options.advanced.invalidPayloadObject"),
                    };
                }
                return {
                    ok: true,
                    value: JSON.stringify(parsed, null, 2),
                };
            } catch (err) {
                return {
                    ok: false,
                    error: t("options.advanced.invalidPayloadJson", {
                        error: err.message,
                    }),
                };
            }
        }

        function loadAdvancedLLMFields(items) {
            for (const cfg of PROMPT_UI_CONFIGS) {
                if (els[cfg.systemKey]) {
                    els[cfg.systemKey].value =
                        items[cfg.systemKey] || items[cfg.legacyKey] || "";
                }
                if (els[cfg.userKey]) {
                    els[cfg.userKey].value = items[cfg.userKey] || "";
                }
                if (els[cfg.customPayloadKey]) {
                    els[cfg.customPayloadKey].value =
                        items[cfg.customPayloadKey] || "";
                }
                renderCustomHeaders(
                    cfg.customHeadersKey,
                    items[cfg.customHeadersKey],
                );
            }
        }

        function collectAdvancedLLMFields(target) {
            let blockedCount = 0;
            for (const cfg of PROMPT_UI_CONFIGS) {
                target[cfg.systemKey] = els[cfg.systemKey]?.value || "";
                target[cfg.userKey] = els[cfg.userKey]?.value || "";
                const customPayload = normalizeCustomPayload(
                    els[cfg.customPayloadKey]?.value,
                );
                if (!customPayload.ok) {
                    return {
                        ok: false,
                        error: customPayload.error,
                    };
                }
                target[cfg.customPayloadKey] = customPayload.value;
                if (els[cfg.customPayloadKey]) {
                    els[cfg.customPayloadKey].value = customPayload.value;
                }
                const collected = collectCustomHeaders(cfg.customHeadersKey);
                target[cfg.customHeadersKey] = collected.headers;
                blockedCount += collected.blockedCount;
            }
            return {
                ok: true,
                blockedCustomHeaderCount: blockedCount,
            };
        }

        ensureAdvancedLLMFields();

            function load(onReady) {
                chrome.storage.sync.get(DEFAULT_SETTINGS, (syncItems) => {
                    const syncErr = chrome.runtime.lastError;
                    if (syncErr) {
                        showToast(
                            t("options.toast.syncConfigReadFailed", {
                                error: syncErr.message,
                            }),
                            true,
                        );
                        return;
                    }

                    chrome.storage.local.get(API_KEY_FIELDS, (localItems) => {
                        const localErr = chrome.runtime.lastError;
                        const migrateKeys = collectMissingLocalApiKeys(
                            syncItems,
                            localErr ? null : localItems,
                        );
                        const mergedLocalItems = {
                            ...(localErr ? {} : localItems || {}),
                            ...migrateKeys,
                        };
                        const items = {
                            ...DEFAULT_SETTINGS,
                            ...(syncItems || {}),
                            ...mergedLocalItems,
                        };

                        if (localErr) {
                            showToast(
                                t("options.toast.localKeysReadFailed", {
                                    error: localErr.message,
                                }),
                                true,
                            );
                        } else if (Object.keys(migrateKeys).length > 0) {
                            chrome.storage.local.set(migrateKeys, () => {
                                const migrateErr = chrome.runtime.lastError;
                                if (migrateErr) {
                                    showToast(
                                        t("options.toast.localKeysMigrateFailed", {
                                            error: migrateErr.message,
                                        }),
                                        true,
                                    );
                                }
                            });
                        }

                        let savedEngine = String(items.engine || "auto").trim();
                        if (savedEngine === "special_translate") {
                            if (!items.ollama_api_url && items.special_translate_api_url) {
                                items.ollama_api_url = items.special_translate_api_url;
                            }
                            const specialModel =
                                items.special_translate_model === "custom"
                                    ? items.special_translate_custom_model
                                    : items.special_translate_model;
                            if (!items.ollama_model && specialModel) {
                                items.ollama_model = specialModel;
                            }
                            if (
                                items.special_translate_show_thoughts &&
                                items.ollama_show_thoughts === undefined
                            ) {
                                items.ollama_show_thoughts =
                                    items.special_translate_show_thoughts;
                            }
                            savedEngine = "ollama";
                        }
                        const savedLLMEngine = String(items.llm_engine || "").trim();
                        const migratedLLMEngine = LLM_ENGINES.has(savedEngine)
                            ? savedEngine
                            : "";
                        const llmEngine = LLM_ENGINES.has(savedLLMEngine)
                            ? savedLLMEngine
                            : migratedLLMEngine || "openrouter";
                        const uiEngine = LLM_ENGINES.has(savedEngine)
                            ? "llm"
                            : savedEngine || "auto";

                        els.enable_select.value = items.enabled;
                        els.engine_select.value = uiEngine;
                        if (els.llm_engine_select) {
                            els.llm_engine_select.value = llmEngine;
                        }
                        loadAdvancedLLMFields(items);
                        els.translate_shortcut.value = normalizeShortcut(
                            items.translate_shortcut,
                        );
                        els.source_lang.value = items.source_lang || "auto";
                        els.target_lang.value = items.target_lang || "auto";
                        if (els.context_translate_mode) {
                            els.context_translate_mode.value =
                                resolveContextMode(items);
                        }
                        els.openai_api_url.value = items.openai_api_url;
                        els.openai_api_key.value = items.openai_api_key;
                        const savedOpenAIModel = String(
                            items.openai_model || "gpt-5.4-mini",
                        ).trim();
                        els.openai_custom_model.value = items.openai_custom_model || "";
                        els.openai_custom_prompt.value =
                            items.openai_custom_prompt || "";
                        els.show_thoughts.value = items.show_thoughts
                            ? "true"
                            : "false";
                        els.openai_thinking_model_type.value =
                            items.openai_thinking_model_type || "auto";
                        els.openai_reasoning_effort.value =
                            items.openai_reasoning_effort || "medium";
                        els.openai_max_completion_tokens.value = Number.isFinite(
                            Number(items.openai_max_completion_tokens),
                        )
                            ? String(
                                  Math.floor(
                                      Number(items.openai_max_completion_tokens),
                                  ),
                              )
                            : "0";
                        els.custom_openai_api_url.value =
                            items.custom_openai_api_url ||
                            "https://api.openai.com/v1/chat/completions";
                        els.custom_openai_api_key.value =
                            items.custom_openai_api_key || "";
                        const savedCustomOpenAIModel =
                            items.custom_openai_model || "gpt-4o-mini";
                        els.custom_openai_custom_model.value =
                            items.custom_openai_custom_model || "";
                        els.custom_openai_custom_prompt.value =
                            items.custom_openai_custom_prompt || "";
                        els.custom_openai_show_thoughts.value =
                            items.custom_openai_show_thoughts ? "true" : "false";
                        els.custom_openai_thinking_model_type.value =
                            items.custom_openai_thinking_model_type || "auto";
                        els.custom_openai_reasoning_effort.value =
                            items.custom_openai_reasoning_effort || "medium";
                        els.custom_openai_max_completion_tokens.value = Number.isFinite(
                            Number(items.custom_openai_max_completion_tokens),
                        )
                            ? String(
                                  Math.floor(
                                      Number(items.custom_openai_max_completion_tokens),
                                  ),
                              )
                            : "0";
                        els.openrouter_api_url.value =
                            items.openrouter_api_url || DEFAULT_OPENROUTER_API_URL;
                        els.openrouter_api_key.value = items.openrouter_api_key || "";
                        const savedOpenRouterModel =
                            items.openrouter_model || DEFAULT_OPENROUTER_FREE_MODEL;
                        els.openrouter_custom_model.value =
                            items.openrouter_custom_model || "";
                        els.openrouter_custom_prompt.value =
                            items.openrouter_custom_prompt || "";
                        els.openrouter_show_thoughts.value =
                            items.openrouter_show_thoughts ? "true" : "false";
                        els.openrouter_reasoning_effort.value =
                            items.openrouter_reasoning_effort || "medium";
                        els.openrouter_max_completion_tokens.value = Number.isFinite(
                            Number(items.openrouter_max_completion_tokens),
                        )
                            ? String(
                                  Math.floor(
                                      Number(items.openrouter_max_completion_tokens),
                                  ),
                              )
                            : "0";
                        populateOpenRouterModelSelect([], savedOpenRouterModel);
                        modelListLoaded.delete("openrouter");
                        els.deepseek_api_url.value =
                            items.deepseek_api_url ||
                            "https://api.deepseek.com/chat/completions";
                        els.deepseek_api_key.value = items.deepseek_api_key || "";
                        const savedDeepSeekModel =
                            items.deepseek_model || "deepseek-v4-flash";
                        els.deepseek_custom_model.value =
                            items.deepseek_custom_model || "";
                        els.deepseek_custom_prompt.value =
                            items.deepseek_custom_prompt || "";
                        els.deepseek_show_thoughts.value = items.deepseek_show_thoughts
                            ? "true"
                            : "false";
                        els.deepseek_thinking_model_type.value =
                            items.deepseek_thinking_model_type || "auto";
                        els.siliconflow_api_url.value =
                            items.siliconflow_api_url ||
                            "https://api.siliconflow.cn/v1/chat/completions";
                        els.siliconflow_api_key.value =
                            items.siliconflow_api_key || "";
                        const savedSiliconFlowModel =
                            items.siliconflow_model || "deepseek-ai/DeepSeek-V3";
                        els.siliconflow_custom_model.value =
                            items.siliconflow_custom_model || "";
                        els.siliconflow_custom_prompt.value =
                            items.siliconflow_custom_prompt || "";
                        els.siliconflow_show_thoughts.value =
                            items.siliconflow_show_thoughts ? "true" : "false";
                        els.siliconflow_thinking_model_type.value =
                            items.siliconflow_thinking_model_type || "auto";
                        els.qwen_api_url.value =
                            items.qwen_api_url ||
                            "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
                        els.qwen_api_key.value = items.qwen_api_key || "";
                        const savedQwenModel = items.qwen_model || "qwen3.5-plus";
                        els.qwen_custom_model.value = items.qwen_custom_model || "";
                        els.qwen_custom_prompt.value = items.qwen_custom_prompt || "";
                        els.qwen_show_thoughts.value = items.qwen_show_thoughts
                            ? "true"
                            : "false";
                        els.qwen_thinking_budget.value = Number.isFinite(
                            Number(items.qwen_thinking_budget),
                        )
                            ? String(Math.floor(Number(items.qwen_thinking_budget)))
                            : "0";
                        els.qwen_preserve_thinking.value = items.qwen_preserve_thinking
                            ? "true"
                            : "false";
                        els.glm_api_url.value =
                            items.glm_api_url ||
                            "https://open.bigmodel.cn/api/paas/v4/chat/completions";
                        els.glm_api_key.value = items.glm_api_key || "";
                        const savedGLMModel = items.glm_model || "glm-5.1";
                        els.glm_custom_model.value = items.glm_custom_model || "";
                        els.glm_custom_prompt.value = items.glm_custom_prompt || "";
                        els.glm_show_thoughts.value = items.glm_show_thoughts
                            ? "true"
                            : "false";
                        els.glm_thinking_model_type.value =
                            items.glm_thinking_model_type || "auto";
                        els.glm_clear_thinking.value =
                            items.glm_clear_thinking === false ? "false" : "true";
                        els.xiaomi_api_url.value =
                            items.xiaomi_api_url ||
                            "https://api.xiaomimimo.com/v1/chat/completions";
                        els.xiaomi_api_key.value = items.xiaomi_api_key || "";
                        const savedXiaomiModel = items.xiaomi_model || "mimo-v2.5";
                        els.xiaomi_custom_model.value = items.xiaomi_custom_model || "";
                        els.xiaomi_custom_prompt.value =
                            items.xiaomi_custom_prompt || "";
                        els.xiaomi_show_thoughts.value = items.xiaomi_show_thoughts
                            ? "true"
                            : "false";
                        els.xiaomi_thinking_model_type.value =
                            items.xiaomi_thinking_model_type || "auto";
                        els.xiaomi_max_completion_tokens.value = Number.isFinite(
                            Number(items.xiaomi_max_completion_tokens),
                        )
                            ? String(
                                  Math.floor(
                                      Number(items.xiaomi_max_completion_tokens),
                                  ),
                              )
                            : "0";
                        els.grok_api_url.value =
                            items.grok_api_url ||
                            "https://api.x.ai/v1/chat/completions";
                        els.grok_api_key.value = items.grok_api_key || "";
                        const savedGrokModel = items.grok_model || "grok-4.3";
                        els.grok_custom_model.value = items.grok_custom_model || "";
                        els.grok_custom_prompt.value = items.grok_custom_prompt || "";
                        els.grok_show_thoughts.value = items.grok_show_thoughts
                            ? "true"
                            : "false";
                        els.grok_thinking_model_type.value =
                            items.grok_thinking_model_type || "auto";
                        els.nim_api_url.value =
                            items.nim_api_url ||
                            "https://integrate.api.nvidia.com/v1/chat/completions";
                        els.nim_api_key.value = items.nim_api_key || "";
                        const savedNimModel =
                            items.nim_model || "meta/llama-3.1-70b-instruct";
                        els.nim_custom_model.value = items.nim_custom_model || "";
                        els.nim_custom_prompt.value = items.nim_custom_prompt || "";
                        els.nim_show_thoughts.value = items.nim_show_thoughts
                            ? "true"
                            : "false";
                        els.nim_thinking_model_type.value =
                            items.nim_thinking_model_type || "auto";
                        els.nim_max_tokens.value = Number.isFinite(
                            Number(items.nim_max_tokens),
                        )
                            ? String(Math.floor(Number(items.nim_max_tokens)))
                            : "0";
                        const openaiCompatSavedModelMap = {
                            openai: savedOpenAIModel,
                            custom_openai: savedCustomOpenAIModel,
                            deepseek: savedDeepSeekModel,
                            siliconflow: savedSiliconFlowModel,
                            qwen: savedQwenModel,
                            glm: savedGLMModel,
                            xiaomi: savedXiaomiModel,
                            grok: savedGrokModel,
                            nim: savedNimModel,
                        };
                        OPENAI_COMPAT_MODEL_ENGINES.forEach((cfg) => {
                            const selectEl = els[cfg.modelId];
                            const customEl = els[cfg.customModelId];
                            const savedModel =
                                openaiCompatSavedModelMap[cfg.name] || cfg.defaultModel;

                            populateOpenAICompatModelSelect(
                                selectEl,
                                customEl,
                                [],
                                savedModel,
                            );
                            modelListLoaded.delete(cfg.name);
                        });
                        els.claude_api_url.value =
                            items.claude_api_url ||
                            "https://api.anthropic.com/v1/messages";
                        els.claude_api_key.value = items.claude_api_key || "";
                        const savedClaudeModel =
                            items.claude_model || "claude-sonnet-4-6";
                        els.claude_custom_model.value = items.claude_custom_model || "";
                        els.claude_custom_prompt.value =
                            items.claude_custom_prompt || "";
                        els.claude_show_thoughts.value = items.claude_show_thoughts
                            ? "true"
                            : "false";
                        els.claude_max_tokens.value = Number.isFinite(
                            Number(items.claude_max_tokens),
                        )
                            ? String(Math.floor(Number(items.claude_max_tokens)))
                            : "4096";
                        els.claude_thinking_mode.value =
                            items.claude_thinking_mode || "adaptive";
                        els.claude_thinking_budget.value = Number.isFinite(
                            Number(items.claude_thinking_budget),
                        )
                            ? String(Math.floor(Number(items.claude_thinking_budget)))
                            : "2048";
                        els.claude_thinking_effort.value =
                            items.claude_thinking_effort || "medium";
                        populateOpenAICompatModelSelect(
                            els.claude_model,
                            els.claude_custom_model,
                            [],
                            savedClaudeModel,
                        );
                        modelListLoaded.delete("claude");
                        els.gemini_api_url.value =
                            items.gemini_api_url ||
                            "https://generativelanguage.googleapis.com/v1beta/models";
                        els.gemini_api_key.value = items.gemini_api_key || "";
                        const savedGeminiModel =
                            items.gemini_model || "gemini-flash-latest";
                        els.gemini_custom_model.value = items.gemini_custom_model || "";
                        els.gemini_custom_prompt.value =
                            items.gemini_custom_prompt || "";
                        els.gemini_show_thoughts.value = items.gemini_show_thoughts
                            ? "true"
                            : "false";
                        els.gemini_thinking_level.value =
                            items.gemini_thinking_level || "high";
                        els.gemini_thinking_budget.value = Number.isFinite(
                            Number(items.gemini_thinking_budget),
                        )
                            ? String(Math.floor(Number(items.gemini_thinking_budget)))
                            : "-1";
                        populateOpenAICompatModelSelect(
                            els.gemini_model,
                            els.gemini_custom_model,
                            [],
                            savedGeminiModel,
                        );
                        modelListLoaded.delete("gemini");
                        const savedOllamaModel =
                            items.ollama_model || "qwen3.5:latest";
                        els.ollama_api_url.value =
                            items.ollama_api_url || "http://localhost:11434/api/chat";
                        els.ollama_custom_model.value = items.ollama_custom_model || "";
                        els.ollama_custom_prompt.value =
                            items.ollama_custom_prompt || "";
                        els.ollama_show_thoughts.value = items.ollama_show_thoughts
                            ? "true"
                            : "false";
                        populateOllamaModelSelect([], savedOllamaModel);
                        modelListLoaded.delete("ollama");
                        els.deepl_api_url.value =
                            items.deepl_api_url ||
                            "https://api-free.deepl.com/v2/translate";
                        els.deepl_api_key.value = items.deepl_api_key || "";
                        els.deeplx_api_url.value =
                            items.deeplx_api_url || "http://localhost:1188/translate";
                        els.deeplx_api_key.value = items.deeplx_api_key || "";
                        els.theme_mode.value = items.theme_mode || "auto";
                        if (els.ui_lang) {
                            els.ui_lang.value = items.ui_lang || "auto";
                            applyUiLang(els.ui_lang.value);
                        }
                        els.font_family.value = items.font_family || "";
                        els.bubble_width_percent.value = clampPercent(
                            items.bubble_width_percent,
                            20,
                        );
                        els.bubble_height_percent.value = clampPercent(
                            items.bubble_height_percent,
                            40,
                        );
                        updateEngineDependentUI();
                        applyTheme(items.theme_mode || "auto");
                        loadedSettings = collectCurrentFormSettings();
                        if (typeof onReady === "function") {
                            onReady();
                        }
                    });
                });
            }

        function bindSaveReset() {
                document.getElementById("save").addEventListener("click", async () => {
                    const data = buildFormSettings();
                    const selectedEngine = data.engine;
                    const selectedLlmEngine = data.llm_engine;
                    const effectiveEngine =
                        selectedEngine === "llm" ? selectedLlmEngine : selectedEngine;
                    const advancedFields = collectAdvancedLLMFields(data);
                    if (!advancedFields.ok) {
                        showToast(advancedFields.error, true);
                        return;
                    }
                    if (advancedFields.blockedCustomHeaderCount > 0) {
                        showToast(
                            t("options.validation.headersBlocked", {
                                count: advancedFields.blockedCustomHeaderCount,
                            }),
                            true,
                        );
                    }
                    if (effectiveEngine === "custom_openai") {
                        if (!data.custom_openai_api_key) {
                            showToast(t("options.validation.customOpenaiApiKey"), true);
                            return;
                        }
                        if (!data.custom_openai_model) {
                            showToast(t("options.validation.customOpenaiModel"), true);
                            return;
                        }
                        if (!data.custom_openai_api_url) {
                            data.custom_openai_api_url =
                                "https://api.openai.com/v1/chat/completions";
                        }
                    }

                    if (effectiveEngine === "openrouter") {
                        if (!data.openrouter_api_key) {
                            showToast(t("options.validation.openrouterApiKey"), true);
                            return;
                        }
                        if (!data.openrouter_model) {
                            showToast(t("options.validation.openrouterModelOrCustom"), true);
                            return;
                        }
                        if (!data.openrouter_api_url) {
                            data.openrouter_api_url = DEFAULT_OPENROUTER_API_URL;
                        }
                    }

                    if (effectiveEngine === "deepseek") {
                        if (!data.deepseek_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.deepseek_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.deepseek_api_url) {
                            data.deepseek_api_url =
                                "https://api.deepseek.com/chat/completions";
                        }
                    }

                    if (effectiveEngine === "siliconflow") {
                        if (!data.siliconflow_api_key) {
                            showToast(t("options.validation.siliconflowApiKey"), true);
                            return;
                        }
                        if (!data.siliconflow_model) {
                            showToast(t("options.validation.siliconflowModelOrCustom"), true);
                            return;
                        }
                        if (!data.siliconflow_api_url) {
                            data.siliconflow_api_url =
                                "https://api.siliconflow.cn/v1/chat/completions";
                        }
                    }

                    if (effectiveEngine === "qwen") {
                        if (!data.qwen_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.qwen_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.qwen_api_url) {
                            data.qwen_api_url =
                                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
                        }
                    }

                    if (effectiveEngine === "glm") {
                        if (!data.glm_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.glm_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.glm_api_url) {
                            data.glm_api_url =
                                "https://open.bigmodel.cn/api/paas/v4/chat/completions";
                        }
                    }

                    if (effectiveEngine === "xiaomi") {
                        if (!data.xiaomi_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.xiaomi_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.xiaomi_api_url) {
                            data.xiaomi_api_url =
                                "https://api.xiaomimimo.com/v1/chat/completions";
                        }
                    }

                    if (effectiveEngine === "grok") {
                        if (!data.grok_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.grok_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.grok_api_url) {
                            data.grok_api_url = "https://api.x.ai/v1/chat/completions";
                        }
                    }

                    if (effectiveEngine === "nim") {
                        if (!data.nim_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.nim_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.nim_api_url) {
                            data.nim_api_url =
                                "https://integrate.api.nvidia.com/v1/chat/completions";
                        }
                    }

                    if (effectiveEngine === "claude") {
                        if (!data.claude_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.claude_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.claude_api_url) {
                            data.claude_api_url = "https://api.anthropic.com/v1/messages";
                        }
                    }

                    if (effectiveEngine === "gemini") {
                        if (!data.gemini_api_key) {
                            showToast(t("options.validation.genericApiKey"), true);
                            return;
                        }
                        if (!data.gemini_model) {
                            showToast(t("options.validation.modelName"), true);
                            return;
                        }
                        if (!data.gemini_api_url) {
                            data.gemini_api_url =
                                "https://generativelanguage.googleapis.com/v1beta/models";
                        }
                    }

                    if (effectiveEngine === "ollama") {
                        if (!data.ollama_api_url) {
                            data.ollama_api_url = "http://localhost:11434/api/chat";
                        }
                        const selectedOllamaModel =
                            data.ollama_model === "custom"
                                ? data.ollama_custom_model
                                : data.ollama_model;
                        if (!selectedOllamaModel) {
                            showToast(t("options.validation.ollamaModel"), true);
                            return;
                        }
                    }

                    if (effectiveEngine === "deepl") {
                        if (!data.deepl_api_key) {
                            showToast(t("options.validation.deeplApiKey"), true);
                            return;
                        }
                        if (!data.deepl_api_url) {
                            data.deepl_api_url =
                                "https://api-free.deepl.com/v2/translate";
                        }
                    }

                    if (effectiveEngine === "deeplx") {
                        if (!data.deeplx_api_url) {
                            data.deeplx_api_url = "http://localhost:1188/translate";
                        }
                    }

                    data.config_updated_at = Date.now();

                    const permissionUrls = Object.entries(data)
                        .filter(([key, value]) => key.endsWith("_api_url") && value)
                        .map(([, value]) => value);
                    const insecureEndpoints = permissionUrls.filter(
                        isInsecureHttpEndpoint,
                    );
                    if (insecureEndpoints.length > 0) {
                        const sample = insecureEndpoints[0];
                        showToast(
                            t("options.validation.httpWarning", { sample }),
                            true,
                        );
                    }
                    const granted =
                        await requestOptionalHostPermissions(
                            permissionUrls,
                        );
                    if (!granted) {
                        showToast(t("options.validation.hostPermissionWarning"), true);
                    }

                    const localApiKeys = extractApiKeyPayload(data);
                    const syncData = stripApiKeyPayload(data);

                    chrome.storage.local.set(localApiKeys, () => {
                        const localErr = chrome.runtime.lastError;
                        if (localErr) {
                            showToast(t("options.toast.saveFailed", { error: localErr.message }), true);
                            return;
                        }

                        chrome.storage.sync.set(syncData, () => {
                            const syncErr = chrome.runtime.lastError;
                            if (syncErr) {
                                showToast(t("options.toast.saveFailed", { error: syncErr.message }), true);
                                return;
                            }
                            applyTheme(syncData.theme_mode);
                            showToast(t("options.toast.saved"));
                            loadedSettings = collectCurrentFormSettings();
                        });
                    });
                });

                document.getElementById("reset").addEventListener("click", () => {
                    chrome.storage.sync.clear(() => {
                        const syncErr = chrome.runtime.lastError;
                        if (syncErr) {
                            showToast(t("options.toast.restoreFailed", { error: syncErr.message }), true);
                            return;
                        }

                        chrome.storage.local.remove(API_KEY_FIELDS, () => {
                            const localErr = chrome.runtime.lastError;
                            if (localErr) {
                                showToast(t("options.toast.restoreFailed", { error: localErr.message }), true);
                                return;
                            }

                            load();
                            showToast(t("options.toast.resetDone"));
                        });
                    });
                });
        }

        function buildFormSettings() {
            return {
                enabled: fieldValue("enable_select"),
                engine: fieldValue("engine_select"),
                llm_engine: fieldTrim("llm_engine_select", "openai") || "openai",
                translate_shortcut: normalizeShortcut(fieldValue("translate_shortcut")),
                source_lang: fieldValue("source_lang"),
                target_lang: fieldValue("target_lang"),
                context_translate_mode: fieldValue(
                    "context_translate_mode",
                    "enhanced",
                ),
                ui_lang: fieldValue("ui_lang", "auto"),
                theme_mode: fieldValue("theme_mode", "auto"),
                font_family: fieldValue("font_family"),
                bubble_width_percent: clampPercent(
                    fieldValue("bubble_width_percent"),
                    20,
                ),
                bubble_height_percent: clampPercent(
                    fieldValue("bubble_height_percent"),
                    40,
                ),
                openai_api_url: fieldValue("openai_api_url"),
                openai_api_key: fieldValue("openai_api_key"),
                openai_model: getSelectedOpenAICompatModel(
                    els.openai_model,
                    els.openai_custom_model,
                ),
                openai_custom_model: fieldTrim("openai_custom_model"),
                openai_custom_prompt: fieldValue("openai_custom_prompt"),
                show_thoughts: fieldBool("show_thoughts"),
                openai_thinking_model_type: fieldValue(
                    "openai_thinking_model_type",
                    "auto",
                ),
                openai_reasoning_effort: fieldValue("openai_reasoning_effort"),
                openai_max_completion_tokens: fieldNumber(
                    "openai_max_completion_tokens",
                ),
                custom_openai_api_url: fieldTrim("custom_openai_api_url"),
                custom_openai_api_key: fieldValue("custom_openai_api_key"),
                custom_openai_model: getSelectedOpenAICompatModel(
                    els.custom_openai_model,
                    els.custom_openai_custom_model,
                ),
                custom_openai_custom_model: fieldTrim("custom_openai_custom_model"),
                custom_openai_custom_prompt: fieldValue("custom_openai_custom_prompt"),
                custom_openai_show_thoughts: fieldBool("custom_openai_show_thoughts"),
                custom_openai_thinking_model_type: fieldValue(
                    "custom_openai_thinking_model_type",
                    "auto",
                ),
                custom_openai_reasoning_effort: fieldValue(
                    "custom_openai_reasoning_effort",
                ),
                custom_openai_max_completion_tokens: fieldNumber(
                    "custom_openai_max_completion_tokens",
                ),
                openrouter_api_url: fieldTrim("openrouter_api_url"),
                openrouter_api_key: fieldValue("openrouter_api_key"),
                openrouter_model: getSelectedOpenRouterModel(),
                openrouter_custom_model: fieldTrim("openrouter_custom_model"),
                openrouter_custom_prompt: fieldValue("openrouter_custom_prompt"),
                openrouter_show_thoughts: fieldBool("openrouter_show_thoughts"),
                openrouter_reasoning_effort: fieldValue("openrouter_reasoning_effort"),
                openrouter_max_completion_tokens: fieldNumber(
                    "openrouter_max_completion_tokens",
                ),
                deepseek_api_url: fieldTrim("deepseek_api_url"),
                deepseek_api_key: fieldValue("deepseek_api_key"),
                deepseek_model: getSelectedOpenAICompatModel(
                    els.deepseek_model,
                    els.deepseek_custom_model,
                ),
                deepseek_custom_model: fieldTrim("deepseek_custom_model"),
                deepseek_custom_prompt: fieldValue("deepseek_custom_prompt"),
                deepseek_show_thoughts: fieldBool("deepseek_show_thoughts"),
                deepseek_thinking_model_type: fieldValue(
                    "deepseek_thinking_model_type",
                    "auto",
                ),
                siliconflow_api_url: fieldTrim("siliconflow_api_url"),
                siliconflow_api_key: fieldValue("siliconflow_api_key"),
                siliconflow_model: getSelectedOpenAICompatModel(
                    els.siliconflow_model,
                    els.siliconflow_custom_model,
                ),
                siliconflow_custom_model: fieldTrim("siliconflow_custom_model"),
                siliconflow_custom_prompt: fieldValue("siliconflow_custom_prompt"),
                siliconflow_show_thoughts: fieldBool("siliconflow_show_thoughts"),
                siliconflow_thinking_model_type: fieldValue(
                    "siliconflow_thinking_model_type",
                    "auto",
                ),
                qwen_api_url: fieldTrim("qwen_api_url"),
                qwen_api_key: fieldValue("qwen_api_key"),
                qwen_model: getSelectedOpenAICompatModel(
                    els.qwen_model,
                    els.qwen_custom_model,
                ),
                qwen_custom_model: fieldTrim("qwen_custom_model"),
                qwen_custom_prompt: fieldValue("qwen_custom_prompt"),
                qwen_show_thoughts: fieldBool("qwen_show_thoughts"),
                qwen_thinking_budget: fieldNumber("qwen_thinking_budget"),
                qwen_preserve_thinking: fieldBool("qwen_preserve_thinking"),
                glm_api_url: fieldTrim("glm_api_url"),
                glm_api_key: fieldValue("glm_api_key"),
                glm_model: getSelectedOpenAICompatModel(
                    els.glm_model,
                    els.glm_custom_model,
                ),
                glm_custom_model: fieldTrim("glm_custom_model"),
                glm_custom_prompt: fieldValue("glm_custom_prompt"),
                glm_show_thoughts: fieldBool("glm_show_thoughts"),
                glm_thinking_model_type: fieldValue(
                    "glm_thinking_model_type",
                    "auto",
                ),
                glm_clear_thinking: fieldValue("glm_clear_thinking") !== "false",
                xiaomi_api_url: fieldTrim("xiaomi_api_url"),
                xiaomi_api_key: fieldValue("xiaomi_api_key"),
                xiaomi_model: getSelectedOpenAICompatModel(
                    els.xiaomi_model,
                    els.xiaomi_custom_model,
                ),
                xiaomi_custom_model: fieldTrim("xiaomi_custom_model"),
                xiaomi_custom_prompt: fieldValue("xiaomi_custom_prompt"),
                xiaomi_show_thoughts: fieldBool("xiaomi_show_thoughts"),
                xiaomi_thinking_model_type: fieldValue(
                    "xiaomi_thinking_model_type",
                    "auto",
                ),
                xiaomi_max_completion_tokens: fieldNumber(
                    "xiaomi_max_completion_tokens",
                ),
                grok_api_url: fieldTrim("grok_api_url"),
                grok_api_key: fieldValue("grok_api_key"),
                grok_model: getSelectedOpenAICompatModel(
                    els.grok_model,
                    els.grok_custom_model,
                ),
                grok_custom_model: fieldTrim("grok_custom_model"),
                grok_custom_prompt: fieldValue("grok_custom_prompt"),
                grok_show_thoughts: fieldBool("grok_show_thoughts"),
                grok_thinking_model_type: fieldValue(
                    "grok_thinking_model_type",
                    "auto",
                ),
                nim_api_url: fieldTrim("nim_api_url"),
                nim_api_key: fieldValue("nim_api_key"),
                nim_model: getSelectedOpenAICompatModel(
                    els.nim_model,
                    els.nim_custom_model,
                ),
                nim_custom_model: fieldTrim("nim_custom_model"),
                nim_custom_prompt: fieldValue("nim_custom_prompt"),
                nim_show_thoughts: fieldBool("nim_show_thoughts"),
                nim_thinking_model_type: fieldValue(
                    "nim_thinking_model_type",
                    "auto",
                ),
                nim_max_tokens: fieldNumber("nim_max_tokens"),
                claude_api_url: fieldTrim("claude_api_url"),
                claude_api_key: fieldValue("claude_api_key"),
                claude_model: getSelectedOpenAICompatModel(
                    els.claude_model,
                    els.claude_custom_model,
                ),
                claude_custom_model: fieldTrim("claude_custom_model"),
                claude_custom_prompt: fieldValue("claude_custom_prompt"),
                claude_show_thoughts: fieldBool("claude_show_thoughts"),
                claude_max_tokens: fieldNumber("claude_max_tokens", 4096),
                claude_thinking_mode: fieldValue("claude_thinking_mode"),
                claude_thinking_budget: fieldNumber("claude_thinking_budget", 2048),
                claude_thinking_effort: fieldValue("claude_thinking_effort"),
                gemini_api_url: fieldTrim("gemini_api_url"),
                gemini_api_key: fieldValue("gemini_api_key"),
                gemini_model: getSelectedOpenAICompatModel(
                    els.gemini_model,
                    els.gemini_custom_model,
                ),
                gemini_custom_model: fieldTrim("gemini_custom_model"),
                gemini_custom_prompt: fieldValue("gemini_custom_prompt"),
                gemini_show_thoughts: fieldBool("gemini_show_thoughts"),
                gemini_thinking_level: fieldValue("gemini_thinking_level"),
                gemini_thinking_budget: fieldNumber("gemini_thinking_budget", -1),
                ollama_api_url: fieldTrim("ollama_api_url"),
                ollama_model: fieldValue("ollama_model_select"),
                ollama_custom_model: fieldTrim("ollama_custom_model"),
                ollama_custom_prompt: fieldValue("ollama_custom_prompt"),
                ollama_show_thoughts: fieldBool("ollama_show_thoughts"),
                deepl_api_url: fieldTrim("deepl_api_url"),
                deepl_api_key: fieldValue("deepl_api_key"),
                deeplx_api_url: fieldTrim("deeplx_api_url"),
                deeplx_api_key: fieldValue("deeplx_api_key"),
            };
        }

        function collectCurrentFormSettings() {
            const data = buildFormSettings();
            collectAdvancedLLMFields(data);
            return data;
        }

        function validateEngineFields(engine, settings) {
            if (engine === "openai" && !settings.openai_api_key) {
                return t("options.validation.openaiApiKey");
            }
            if (engine === "custom_openai") {
                if (!settings.custom_openai_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.custom_openai_model)
                    return t("options.validation.modelName");
            }
            if (engine === "openrouter") {
                if (!settings.openrouter_api_key)
                    return t("options.validation.openrouterApiKey");
                if (!settings.openrouter_model)
                    return t("options.validation.openrouterModel");
            }
            if (engine === "deepseek") {
                if (!settings.deepseek_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.deepseek_model) return t("options.validation.modelName");
            }
            if (engine === "siliconflow") {
                if (!settings.siliconflow_api_key)
                    return t("options.validation.siliconflowApiKey");
                if (!settings.siliconflow_model)
                    return t("options.validation.modelName");
            }
            if (engine === "qwen") {
                if (!settings.qwen_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.qwen_model) return t("options.validation.modelName");
            }
            if (engine === "glm") {
                if (!settings.glm_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.glm_model) return t("options.validation.modelName");
            }
            if (engine === "xiaomi") {
                if (!settings.xiaomi_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.xiaomi_model) return t("options.validation.modelName");
            }
            if (engine === "grok") {
                if (!settings.grok_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.grok_model) return t("options.validation.modelName");
            }
            if (engine === "nim") {
                if (!settings.nim_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.nim_model) return t("options.validation.modelName");
            }
            if (engine === "claude") {
                if (!settings.claude_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.claude_model) return t("options.validation.modelName");
            }
            if (engine === "gemini") {
                if (!settings.gemini_api_key)
                    return t("options.validation.genericApiKey");
                if (!settings.gemini_model) return t("options.validation.modelName");
            }
            if (engine === "ollama") {
                const ollamaModel =
                    settings.ollama_model === "custom"
                        ? settings.ollama_custom_model
                        : settings.ollama_model;
                if (!ollamaModel) return t("options.validation.ollamaModel");
            }
            if (engine === "deepl" && !settings.deepl_api_key) {
                return t("options.validation.deeplApiKey");
            }
            return null;
        }

        function getModelDisplay(engine, settings) {
            if (engine === "openai") return settings.openai_model === "custom" ? settings.openai_custom_model : settings.openai_model;
            if (engine === "custom_openai") return settings.custom_openai_model === "custom" ? settings.custom_openai_custom_model : settings.custom_openai_model;
            if (engine === "openrouter") return settings.openrouter_model === "custom" ? settings.openrouter_custom_model : settings.openrouter_model;
            if (engine === "deepseek") return settings.deepseek_model === "custom" ? settings.deepseek_custom_model : settings.deepseek_model;
            if (engine === "siliconflow") return settings.siliconflow_model === "custom" ? settings.siliconflow_custom_model : settings.siliconflow_model;
            if (engine === "qwen") return settings.qwen_model === "custom" ? settings.qwen_custom_model : settings.qwen_model;
            if (engine === "glm") return settings.glm_model === "custom" ? settings.glm_custom_model : settings.glm_model;
            if (engine === "xiaomi") return settings.xiaomi_model === "custom" ? settings.xiaomi_custom_model : settings.xiaomi_model;
            if (engine === "grok") return settings.grok_model === "custom" ? settings.grok_custom_model : settings.grok_model;
            if (engine === "nim") return settings.nim_model === "custom" ? settings.nim_custom_model : settings.nim_model;
            if (engine === "claude") return settings.claude_model === "custom" ? settings.claude_custom_model : settings.claude_model;
            if (engine === "gemini") return settings.gemini_model === "custom" ? settings.gemini_custom_model : settings.gemini_model;
            if (engine === "ollama") return settings.ollama_model === "custom" ? settings.ollama_custom_model : settings.ollama_model;
            if (engine === "deepl") return "DeepL";
            if (engine === "deeplx") return "DeepLX";
            return "";
        }

        async function testEngineConnection(engine) {
            const settings = collectCurrentFormSettings();
            const validationError = validateEngineFields(engine, settings);
            if (validationError) {
                return { ok: false, error: validationError };
            }

            const MESSAGE_TYPES = globalThis.JYT_SHARED?.MESSAGE_TYPES || {};
            const msgType = MESSAGE_TYPES.API_CONNECTION_TEST || "API_CONNECTION_TEST";

            const resp = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        type: msgType,
                        engine,
                        settings,
                    },
                    (response) => {
                        const err = chrome.runtime.lastError;
                        if (err) {
                            reject(new Error(err.message || t("options.error.testRequestFailed")));
                            return;
                        }
                        resolve(response);
                    },
                );
            });

            if (resp && resp.ok) {
                return {
                    ok: true,
                    model: getModelDisplay(engine, settings),
                };
            }

            return {
                ok: false,
                error: resp && resp.error ? resp.error : t("common.unknownError"),
            };
        }

        function bindConnectionTest() {
            const testButtons = document.querySelectorAll(".jyt-btn-connection-test");
            testButtons.forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const engine = btn.getAttribute("data-engine");
                    const statusSpan = btn.nextElementSibling;
                    if (!engine || !statusSpan) return;

                    statusSpan.textContent = t("options.connection.testing");
                    statusSpan.className = "jyt-connection-test-status testing";
                    btn.disabled = true;

                    try {
                        const result = await testEngineConnection(engine);
                        if (result?.ok) {
                            const modelName = result.model || "";
                            statusSpan.textContent = t("options.connection.success", {
                                modelSuffix: modelName ? ` (${modelName})` : "",
                            });
                            statusSpan.className = "jyt-connection-test-status success";
                        } else {
                            statusSpan.textContent = t("options.connection.failed", {
                                error: result?.error || t("common.unknownError"),
                            });
                            statusSpan.className = "jyt-connection-test-status error";
                        }
                    } catch (err) {
                        statusSpan.textContent = t("options.connection.error", {
                            error: err.message || String(err),
                        });
                        statusSpan.className = "jyt-connection-test-status error";
                    } finally {
                        btn.disabled = false;
                    }
                });
            });
        }

        function bindGeneralEvents() {
            els.engine_select.addEventListener("change", updateEngineDependentUI);
            els.llm_engine_select?.addEventListener("change", updateEngineDependentUI);

            els.theme_mode.addEventListener("change", () => {
                applyTheme(els.theme_mode.value);
            });

            els.ui_lang?.addEventListener("change", () => {
                applyUiLang(els.ui_lang.value);
            });

            els.ollama_model_select?.addEventListener("change", () => {
                const isCustom = els.ollama_model_select.value === "custom";
                els.ollama_custom_model.disabled = !isCustom;
            });

            window.addEventListener("beforeunload", (e) => {
                if (loadedSettings) {
                    const currentSettings = collectCurrentFormSettings();
                    if (!isDeepEqual(loadedSettings, currentSettings)) {
                        e.preventDefault();
                        e.returnValue = "";
                        return "";
                    }
                }
            });

            bindConnectionTest();
        }

        return {
            load,
            bindSaveReset,
            bindGeneralEvents,
            clampPercent,
            isDeepEqual,
            collectCurrentFormSettings,
            validateEngineFields,
            testEngineConnection,
        };
    }

    global.JYT_OPTION_SETTINGS = {
        createSettingsForm,
    };
})(globalThis);
