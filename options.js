// options.js
document.addEventListener("DOMContentLoaded", () => {
    const shared = globalThis.JYT_SHARED || {};
    const MESSAGE_TYPES = shared.MESSAGE_TYPES || {};
    const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS || {
        enabled: "on",
        engine: "auto",
        llm_engine: "openai",
        translate_shortcut: "",
        source_lang: "auto",
        target_lang: "auto",
        ui_lang: "auto",
        openai_api_url: "",
        openai_api_key: "",
        openai_model: "gpt-4o-mini",
        openai_custom_prompt: "",
        openai_thinking_model: "gpt-5-thinking",
        show_thoughts: false,
        openai_reasoning_effort: "medium",
        openai_max_completion_tokens: 0,
        custom_openai_api_url: "https://api.openai.com/v1/chat/completions",
        custom_openai_api_key: "",
        custom_openai_model: "gpt-4o-mini",
        custom_openai_custom_prompt: "",
        custom_openai_show_thoughts: false,
        custom_openai_reasoning_effort: "medium",
        custom_openai_max_completion_tokens: 0,
        deepseek_api_url: "https://api.deepseek.com/chat/completions",
        deepseek_api_key: "",
        deepseek_model: "deepseek-chat",
        deepseek_custom_prompt: "",
        deepseek_show_thoughts: false,
        qwen_api_url:
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        qwen_api_key: "",
        qwen_model: "qwen-plus",
        qwen_custom_prompt: "",
        qwen_show_thoughts: false,
        qwen_thinking_budget: 0,
        qwen_preserve_thinking: false,
        glm_api_url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        glm_api_key: "",
        glm_model: "glm-5.1",
        glm_custom_prompt: "",
        glm_show_thoughts: false,
        glm_clear_thinking: true,
        xiaomi_api_url: "https://api.xiaomimimo.com/v1/chat/completions",
        xiaomi_api_key: "",
        xiaomi_model: "mimo-v2-pro",
        xiaomi_custom_prompt: "",
        xiaomi_show_thoughts: false,
        xiaomi_max_completion_tokens: 0,
        claude_api_url: "https://api.anthropic.com/v1/messages",
        claude_api_key: "",
        claude_model: "claude-sonnet-4-6",
        claude_custom_prompt: "",
        claude_show_thoughts: false,
        claude_max_tokens: 4096,
        claude_thinking_mode: "adaptive",
        claude_thinking_budget: 2048,
        claude_thinking_effort: "medium",
        gemini_api_url:
            "https://generativelanguage.googleapis.com/v1beta/models",
        gemini_api_key: "",
        gemini_model: "gemini-2.5-flash",
        gemini_custom_prompt: "",
        gemini_show_thoughts: false,
        gemini_thinking_level: "high",
        gemini_thinking_budget: -1,
        ollama_api_url: "http://localhost:11434/api/chat",
        ollama_model: "",
        ollama_custom_model: "",
        ollama_custom_prompt: "",
        ollama_show_thoughts: false,
        special_translate_provider: "ollama",
        special_translate_api_url: "http://localhost:11434/api/chat",
        special_translate_api_key: "",
        special_translate_model: "translategemma",
        special_translate_custom_model: "",
        special_translate_custom_prompt: "",
        special_translate_show_thoughts: false,
        webllm_model: "Qwen3-0.6B-q4f16_1-MLC",
        webllm_custom_model: "",
        webllm_custom_prompt: "",
        webllm_show_thoughts: false,
        webllm_model_mirror: "official",
        webllm_custom_mirror: "",
        theme_mode: "auto",
        font_family: "",
        bubble_width_percent: 20,
        bubble_height_percent: 40,
        glossary_enabled: true,
        glossary_terms: [],
        glossary_version: 1,
        config_updated_at: 0,
    };
    const runtimeBaseUrl = chrome.runtime.getURL("");
    const isFirefoxRuntime = runtimeBaseUrl.startsWith("moz-extension://");
    const isWebLLMSupportedBrowser = !isFirefoxRuntime;
    const WEBLLM_WEAK_MEMORY_GB = 4;
    const WEBLLM_WEAK_CPU_CORES = 4;
    const RECOMMENDED_WEBLLM_MODELS = shared.RECOMMENDED_WEBLLM_MODELS || [
        "Qwen3-0.6B-q4f16_1-MLC",
        "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    ];
    const RECOMMENDED_SPECIAL_TRANSLATE_MODELS = ["translategemma"];
    const SPECIAL_PROVIDER_OLLAMA = "ollama";
    const SPECIAL_PROVIDER_OPENAI = "openai_compatible";
    const SPECIAL_DEFAULT_URL_BY_PROVIDER = {
        [SPECIAL_PROVIDER_OLLAMA]: "http://localhost:11434/api/chat",
        [SPECIAL_PROVIDER_OPENAI]: "https://api.openai.com/v1/chat/completions",
    };

    function getI18nApi() {
        if (
            typeof chrome !== "undefined" &&
            chrome.i18n &&
            typeof chrome.i18n.getMessage === "function"
        ) {
            return chrome.i18n;
        }
        if (
            typeof browser !== "undefined" &&
            browser.i18n &&
            typeof browser.i18n.getMessage === "function"
        ) {
            return browser.i18n;
        }
        return null;
    }

    const i18n = getI18nApi();
    const UI_LANG_TO_LOCALE = {
        zh: "zh_CN",
        en: "en",
    };
    let currentUiLang = "auto";
    let manualLocaleMessages = null;

    function normalizeBasicLang(lang) {
        if (!lang || typeof lang !== "string") return "";
        const lower = lang.toLowerCase();
        if (lower.startsWith("zh")) return "zh";
        if (lower.startsWith("en")) return "en";
        if (lower.startsWith("ja")) return "ja";
        if (lower.startsWith("ko")) return "ko";
        if (lower.startsWith("fr")) return "fr";
        if (lower.startsWith("de")) return "de";
        if (lower.startsWith("es")) return "es";
        if (lower.startsWith("ru")) return "ru";
        return lower.split("-")[0] || "";
    }

    function getManualMessage(key, substitutions) {
        const entry = manualLocaleMessages?.[key];
        const template =
            entry && typeof entry.message === "string" ? entry.message : "";
        if (!template) return "";

        const values = Array.isArray(substitutions)
            ? substitutions
            : substitutions == null
              ? []
              : [substitutions];

        return template.replace(/\$(\d+)/g, (full, indexText) => {
            const idx = Number(indexText) - 1;
            if (!Number.isInteger(idx) || idx < 0 || idx >= values.length) {
                return "";
            }
            return String(values[idx] ?? "");
        });
    }

    async function loadManualLocaleMessages(uiLang) {
        const normalized = normalizeBasicLang(uiLang);
        const localeDir = UI_LANG_TO_LOCALE[normalized];
        if (!localeDir) {
            manualLocaleMessages = null;
            return;
        }

        try {
            const url = chrome.runtime.getURL(
                `_locales/${localeDir}/messages.json`,
            );
            const resp = await fetch(url, { cache: "no-store" });
            if (!resp.ok) {
                manualLocaleMessages = null;
                return;
            }
            const json = await resp.json();
            manualLocaleMessages =
                json && typeof json === "object" ? json : null;
        } catch (err) {
            manualLocaleMessages = null;
        }
    }

    async function applyUiLanguage(uiLang) {
        currentUiLang = normalizeBasicLang(uiLang) || "auto";
        if (currentUiLang === "auto") {
            manualLocaleMessages = null;
        } else {
            await loadManualLocaleMessages(currentUiLang);
        }

        applyStaticI18n();
        updateCurrentPdfStatusUI(cachedActiveTab, cachedCurrentPdfUrl);
    }

    function t(key, fallback = "", substitutions) {
        if (!key) return fallback;
        if (currentUiLang !== "auto") {
            const manual = getManualMessage(key, substitutions);
            if (manual) {
                return manual;
            }
        }
        try {
            const message = i18n?.getMessage(key, substitutions);
            if (typeof message === "string" && message.trim()) {
                return message;
            }
        } catch (err) {
            // ignore i18n lookup failures and use fallback
        }
        return fallback || key;
    }

    function translateLegacyText(text) {
        const raw = String(text == null ? "" : text);

        const exactKeyMap = {
            本地保存失败: "optErrLocalSaveFailed",
            本地读取失败: "optErrLocalReadFailed",
            双向同步失败: "optErrBidirectionalSyncFailed",
            已取消同步: "optErrSyncCanceled",
            "同步冲突处理次数过多，请重试": "optErrSyncConflictTooManyRetries",
            请求模型列表超时: "optErrRequestModelListTimeout",
            "请求 Ollama 模型列表超时": "optErrRequestOllamaModelListTimeout",
            请求专用翻译模型列表超时: "optErrRequestSpecialModelListTimeout",
            模型加载中: "optWebllmModelLoading",
            "模型已加载完成，可直接用于划词翻译": "optWebllmModelReady",
            模型缓存已清理: "optWebllmCacheCleared",
            未知错误: "optUnknownError",
            "当前浏览器不可用 WebGPU": "optWebllmNoWebgpu",
            "当前浏览器不支持 WebLLM（仅 Chrome/Edge 可用）":
                "optWebllmUnsupportedChromeEdgeOnly",
            "设备检测通过，可尝试使用本地模型翻译。": "optWebllmPerfGood",
            "当前浏览器不支持 WebLLM": "optWebllmUnsupported",
            "请先选择或输入模型 ID": "optWebllmPleaseSelectModelId",
            "开始下载/加载模型...": "optWebllmStartingLoad",
            "无法连接后台服务，请重试": "optCannotConnectBackground",
            "正在清理模型缓存...": "optWebllmClearingCache",
            导出失败: "optExportFailed",
            导入失败: "optImportFailed",
            旧术语删除失败: "optGlossaryDeleteOldFailed",
            术语保存失败: "optGlossarySaveFailed",
            清空失败: "optClearFailed",
            删除失败: "optDeleteFailed",
            配置导出失败: "optConfigExportFailed",
            配置导入失败: "optConfigImportFailed",
            连接测试失败: "optSyncConnectionTestFailed",
            上传失败: "optSyncUploadFailed",
            下载失败: "optSyncDownloadFailed",
            "WebDAV 配置已保存到本地": "optSyncWebdavSaved",
            "正在测试 WebDAV 连接...": "optSyncTestingWebdav",
            "正在上传配置与术语到 WebDAV...": "optSyncUploadingWebdav",
            "正在从 WebDAV 下载配置与术语...": "optSyncDownloadingWebdav",
            "正在执行双向同步...": "optSyncRunningBidirectional",
            配置导出完成: "optConfigExportDone",
            配置导入完成: "optConfigImportDone",
            术语已保存: "optGlossarySaved",
            术语库已清空: "optGlossaryCleared",
            术语已删除: "optGlossaryDeleted",
            "已载入术语，编辑后点击更新": "optGlossaryLoadedForEdit",
            "保存失败: 请完整填写术语字段":
                "optGlossarySaveFailedIncompleteFields",
            "导入失败: 文件过大，请控制在 5MB 以内":
                "optGlossaryImportFailedFileTooLarge",
            "配置导入失败: 文件过大，请控制在 5MB 以内":
                "optConfigImportFailedFileTooLarge",
            "打开内置 PDF 页面失败，请重试": "optOpenBuiltinPdfFailed",
            已保存: "optSaved",
            已恢复默认: "optDefaultsRestored",
            "确定清空术语库吗？该操作不可撤销。": "optConfirmClearGlossary",
            "设备性能偏弱，继续启用 WebLLM 可能导致卡顿或加载失败，确定继续吗？":
                "optConfirmWebllmWeakPerf",
        };
        if (Object.prototype.hasOwnProperty.call(exactKeyMap, raw)) {
            return t(exactKeyMap[raw], raw);
        }

        const patterns = [
            [/^操作失败: (.+)$/u, "optPatternOperationFailed"],
            [/^设备内存约 (.+)$/u, "optPatternDeviceMemory"],
            [/^CPU 逻辑核心数约 (.+)$/u, "optPatternCpuCores"],
            [/^导出完成，共 (\d+) 条术语$/u, "optPatternGlossaryExportDone"],
            [/^导出失败: (.+)$/u, "optPatternGlossaryExportFailed"],
            [
                /^导入完成: 新增 (\d+)，覆盖 (\d+)，总计 (\d+)$/u,
                "optPatternGlossaryImportDone",
            ],
            [/^导入失败: (.+)$/u, "optPatternGlossaryImportFailed"],
            [/^保存失败: (.+)$/u, "optPatternSaveFailed"],
            [/^清空失败: (.+)$/u, "optPatternClearFailed"],
            [/^删除失败: (.+)$/u, "optPatternDeleteFailed"],
            [/^配置导出失败: (.+)$/u, "optPatternConfigExportFailed"],
            [/^配置导入失败: (.+)$/u, "optPatternConfigImportFailed"],
            [/^连接测试失败: (.+)$/u, "optPatternSyncConnTestFailed"],
            [
                /^连接成功: config\((.+)\) glossary\((.+)\)$/u,
                "optPatternSyncConnSuccess",
            ],
            [/^上传完成: 术语 (\d+) 条$/u, "optPatternSyncUploadDone"],
            [/^上传失败: (.+)$/u, "optPatternSyncUploadFailed"],
            [/^下载完成: 术语 (\d+) 条$/u, "optPatternSyncDownloadDone"],
            [/^下载失败: (.+)$/u, "optPatternSyncDownloadFailed"],
            [
                /^双向同步完成: 术语 (\d+) 条$/u,
                "optPatternSyncBidirectionalDone",
            ],
            [/^双向同步失败: (.+)$/u, "optPatternSyncBidirectionalFailed"],
            [
                /^本地同步配置读取失败: (.+)$/u,
                "optPatternSyncLocalConfigReadFailed",
            ],
            [/^术语列表加载失败: (.+)$/u, "optPatternGlossaryListLoadFailed"],
            [
                /^设备性能偏弱，不建议开启 WebLLM: (.+)。$/u,
                "optPatternWebllmWeakPerfReasons",
            ],
            [
                /^检测到同步冲突：配置字段 (\d+) 项，术语 (\d+) 项。\n请输入策略编号：\n1=远端覆盖本地\n2=本地覆盖远端\n3=按时间戳合并\n取消=中止同步$/u,
                "optPatternSyncConflictPrompt",
            ],
        ];

        for (const [regex, key] of patterns) {
            const match = raw.match(regex);
            if (match) {
                return t(key, raw, match.slice(1));
            }
        }

        return raw;
    }

    const ids = [
        "enable_select",
        "engine_select",
        "llm_engine_select",
        "translate_shortcut",
        "source_lang",
        "target_lang",
        "ui_lang",
        "openai_api_url",
        "openai_api_key",
        "openai_model",
        "openai_custom_prompt",
        "show_thoughts",
        "openai_reasoning_effort",
        "openai_max_completion_tokens",
        "custom_openai_api_url",
        "custom_openai_api_key",
        "custom_openai_model",
        "custom_openai_custom_prompt",
        "custom_openai_show_thoughts",
        "custom_openai_reasoning_effort",
        "custom_openai_max_completion_tokens",
        "deepseek_api_url",
        "deepseek_api_key",
        "deepseek_model",
        "deepseek_custom_prompt",
        "deepseek_show_thoughts",
        "qwen_api_url",
        "qwen_api_key",
        "qwen_model",
        "qwen_custom_prompt",
        "qwen_show_thoughts",
        "qwen_thinking_budget",
        "qwen_preserve_thinking",
        "glm_api_url",
        "glm_api_key",
        "glm_model",
        "glm_custom_prompt",
        "glm_show_thoughts",
        "glm_clear_thinking",
        "xiaomi_api_url",
        "xiaomi_api_key",
        "xiaomi_model",
        "xiaomi_custom_prompt",
        "xiaomi_show_thoughts",
        "xiaomi_max_completion_tokens",
        "claude_api_url",
        "claude_api_key",
        "claude_model",
        "claude_custom_prompt",
        "claude_show_thoughts",
        "claude_max_tokens",
        "claude_thinking_mode",
        "claude_thinking_budget",
        "claude_thinking_effort",
        "gemini_api_url",
        "gemini_api_key",
        "gemini_model",
        "gemini_custom_prompt",
        "gemini_show_thoughts",
        "gemini_thinking_level",
        "gemini_thinking_budget",
        "ollama_api_url",
        "ollama_model_select",
        "ollama_custom_model",
        "ollama_custom_prompt",
        "ollama_show_thoughts",
        "special_translate_provider",
        "special_translate_api_url",
        "special_translate_api_key",
        "special_translate_model_select",
        "special_translate_custom_model",
        "special_translate_custom_prompt",
        "special_translate_show_thoughts",
        "webllm_model_select",
        "webllm_custom_model",
        "webllm_custom_prompt",
        "webllm_show_thoughts",
        "webllm_model_mirror",
        "webllm_custom_mirror",
        "theme_mode",
        "font_family",
        "bubble_width_percent",
        "bubble_height_percent",
    ];
    const els = {};
    ids.forEach((id) => (els[id] = document.getElementById(id)));
    const openaiSection = document.getElementById("openai_section");
    const customOpenAISection = document.getElementById(
        "custom_openai_section",
    );
    const deepseekSection = document.getElementById("deepseek_section");
    const qwenSection = document.getElementById("qwen_section");
    const glmSection = document.getElementById("glm_section");
    const xiaomiSection = document.getElementById("xiaomi_section");
    const claudeSection = document.getElementById("claude_section");
    const geminiSection = document.getElementById("gemini_section");
    const ollamaSection = document.getElementById("ollama_section");
    const specialTranslateSection = document.getElementById(
        "special_translate_section",
    );
    const webllmSection = document.getElementById("webllm_section");
    const webllmPerformanceNote = document.getElementById(
        "webllm_performance_note",
    );
    const webllmStatusEl = document.getElementById("webllm_status");
    const webllmDownloadBtn = document.getElementById("webllm_download");
    const webllmClearCacheBtn = document.getElementById("webllm_clear_cache");
    const openLocalPdfBtn = document.getElementById("open_local_pdf");
    const currentPdfStatusEl = document.getElementById("current_pdf_status");
    const glossaryExportBtn = document.getElementById("glossary_export");
    const glossaryImportBtn = document.getElementById("glossary_import");
    const glossaryImportFileInput = document.getElementById(
        "glossary_import_file",
    );
    const glossaryStatusEl = document.getElementById("glossary_status");
    const glossaryListEl = document.getElementById("glossary_list");
    const glossarySaveBtn = document.getElementById("glossary_save");
    const glossaryCancelEditBtn = document.getElementById(
        "glossary_cancel_edit",
    );
    const glossaryClearBtn = document.getElementById("glossary_clear");
    const glossarySourceLangEl = document.getElementById(
        "glossary_source_lang",
    );
    const glossaryTargetLangEl = document.getElementById(
        "glossary_target_lang",
    );
    const glossarySourceTermEl = document.getElementById(
        "glossary_source_term",
    );
    const glossaryTargetTermEl = document.getElementById(
        "glossary_target_term",
    );
    const configExportBtn = document.getElementById("config_export");
    const configImportBtn = document.getElementById("config_import");
    const configImportFileInput = document.getElementById("config_import_file");
    const configStatusEl = document.getElementById("config_status");
    const webdavBaseUrlEl = document.getElementById("webdav_base_url");
    const webdavUsernameEl = document.getElementById("webdav_username");
    const webdavPasswordEl = document.getElementById("webdav_password");
    const webdavRemoteDirEl = document.getElementById("webdav_remote_dir");
    const webdavSaveLocalBtn = document.getElementById("webdav_save_local");
    const syncTestBtn = document.getElementById("sync_test");
    const syncUploadBtn = document.getElementById("sync_upload");
    const syncDownloadBtn = document.getElementById("sync_download");
    const syncBidirectionalBtn = document.getElementById("sync_bidirectional");
    const syncStatusEl = document.getElementById("sync_status");

    function setOptionText(selectEl, value, messageKey, fallback) {
        if (!selectEl) return;
        const option = Array.from(selectEl.options || []).find(
            (item) => item.value === value,
        );
        if (!option) return;
        option.textContent = t(messageKey, fallback || option.textContent);
    }

    function applyLanguageOptions(selectEl, autoKey) {
        if (!selectEl) return;
        if (autoKey) {
            setOptionText(selectEl, "auto", autoKey);
        }
        setOptionText(selectEl, "zh", "langZh");
        setOptionText(selectEl, "en", "langEn");
        setOptionText(selectEl, "ja", "langJa");
        setOptionText(selectEl, "ko", "langKo");
        setOptionText(selectEl, "fr", "langFr");
        setOptionText(selectEl, "de", "langDe");
        setOptionText(selectEl, "es", "langEs");
        setOptionText(selectEl, "ru", "langRu");
    }

    function applyBooleanOptions(selectEl) {
        if (!selectEl) return;
        setOptionText(selectEl, "true", "optSelectYes", "是");
        setOptionText(selectEl, "false", "optSelectNo", "否");
    }

    function applySelectI18n() {
        setOptionText(els.enable_select, "on", "optSelectEnableOn", "开启");
        setOptionText(
            els.enable_select,
            "off",
            "optSelectEnableOff",
            "关闭（使用快捷键）",
        );

        setOptionText(
            els.engine_select,
            "auto",
            "optSelectEngineAuto",
            "自动（优先 OpenAI API）",
        );
        setOptionText(
            els.engine_select,
            "llm",
            "optSelectEngineLlm",
            "大模型翻译",
        );
        setOptionText(
            els.engine_select,
            "special_translate",
            "optSelectEngineSpecialTranslate",
            "专用大模型翻译",
        );
        setOptionText(
            els.engine_select,
            "custom_openai",
            "optSelectEngineCustomOpenAI",
            "自定义 OpenAI",
        );
        setOptionText(
            els.engine_select,
            "google",
            "optSelectEngineGoogle",
            "谷歌翻译",
        );
        setOptionText(
            els.engine_select,
            "bing",
            "optSelectEngineBing",
            "Bing翻译",
        );
        setOptionText(
            els.engine_select,
            "browser",
            "optSelectEngineBrowserAiExperimental",
            "浏览器AI（实验）",
        );

        setOptionText(
            els.theme_mode,
            "auto",
            "optSelectThemeAuto",
            "自动（跟随系统）",
        );
        setOptionText(els.theme_mode, "light", "optSelectThemeLight", "明亮");
        setOptionText(els.theme_mode, "dark", "optSelectThemeDark", "黑暗");

        setOptionText(
            els.llm_engine_select,
            "ollama",
            "optSelectLlmProviderOllama",
            "Ollama 本地服务",
        );
        setOptionText(
            els.llm_engine_select,
            "webllm",
            "optSelectLlmProviderWebllm",
            "WebLLM 本地模型（实验）",
        );

        applyBooleanOptions(els.show_thoughts);
        applyBooleanOptions(els.custom_openai_show_thoughts);
        applyBooleanOptions(els.deepseek_show_thoughts);
        applyBooleanOptions(els.qwen_show_thoughts);
        applyBooleanOptions(els.qwen_preserve_thinking);
        applyBooleanOptions(els.glm_show_thoughts);
        applyBooleanOptions(els.glm_clear_thinking);
        applyBooleanOptions(els.xiaomi_show_thoughts);
        applyBooleanOptions(els.claude_show_thoughts);
        applyBooleanOptions(els.gemini_show_thoughts);
        applyBooleanOptions(els.ollama_show_thoughts);
        applyBooleanOptions(els.webllm_show_thoughts);
        applyBooleanOptions(els.special_translate_show_thoughts);

        setOptionText(
            els.claude_thinking_mode,
            "adaptive",
            "optSelectClaudeThinkingModeAdaptive",
            "adaptive（推荐）",
        );
        setOptionText(
            els.claude_thinking_mode,
            "enabled",
            "optSelectClaudeThinkingModeEnabled",
            "enabled（手动预算）",
        );

        setOptionText(
            els.ollama_model_select,
            "",
            "optSelectOllamaLoadingModels",
            "正在加载模型列表...",
        );
        setOptionText(
            els.ollama_model_select,
            "custom",
            "modelCustomName",
            "自定义模型名",
        );

        setOptionText(
            els.webllm_model_select,
            "Qwen3-0.6B-q4f16_1-MLC",
            "optSelectWebllmModelQwen3Recommended",
            "Qwen3 0.6B (推荐)",
        );
        setOptionText(
            els.webllm_model_select,
            "SmolLM2-360M-Instruct-q4f16_1-MLC",
            "optSelectWebllmModelSmollmLight",
            "SmolLM2 360M (更轻量)",
        );
        setOptionText(
            els.webllm_model_select,
            "Llama-3.2-1B-Instruct-q4f16_1-MLC",
            "optSelectWebllmModelLlamaBetter",
            "Llama 3.2 1B (效果更好)",
        );
        setOptionText(
            els.webllm_model_select,
            "custom",
            "modelCustomId",
            "自定义模型 ID",
        );

        setOptionText(
            els.webllm_model_mirror,
            "official",
            "optSelectWebllmMirrorOfficial",
            "官方 HuggingFace",
        );
        setOptionText(
            els.webllm_model_mirror,
            "hf-mirror",
            "optSelectWebllmMirrorHfMirrorCn",
            "hf-mirror（中国推荐）",
        );
        setOptionText(
            els.webllm_model_mirror,
            "custom",
            "optSelectWebllmMirrorCustom",
            "自定义镜像",
        );

        setOptionText(
            els.special_translate_provider,
            "ollama",
            "optSelectSpecialProviderOllama",
            "Ollama 本地/远端",
        );
        setOptionText(
            els.special_translate_provider,
            "openai_compatible",
            "optSelectSpecialProviderOpenAiCompatible",
            "OpenAI 兼容 API",
        );

        setOptionText(
            els.special_translate_model_select,
            "translategemma",
            "optSelectSpecialModelTranslategemmaRecommended",
            "translategemma（推荐）",
        );
        setOptionText(
            els.special_translate_model_select,
            "custom",
            "modelCustomName",
            "自定义模型名",
        );
    }

    const STATIC_TEXT_I18N_KEYS = {
        基础设置: "optUiSectionBasicSettings",
        是否启用划词翻译: "optUiLabelEnableSelectionTranslation",
        翻译快捷键: "optUiLabelTranslateShortcut",
        "点击输入框后直接按键录制快捷键；留空表示不启用快捷键。":
            "optUiHintShortcutRecorder",
        首选翻译引擎: "optUiLabelPreferredEngine",
        "实验功能目前只支持最新的Chrome内核浏览器，并且可能会下载模型":
            "optUiHintBrowserAiExperimental",
        源语言: "optUiLabelSourceLanguage",
        目标语言: "optUiLabelTargetLanguage",
        外观设置: "optUiSectionAppearanceSettings",
        主题模式: "optUiLabelThemeMode",
        自定义字体: "optUiLabelCustomFont",
        "最大宽度占比 (5-95%)": "optUiLabelMaxWidthPercent",
        "最大高度占比 (5-95%)": "optUiLabelMaxHeightPercent",
        大模型翻译: "optUiSectionLlmTranslation",
        大模型提供方: "optUiLabelLlmProvider",
        "先在“通用”里选择“大模型翻译”，再在这里选择具体模型来源。":
            "optUiHintLlmProvider",
        "OpenAI / 大模型配置": "optUiSectionOpenaiConfig",
        "API 地址": "optUiLabelApiUrl",
        "API Key": "optUiLabelApiKey",
        翻译模型: "optUiLabelTranslateModel",
        "自定义翻译 Prompt（仅 OpenAI 生效）": "optUiLabelCustomPromptOpenai",
        显示思考过程: "optUiLabelShowThoughts",
        "OpenAI 推理强度": "optUiLabelOpenaiReasoningEffort",
        "OpenAI 最大输出 Token（0=自动）": "optUiLabelOpenaiMaxOutputTokens",
        "自定义 OpenAI 兼容配置": "optUiSectionCustomOpenaiConfig",
        模型: "optUiLabelModel",
        "自定义翻译 Prompt（仅自定义 OpenAI 生效）":
            "optUiLabelCustomPromptCustomOpenai",
        推理强度: "optUiLabelReasoningEffort",
        "最大输出 Token（0=自动）": "optUiLabelMaxOutputTokensAuto",
        "DeepSeek 配置": "optUiSectionDeepseekConfig",
        "自定义翻译 Prompt（仅 DeepSeek 生效）":
            "optUiLabelCustomPromptDeepseek",
        "Qwen DashScope 配置": "optUiSectionQwenConfig",
        "自定义翻译 Prompt（仅 Qwen 生效）": "optUiLabelCustomPromptQwen",
        "思考预算（0=自动）": "optUiLabelQwenThinkingBudget",
        保留历史思考: "optUiLabelQwenPreserveThinking",
        "GLM 配置": "optUiSectionGlmConfig",
        "自定义翻译 Prompt（仅 GLM 生效）": "optUiLabelCustomPromptGlm",
        清理历史思考上下文: "optUiLabelGlmClearThinking",
        "Xiaomi MiMo 配置": "optUiSectionXiaomiConfig",
        "自定义翻译 Prompt（仅 Xiaomi 生效）": "optUiLabelCustomPromptXiaomi",
        "Claude 配置": "optUiSectionClaudeConfig",
        "自定义翻译 Prompt（仅 Claude 生效）": "optUiLabelCustomPromptClaude",
        思考模式: "optUiLabelClaudeThinkingMode",
        "思考预算（enabled 模式）": "optUiLabelClaudeThinkingBudget",
        "adaptive 思考强度": "optUiLabelClaudeAdaptiveEffort",
        "最大输出 Token": "optUiLabelMaxOutputTokens",
        "Gemini 配置": "optUiSectionGeminiConfig",
        "自定义翻译 Prompt（仅 Gemini 生效）": "optUiLabelCustomPromptGemini",
        "Gemini 3 思考等级": "optUiLabelGeminiThinkingLevel",
        "Gemini 2.5 思考预算（-1 动态，0 关闭）":
            "optUiLabelGeminiThinkingBudget",
        "Ollama 配置": "optUiSectionOllamaConfig",
        "Ollama 地址": "optUiLabelOllamaAddress",
        "默认使用本地 Ollama 服务地址，可修改为远端地址。":
            "optUiHintOllamaDefaultAddress",
        "自定义翻译 Prompt（仅 Ollama 生效）": "optUiLabelCustomPromptOllama",
        "自动检测模型来自 /api/tags 的 models[].name。":
            "optUiHintOllamaModelSource",
        "WebLLM 本地模型配置": "optUiSectionWebllmConfig",
        推荐模型: "optUiLabelRecommendedModel",
        "自定义翻译 Prompt（仅 WebLLM 生效）": "optUiLabelCustomPromptWebllm",
        下载镜像: "optUiLabelDownloadMirror",
        自定义镜像地址: "optUiLabelCustomMirrorAddress",
        "下载/缓存模型": "optUiBtnWebllmDownload",
        清理缓存: "optUiBtnWebllmClearCache",
        专用大模型翻译: "optUiSectionSpecialTranslate",
        提供方: "optUiLabelProvider",
        "API Key（OpenAI 兼容可选）":
            "optUiLabelApiKeyOpenaiCompatibleOptional",
        专用模型: "optUiLabelSpecialModel",
        "自定义翻译 Prompt（仅非 translategemma 生效）":
            "optUiLabelCustomPromptSpecialTranslate",
        "该引擎面向专用翻译模型。当前内置 Translationgemma，命中后会自动套用官方翻译模板。":
            "optUiHintSpecialTranslateBuiltin",
        术语管理: "optUiSectionGlossaryManagement",
        原文: "optUiLabelSourceText",
        译文: "optUiLabelTargetText",
        取消: "optUiBtnCancel",
        导入: "optUiBtnImport",
        导出: "optUiBtnExport",
        清空: "optUiBtnClear",
        "WebDAV 同步": "optUiSectionWebdavSync",
        账号: "optUiLabelAccount",
        密码: "optUiLabelPassword",
        "目录 (如 /jyt-sync)": "optUiLabelRemoteDir",
        保存凭证: "optUiBtnSaveCredential",
        测试连接: "optUiBtnTestConnection",
        上传到云端: "optUiBtnUploadToCloud",
        从云端下载: "optUiBtnDownloadFromCloud",
        双向同步: "optUiBtnBidirectionalSync",
        本地配置备份: "optUiSectionLocalConfigBackup",
        导入配置: "optUiBtnImportConfig",
        导出配置: "optUiBtnExportConfig",
    };

    const PLACEHOLDER_I18N_KEYS = {
        "例如: Alt+T / Ctrl+Shift+Y": "optUiPlaceholderShortcut",
        "例如: 'Microsoft YaHei', 'Segoe UI'": "optUiPlaceholderFontFamily",
        "例如: qwen3:8b": "optUiPlaceholderOllamaModel",
        "例如: Qwen3-0.6B-q4f16_1-MLC": "optUiPlaceholderWebllmModelId",
        "例如: translategemma:4b": "optUiPlaceholderSpecialModel",
        "可用变量: {targetLang} {text} {glossary} {glossaryConstraint}. 示例：术语约束（若原文命中，请优先使用以下术语翻译）：{glossary}。将下面的语句翻译为{targetLang}，不要有多余的输出。":
            "optUiPlaceholderPromptTemplate",
        "可用变量: {targetLang} {text} {glossary} {glossaryConstraint}":
            "optUiPlaceholderPromptTemplateSimple",
    };

    function normalizeStaticText(text) {
        return String(text || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function applyStaticTextI18nMap() {
        const candidates = document.querySelectorAll(
            "label, .jyt-section-title, .jyt-hint, button",
        );
        candidates.forEach((el) => {
            const raw = normalizeStaticText(el.textContent);
            const messageKey = STATIC_TEXT_I18N_KEYS[raw];
            if (!messageKey) return;
            el.textContent = t(messageKey, raw);
        });
    }

    function applyPlaceholderI18nMap() {
        const candidates = document.querySelectorAll(
            "input[placeholder], textarea[placeholder]",
        );
        candidates.forEach((el) => {
            const raw = normalizeStaticText(el.getAttribute("placeholder"));
            const messageKey = PLACEHOLDER_I18N_KEYS[raw];
            if (!messageKey) return;
            el.setAttribute("placeholder", t(messageKey, raw));
        });
    }

    function applyStaticI18n() {
        document.title = t("optionsPageTitle", document.title);

        const titleEl = document.querySelector(".jyt-form h2");
        if (titleEl)
            titleEl.textContent = t("optionsHeader", titleEl.textContent);

        const tabGeneralEl = document.querySelector('[data-tab="tab_general"]');
        if (tabGeneralEl)
            tabGeneralEl.textContent = t(
                "optionsTabGeneral",
                tabGeneralEl.textContent,
            );

        const tabEngineEl = document.querySelector('[data-tab="tab_engine"]');
        if (tabEngineEl)
            tabEngineEl.textContent = t(
                "optionsTabEngine",
                tabEngineEl.textContent,
            );

        const tabGlossaryEl = document.querySelector(
            '[data-tab="tab_glossary"]',
        );
        if (tabGlossaryEl)
            tabGlossaryEl.textContent = t(
                "optionsTabGlossary",
                tabGlossaryEl.textContent,
            );

        const tabSyncEl = document.querySelector('[data-tab="tab_sync"]');
        if (tabSyncEl)
            tabSyncEl.textContent = t("optionsTabSync", tabSyncEl.textContent);

        const saveBtn = document.getElementById("save");
        if (saveBtn)
            saveBtn.textContent = t("optionsSaveAll", saveBtn.textContent);

        const resetBtn = document.getElementById("reset");
        if (resetBtn)
            resetBtn.textContent = t("optionsReset", resetBtn.textContent);

        if (openLocalPdfBtn) {
            openLocalPdfBtn.textContent = t(
                "optionsOpenLocalPdf",
                openLocalPdfBtn.textContent,
            );
        }

        applyLanguageOptions(els.source_lang, "langAutoDetect");
        applyLanguageOptions(els.target_lang, "langAutoSelect");
        applyLanguageOptions(els.ui_lang, "langAutoFollowBrowser");
        applyLanguageOptions(glossarySourceLangEl, null);
        applyLanguageOptions(glossaryTargetLangEl, null);
        applySelectI18n();
        applyStaticTextI18nMap();
        applyPlaceholderI18nMap();

        const uiLangLabelEl = document.getElementById("ui_lang_label");
        if (uiLangLabelEl) {
            uiLangLabelEl.textContent = t("optionsUiLang", "界面语言");
        }
        const uiLangHintEl = document.getElementById("ui_lang_hint");
        if (uiLangHintEl) {
            uiLangHintEl.textContent = t(
                "optionsUiLangHint",
                "当目标语言为“自动选择”时，会优先跟随这里的界面语言设置。",
            );
        }
    }

    applyStaticI18n();

    let cachedActiveTab = null;
    let cachedCurrentPdfUrl = "";
    let webllmPort = null;
    let webllmPerfProfile = null;
    const webllmModelRequestResolvers = new Map();
    const ollamaModelRequestResolvers = new Map();
    const specialModelRequestResolvers = new Map();
    let glossaryTermsCache = [];
    let glossaryEditingOriginal = null;
    let syncBusy = false;
    const LLM_ENGINES = new Set([
        "openai",
        "gemini",
        "claude",
        "qwen",
        "deepseek",
        "glm",
        "xiaomi",
        "ollama",
        "webllm",
    ]);

    // --- Added: UI Tab Logic & Toast ---
    const tabs = document.querySelectorAll(".jyt-tab");
    const contents = document.querySelectorAll(".jyt-tab-content");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            contents.forEach((c) => c.classList.remove("active"));
            tab.classList.add("active");
            const targetId = tab.dataset.tab;
            if (targetId)
                document.getElementById(targetId).classList.add("active");
        });
    });

    const toastContainer = document.getElementById("toast_container");
    const showToast = (window.showToast = (msg, isError = false) => {
        if (!toastContainer) return;
        const toast = document.createElement("div");
        toast.className = `jyt-toast jyt-toast-show ${isError ? "jyt-toast-error" : "jyt-toast-success"}`;
        toast.textContent = translateLegacyText(msg);
        toastContainer.appendChild(toast);
        setTimeout(() => toast.classList.remove("jyt-toast-show"), 2500);
        setTimeout(() => toast.remove(), 3000);
    });
    // -----------------------------------

    function isRunningInPopup() {
        try {
            const extensionApi = chrome.extension;
            if (!extensionApi || typeof extensionApi.getViews !== "function") {
                return false;
            }
            const popupViews = extensionApi.getViews({ type: "popup" }) || [];
            return popupViews.includes(window);
        } catch (err) {
            return false;
        }
    }

    function openImportInNewTab() {
        return new Promise((resolve, reject) => {
            try {
                const url = chrome.runtime.getURL(
                    "options.html#glossary-import",
                );
                const maybePromise = chrome.tabs.create({ url });
                if (maybePromise && typeof maybePromise.then === "function") {
                    maybePromise.then(() => resolve()).catch(reject);
                    return;
                }
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    function normalizeGlossaryLang(lang) {
        const value = String(lang || "")
            .trim()
            .toLowerCase();
        if (!value || value === "auto") return "";
        return value.split("-")[0];
    }

    function normalizeGlossaryTermText(text) {
        return String(text || "").trim();
    }

    function glossaryTermKey(term) {
        const sourceLang = normalizeGlossaryLang(term?.sourceLang);
        const targetLang = normalizeGlossaryLang(term?.targetLang);
        const sourceTerm = normalizeGlossaryTermText(
            term?.sourceTerm,
        ).toLowerCase();
        return `${sourceLang}::${targetLang}::${sourceTerm}`;
    }

    function setGlossaryStatus(text, isError) {
        if (!glossaryStatusEl) return;
        glossaryStatusEl.textContent = translateLegacyText(text || "");
        glossaryStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function getGlossaryFormTerm() {
        return {
            sourceLang: normalizeGlossaryLang(glossarySourceLangEl?.value),
            targetLang: normalizeGlossaryLang(glossaryTargetLangEl?.value),
            sourceTerm: normalizeGlossaryTermText(glossarySourceTermEl?.value),
            targetTerm: normalizeGlossaryTermText(glossaryTargetTermEl?.value),
        };
    }

    function resetGlossaryEditor() {
        glossaryEditingOriginal = null;
        if (glossarySourceLangEl) glossarySourceLangEl.value = "en";
        if (glossaryTargetLangEl) glossaryTargetLangEl.value = "zh";
        if (glossarySourceTermEl) glossarySourceTermEl.value = "";
        if (glossaryTargetTermEl) glossaryTargetTermEl.value = "";
        if (glossarySaveBtn)
            glossarySaveBtn.textContent = t("glossaryAdd", "新增术语");
    }

    function populateGlossaryEditor(term) {
        glossaryEditingOriginal = term || null;
        if (!term) {
            resetGlossaryEditor();
            return;
        }

        if (glossarySourceLangEl) glossarySourceLangEl.value = term.sourceLang;
        if (glossaryTargetLangEl) glossaryTargetLangEl.value = term.targetLang;
        if (glossarySourceTermEl) glossarySourceTermEl.value = term.sourceTerm;
        if (glossaryTargetTermEl) glossaryTargetTermEl.value = term.targetTerm;
        if (glossarySaveBtn)
            glossarySaveBtn.textContent = t("glossaryUpdate", "更新术语");
    }

    function renderGlossaryList(terms) {
        if (!glossaryListEl) return;
        const list = Array.isArray(terms) ? terms : [];
        if (list.length === 0) {
            glossaryListEl.innerHTML = `<div class="jyt-glossary-empty">${t("glossaryEmpty", "暂无术语，先添加一条吧。")}</div>`;
            return;
        }

        const rows = list
            .map((term, index) => {
                const pair = `${term.sourceLang} -> ${term.targetLang}`;
                return `
                    <tr>
                        <td>${pair}</td>
                        <td>${term.sourceTerm}</td>
                        <td>${term.targetTerm}</td>
                        <td>
                            <button class="jyt-glossary-row-edit" data-index="${index}" type="button">${t("glossaryEdit", "编辑")}</button>
                            <button class="jyt-glossary-row-delete" data-index="${index}" type="button">${t("glossaryDelete", "删除")}</button>
                        </td>
                    </tr>
                `;
            })
            .join("");

        glossaryListEl.innerHTML = `
            <table class="jyt-glossary-table">
                <thead>
                    <tr>
                        <th>${t("glossaryHeaderPair", "语言对")}</th>
                        <th>${t("glossaryHeaderSource", "原文")}</th>
                        <th>${t("glossaryHeaderTarget", "目标")}</th>
                        <th>${t("glossaryHeaderAction", "操作")}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    async function refreshGlossaryList() {
        const result = await sendTermMessage(
            MESSAGE_TYPES.TERM_LIST || "TERM_LIST",
        );
        if (!result?.ok) {
            throw new Error(
                result?.error || t("errorTermListFetch", "术语列表获取失败"),
            );
        }

        const sorted = (Array.isArray(result.terms) ? result.terms : []).sort(
            (a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0),
        );
        glossaryTermsCache = sorted;
        renderGlossaryList(sorted);
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () =>
                reject(new Error(t("errorReadFile", "读取文件失败")));
            reader.readAsText(file, "utf-8");
        });
    }

    function sanitizeGlossaryTerms(rawTerms) {
        const input = Array.isArray(rawTerms) ? rawTerms : [];
        const map = new Map();

        for (const item of input) {
            const sourceTerm = normalizeGlossaryTermText(item?.sourceTerm);
            const targetTerm = normalizeGlossaryTermText(item?.targetTerm);
            const sourceLang = normalizeGlossaryLang(item?.sourceLang);
            const targetLang = normalizeGlossaryLang(item?.targetLang);
            if (!sourceTerm || !targetTerm || !sourceLang || !targetLang) {
                continue;
            }

            const now = Date.now();
            const normalized = {
                sourceTerm,
                targetTerm,
                sourceLang,
                targetLang,
                createdAt: Number(item?.createdAt) || now,
                updatedAt: Number(item?.updatedAt) || now,
            };
            map.set(glossaryTermKey(normalized), normalized);
        }

        return Array.from(map.values());
    }

    function sanitizeConfigPayload(rawPayload) {
        const input =
            rawPayload && typeof rawPayload === "object" ? rawPayload : {};
        const next = {};
        const keys = Object.keys(DEFAULT_SETTINGS).filter(
            (key) => key !== "glossary_terms" && key !== "glossary_version",
        );

        for (const key of keys) {
            const fallback = DEFAULT_SETTINGS[key];
            const value = input[key];

            if (
                key === "show_thoughts" ||
                key === "custom_openai_show_thoughts" ||
                key === "deepseek_show_thoughts" ||
                key === "qwen_show_thoughts" ||
                key === "webllm_show_thoughts" ||
                key === "qwen_preserve_thinking" ||
                key === "glm_show_thoughts" ||
                key === "glm_clear_thinking" ||
                key === "xiaomi_show_thoughts" ||
                key === "claude_show_thoughts" ||
                key === "gemini_show_thoughts"
            ) {
                next[key] = typeof value === "boolean" ? value : !!fallback;
                continue;
            }

            if (
                key === "openai_max_completion_tokens" ||
                key === "custom_openai_max_completion_tokens" ||
                key === "qwen_thinking_budget" ||
                key === "xiaomi_max_completion_tokens" ||
                key === "claude_max_tokens" ||
                key === "claude_thinking_budget" ||
                key === "gemini_thinking_budget"
            ) {
                const numericValue = Number(value);
                next[key] = Number.isFinite(numericValue)
                    ? Math.floor(numericValue)
                    : fallback;
                continue;
            }

            if (
                key === "bubble_width_percent" ||
                key === "bubble_height_percent"
            ) {
                next[key] = clampPercent(value, fallback);
                continue;
            }

            if (key === "config_updated_at") {
                const ts = Number(value);
                next[key] = Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : 0;
                continue;
            }

            if (typeof fallback === "string") {
                next[key] = String(value == null ? fallback : value).trim();
                continue;
            }

            next[key] = value == null ? fallback : value;
        }

        return next;
    }

    function setConfigStatus(text, isError) {
        if (!configStatusEl) return;
        configStatusEl.textContent = translateLegacyText(text || "");
        configStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function setSyncStatus(text, isError) {
        if (!syncStatusEl) return;
        syncStatusEl.textContent = translateLegacyText(text || "");
        syncStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function downloadJsonFile(payload, filePrefix) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        a.href = url;
        a.download = `${filePrefix}-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function getWebDavFormData() {
        return {
            baseUrl: String(webdavBaseUrlEl?.value || "").trim(),
            username: String(webdavUsernameEl?.value || "").trim(),
            password: String(webdavPasswordEl?.value || ""),
            remoteDir: String(webdavRemoteDirEl?.value || "/jyt-sync").trim(),
        };
    }

    function setWebDavFormData(data) {
        const value = data && typeof data === "object" ? data : {};
        if (webdavBaseUrlEl) webdavBaseUrlEl.value = value.baseUrl || "";
        if (webdavUsernameEl) webdavUsernameEl.value = value.username || "";
        if (webdavPasswordEl) webdavPasswordEl.value = value.password || "";
        if (webdavRemoteDirEl)
            webdavRemoteDirEl.value = value.remoteDir || "/jyt-sync";
    }

    async function saveWebDavLocalSettings() {
        const payload = getWebDavFormData();
        if (
            typeof browser !== "undefined" &&
            browser.storage &&
            browser.storage.local &&
            typeof browser.storage.local.set === "function"
        ) {
            await browser.storage.local.set({ webdav_sync: payload });
            return payload;
        }

        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.set({ webdav_sync: payload }, () => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        reject(new Error(err.message || "本地保存失败"));
                        return;
                    }
                    resolve(payload);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    async function loadWebDavLocalSettings() {
        const fallback = {
            baseUrl: "",
            username: "",
            password: "",
            remoteDir: "/jyt-sync",
        };

        if (
            typeof browser !== "undefined" &&
            browser.storage &&
            browser.storage.local &&
            typeof browser.storage.local.get === "function"
        ) {
            const items = await browser.storage.local.get({
                webdav_sync: fallback,
            });
            const value =
                items?.webdav_sync && typeof items.webdav_sync === "object"
                    ? items.webdav_sync
                    : fallback;
            return value;
        }

        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get({ webdav_sync: fallback }, (items) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        reject(new Error(err.message || "本地读取失败"));
                        return;
                    }

                    const value =
                        items?.webdav_sync &&
                        typeof items.webdav_sync === "object"
                            ? items.webdav_sync
                            : fallback;
                    resolve(value);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    function setSyncButtonsEnabled(enabled) {
        syncBusy = !enabled;
        if (syncTestBtn) syncTestBtn.disabled = !enabled;
        if (syncUploadBtn) syncUploadBtn.disabled = !enabled;
        if (syncDownloadBtn) syncDownloadBtn.disabled = !enabled;
        if (syncBidirectionalBtn) syncBidirectionalBtn.disabled = !enabled;
    }

    function sendBackgroundMessage(type, payload) {
        const request = {
            type,
            ...(payload || {}),
        };

        if (
            typeof browser !== "undefined" &&
            browser.runtime &&
            typeof browser.runtime.sendMessage === "function"
        ) {
            return browser.runtime.sendMessage(request);
        }

        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(request, (resp) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        reject(
                            new Error(
                                err.message ||
                                    t(
                                        "errorBackgroundMessageSend",
                                        "后台消息发送失败",
                                    ),
                            ),
                        );
                        return;
                    }
                    resolve(resp);
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    function sendTermMessage(type, payload) {
        return sendBackgroundMessage(type, payload);
    }

    async function askConflictPolicy(conflict) {
        const cfgCount = Array.isArray(conflict?.configFields)
            ? conflict.configFields.length
            : 0;
        const termCount = Number(conflict?.glossaryConflictCount || 0);
        const answer = window.prompt(
            translateLegacyText(
                `检测到同步冲突：配置字段 ${cfgCount} 项，术语 ${termCount} 项。\n请输入策略编号：\n1=远端覆盖本地\n2=本地覆盖远端\n3=按时间戳合并\n取消=中止同步`,
            ),
            "3",
        );
        if (answer == null) return null;

        const value = String(answer).trim();
        if (value === "1") return "remote_wins";
        if (value === "2") return "local_wins";
        if (value === "3") return "merge_newest";
        return null;
    }

    async function runBidirectionalSync(webdav) {
        let conflictPolicy = "ask";

        for (let i = 0; i < 3; i += 1) {
            const result = await sendBackgroundMessage(
                MESSAGE_TYPES.SYNC_BIDIRECTIONAL || "SYNC_BIDIRECTIONAL",
                {
                    webdav,
                    conflictPolicy,
                },
            );

            if (result?.ok) {
                return result;
            }

            if (result?.errorCode !== "SYNC_CONFLICT") {
                throw new Error(result?.error || "双向同步失败");
            }

            const selected = await askConflictPolicy(result?.conflict || {});
            if (!selected) {
                throw new Error("已取消同步");
            }
            conflictPolicy = selected;
        }

        throw new Error("同步冲突处理次数过多，请重试");
    }

    function setWebLLMStatus(text, isError) {
        if (!webllmStatusEl) return;
        webllmStatusEl.textContent = translateLegacyText(text || "");
        webllmStatusEl.classList.toggle("jyt-status-error", !!isError);
    }

    function setWebLLMButtonsEnabled(enabled) {
        if (webllmDownloadBtn) webllmDownloadBtn.disabled = !enabled;
        if (webllmClearCacheBtn) webllmClearCacheBtn.disabled = !enabled;
    }

    function populateWebLLMModelSelect(modelIds, selectedModel) {
        if (!els.webllm_model_select) return;

        const uniqueIds = Array.from(
            new Set((modelIds || []).map((id) => String(id || "").trim())),
        ).filter(Boolean);

        const recommended = RECOMMENDED_WEBLLM_MODELS.filter((id) =>
            uniqueIds.includes(id),
        );
        const others = uniqueIds.filter((id) => !recommended.includes(id));
        const orderedIds = [...recommended, ...others];

        els.webllm_model_select.innerHTML = "";
        orderedIds.forEach((id) => {
            const option = document.createElement("option");
            option.value = id;
            option.textContent = RECOMMENDED_WEBLLM_MODELS.includes(id)
                ? `${id}${t("modelRecommendedSuffix", "（推荐）")}`
                : id;
            els.webllm_model_select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = t("modelCustomId", "自定义模型 ID");
        els.webllm_model_select.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.webllm_model_select.value = selectedModel;
            els.webllm_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            els.webllm_model_select.value = "custom";
            if (!els.webllm_custom_model.value) {
                els.webllm_custom_model.value = selectedModel;
            }
            els.webllm_custom_model.disabled = false;
            return;
        }

        if (orderedIds.length > 0) {
            els.webllm_model_select.value = orderedIds[0];
            els.webllm_custom_model.disabled = true;
        }
    }

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
        customOption.textContent = t("modelCustomName", "自定义模型名");
        els.ollama_model_select.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.ollama_model_select.value = selectedModel;
            els.ollama_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            els.ollama_model_select.value = "custom";
            if (!els.ollama_custom_model.value) {
                els.ollama_custom_model.value = selectedModel;
            }
            els.ollama_custom_model.disabled = false;
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
                ? `${id}${t("modelRecommendedSuffix", "（推荐）")}`
                : id;
            els.special_translate_model_select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = "custom";
        customOption.textContent = t("modelCustomName", "自定义模型名");
        els.special_translate_model_select.appendChild(customOption);

        if (selectedModel && orderedIds.includes(selectedModel)) {
            els.special_translate_model_select.value = selectedModel;
            els.special_translate_custom_model.disabled = true;
            return;
        }

        if (selectedModel && selectedModel !== "custom") {
            els.special_translate_model_select.value = "custom";
            if (!els.special_translate_custom_model.value) {
                els.special_translate_custom_model.value = selectedModel;
            }
            els.special_translate_custom_model.disabled = false;
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

    async function requestWebLLMModelList() {
        return new Promise((resolve, reject) => {
            const requestId = `webllm-models-${Date.now()}-${Math.random()}`;
            const timer = setTimeout(() => {
                webllmModelRequestResolvers.delete(requestId);
                reject(new Error("请求模型列表超时"));
            }, 8000);

            webllmModelRequestResolvers.set(requestId, (payload) => {
                clearTimeout(timer);
                resolve(payload || {});
            });

            try {
                const port = ensureWebLLMPort();
                port.postMessage({
                    type:
                        MESSAGE_TYPES.WEBLLM_GET_MODELS || "WEBLLM_GET_MODELS",
                    requestId,
                });
            } catch (err) {
                clearTimeout(timer);
                webllmModelRequestResolvers.delete(requestId);
                reject(err);
            }
        });
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
                const port = ensureWebLLMPort();
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
                const port = ensureWebLLMPort();
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

    function getSelectedWebLLMModelId() {
        const selected = (els.webllm_model_select?.value || "").trim();
        if (selected === "custom") {
            return (els.webllm_custom_model?.value || "").trim();
        }
        return selected;
    }

    function getSelectedWebLLMMirrorBase() {
        const selected = (els.webllm_model_mirror?.value || "official").trim();
        if (selected === "hf-mirror") {
            return "https://hf-mirror.com";
        }
        if (selected === "custom") {
            return (els.webllm_custom_mirror?.value || "").trim();
        }
        return "https://huggingface.co";
    }

    function ensureWebLLMPort() {
        if (webllmPort) return webllmPort;

        webllmPort = chrome.runtime.connect({ name: "jyt-translate" });
        webllmPort.onMessage.addListener((message) => {
            if (!message) return;

            if (message.type === "WEBLLM_MODEL_PROGRESS") {
                const percent = Number.isFinite(message.progress)
                    ? Math.max(0, Math.min(100, Math.round(message.progress)))
                    : null;
                const percentText = percent === null ? "" : ` (${percent}%)`;
                setWebLLMStatus(
                    `${message.text || "模型加载中"}${percentText}`,
                    false,
                );
                return;
            }

            if (message.type === "WEBLLM_PRELOAD_DONE") {
                setWebLLMStatus("模型已加载完成，可直接用于划词翻译", false);
                setWebLLMButtonsEnabled(true);
                return;
            }

            if (message.type === "WEBLLM_CLEAR_DONE") {
                setWebLLMStatus("模型缓存已清理", false);
                setWebLLMButtonsEnabled(true);
                return;
            }

            if (message.type === "WEBLLM_OP_ERROR") {
                setWebLLMStatus(
                    `操作失败: ${message.error || "未知错误"}`,
                    true,
                );
                setWebLLMButtonsEnabled(true);
                const resolvePending = webllmModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    webllmModelRequestResolvers.delete(message.requestId);
                    resolvePending({
                        modelIds: [],
                        recommendedModelIds: RECOMMENDED_WEBLLM_MODELS,
                    });
                }
                return;
            }

            if (message.type === "WEBLLM_MODELS_RESPONSE") {
                const resolvePending = webllmModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    webllmModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
                return;
            }

            if (message.type === "OLLAMA_OP_ERROR") {
                const resolvePending = ollamaModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    ollamaModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelIds: [] });
                }
                return;
            }

            if (message.type === "OLLAMA_MODELS_RESPONSE") {
                const resolvePending = ollamaModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    ollamaModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
                return;
            }

            if (message.type === "SPECIAL_TRANSLATE_OP_ERROR") {
                const resolvePending = specialModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    specialModelRequestResolvers.delete(message.requestId);
                    resolvePending({ modelIds: ["translategemma"] });
                }
                return;
            }

            if (message.type === "SPECIAL_TRANSLATE_MODELS_RESPONSE") {
                const resolvePending = specialModelRequestResolvers.get(
                    message.requestId,
                );
                if (resolvePending) {
                    specialModelRequestResolvers.delete(message.requestId);
                    resolvePending(message);
                }
            }
        });

        webllmPort.onDisconnect.addListener(() => {
            webllmPort = null;
            setWebLLMButtonsEnabled(true);
        });

        return webllmPort;
    }

    async function evaluateWebLLMPerformance() {
        const hasWebGPU = !!navigator.gpu;
        const memoryGB = Number(navigator.deviceMemory || 0);
        const cpuCores = Number(navigator.hardwareConcurrency || 0);
        const reasons = [];

        if (!hasWebGPU) {
            reasons.push("当前浏览器不可用 WebGPU");
        }
        if (memoryGB > 0 && memoryGB <= WEBLLM_WEAK_MEMORY_GB) {
            reasons.push(`设备内存约 ${memoryGB}GB`);
        }
        if (cpuCores > 0 && cpuCores <= WEBLLM_WEAK_CPU_CORES) {
            reasons.push(`CPU 逻辑核心数约 ${cpuCores}`);
        }

        return {
            hasWebGPU,
            memoryGB,
            cpuCores,
            isWeak: reasons.length > 0,
            reasons,
        };
    }

    function renderWebLLMPerformance(profile) {
        if (!webllmPerformanceNote) return;

        if (!isWebLLMSupportedBrowser) {
            webllmPerformanceNote.textContent =
                "当前浏览器不支持 WebLLM（仅 Chrome/Edge 可用）";
            webllmPerformanceNote.className = "jyt-perf-note jyt-perf-warning";
            return;
        }

        if (!profile || !profile.isWeak) {
            webllmPerformanceNote.textContent =
                "设备检测通过，可尝试使用本地模型翻译。";
            webllmPerformanceNote.className = "jyt-perf-note jyt-perf-ok";
            return;
        }

        webllmPerformanceNote.textContent =
            "设备性能偏弱，不建议开启 WebLLM: " +
            profile.reasons.join("；") +
            "。";
        webllmPerformanceNote.className = "jyt-perf-note jyt-perf-warning";
    }

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
        const selectedEngine = els.engine_select.value;
        const llmEngine = els.llm_engine_select?.value || "openai";
        const engine = selectedEngine === "llm" ? llmEngine : selectedEngine;
        const llmEngineSection = document.getElementById("llm_engine_section");
        if (llmEngineSection) {
            llmEngineSection.classList.toggle(
                "jyt-hidden",
                selectedEngine !== "llm",
            );
        }
        const hideOpenAI =
            engine === "browser" ||
            engine === "ollama" ||
            engine === "special_translate" ||
            engine === "custom_openai" ||
            engine === "deepseek" ||
            engine === "qwen" ||
            engine === "glm" ||
            engine === "xiaomi" ||
            engine === "claude" ||
            engine === "gemini" ||
            engine === "webllm" ||
            engine === "google" ||
            engine === "bing";
        openaiSection.classList.toggle("jyt-hidden", hideOpenAI);

        if (customOpenAISection) {
            customOpenAISection.classList.toggle(
                "jyt-hidden",
                engine !== "custom_openai",
            );
        }

        if (deepseekSection) {
            deepseekSection.classList.toggle(
                "jyt-hidden",
                engine !== "deepseek",
            );
        }

        if (qwenSection) {
            qwenSection.classList.toggle("jyt-hidden", engine !== "qwen");
        }

        if (glmSection) {
            glmSection.classList.toggle("jyt-hidden", engine !== "glm");
        }

        if (xiaomiSection) {
            xiaomiSection.classList.toggle("jyt-hidden", engine !== "xiaomi");
        }

        if (claudeSection) {
            claudeSection.classList.toggle("jyt-hidden", engine !== "claude");
        }

        if (geminiSection) {
            geminiSection.classList.toggle("jyt-hidden", engine !== "gemini");
        }

        if (ollamaSection) {
            const showOllama = engine === "ollama";
            ollamaSection.classList.toggle("jyt-hidden", !showOllama);
        }

        if (specialTranslateSection) {
            const showSpecialTranslate = engine === "special_translate";
            specialTranslateSection.classList.toggle(
                "jyt-hidden",
                !showSpecialTranslate,
            );
        }

        if (webllmSection) {
            const showWebLLM = engine === "webllm" && isWebLLMSupportedBrowser;
            webllmSection.classList.toggle("jyt-hidden", !showWebLLM);
        }
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

    function isLikelyPdfUrl(url) {
        if (!url || typeof url !== "string") return false;

        let parsed;
        try {
            parsed = new URL(url);
        } catch (err) {
            return false;
        }

        if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
            return false;
        }

        if (/\.pdf$/i.test(parsed.pathname)) {
            return true;
        }

        let decodedSearch = parsed.search || "";
        try {
            decodedSearch = decodeURIComponent(decodedSearch);
        } catch (err) {
            // keep raw search
        }

        return /\.pdf(?:$|[&#?])/i.test(decodedSearch);
    }

    function extractPdfUrlFromTabUrl(tabUrl) {
        if (!tabUrl || typeof tabUrl !== "string") {
            return "";
        }

        if (isLikelyPdfUrl(tabUrl)) {
            return tabUrl;
        }

        let parsed;
        try {
            parsed = new URL(tabUrl);
        } catch (err) {
            return "";
        }

        const fileParam = parsed.searchParams.get("file");
        if (!fileParam) {
            return "";
        }

        let decoded = fileParam;
        try {
            decoded = decodeURIComponent(fileParam);
        } catch (err) {
            // keep raw value
        }

        return isLikelyPdfUrl(decoded) ? decoded : "";
    }

    function getDisplayNameFromPdfUrl(pdfUrl) {
        if (!pdfUrl) return "";
        try {
            const parsed = new URL(pdfUrl);
            const fromPath = (parsed.pathname || "").split("/").pop() || "";
            if (fromPath) return decodeURIComponent(fromPath);
        } catch (err) {
            // ignore
        }
        return pdfUrl;
    }

    function setOpenButtonLabel(label) {
        if (!openLocalPdfBtn) return;
        openLocalPdfBtn.textContent = label;
    }

    function updateCurrentPdfStatusUI(activeTab, currentPdfUrl) {
        if (!currentPdfStatusEl) return;

        if (currentPdfUrl) {
            const fileName = getDisplayNameFromPdfUrl(currentPdfUrl);
            const isFilePdf = currentPdfUrl.startsWith("file://");

            if (isFirefoxRuntime && isFilePdf) {
                setOpenButtonLabel(
                    t("optionsOpenPdfFirefox", "选择本地 PDF（Firefox）"),
                );
                currentPdfStatusEl.textContent = t(
                    "optionsPdfDetectedFirefox",
                    `已检测到当前 PDF：${fileName}。Firefox 无法让扩展直接读取 file://，点击后会打开文件选择器，请选择该文件。`,
                    [fileName],
                );
                return;
            }

            setOpenButtonLabel(
                t("optionsOpenCurrentPdf", "用 LLM 翻译器打开当前 PDF"),
            );
            currentPdfStatusEl.textContent = t(
                "optionsPdfDetected",
                `已检测到当前 PDF：${fileName}`,
                [fileName],
            );
            return;
        }

        setOpenButtonLabel(
            t(
                "optionsOpenLocalPdfFirefoxCompat",
                "打开本地 PDF（Firefox 兼容）",
            ),
        );
        if (activeTab?.url) {
            currentPdfStatusEl.textContent = t(
                "optionsPdfNotDetected",
                "当前标签页未检测到 PDF 链接。点击后将进入内置 PDF.js 页面并弹出文件选择器。",
            );
        } else {
            currentPdfStatusEl.textContent = t(
                "optionsTabUnavailable",
                "未获取到当前标签页信息。点击后将进入内置 PDF.js 页面并弹出文件选择器。",
            );
        }
    }

    function getCurrentActiveTab() {
        return new Promise((resolve) => {
            try {
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        resolve(
                            Array.isArray(tabs) && tabs[0] ? tabs[0] : null,
                        );
                    },
                );
            } catch (err) {
                resolve(null);
            }
        });
    }

    async function refreshActivePdfContext() {
        const activeTab = await getCurrentActiveTab();
        cachedActiveTab = activeTab;
        const activeTabUrl =
            activeTab && typeof activeTab.url === "string" ? activeTab.url : "";
        cachedCurrentPdfUrl = extractPdfUrlFromTabUrl(activeTabUrl);
        updateCurrentPdfStatusUI(activeTab, cachedCurrentPdfUrl);
    }

    function load() {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
            const savedEngine = String(items.engine || "auto").trim();
            const savedLLMEngine = String(items.llm_engine || "").trim();
            const migratedLLMEngine = LLM_ENGINES.has(savedEngine)
                ? savedEngine
                : "";
            const llmEngine = LLM_ENGINES.has(savedLLMEngine)
                ? savedLLMEngine
                : migratedLLMEngine || "openai";
            const uiEngine = LLM_ENGINES.has(savedEngine)
                ? "llm"
                : savedEngine || "auto";

            els.enable_select.value = items.enabled;
            els.engine_select.value = uiEngine;
            if (els.llm_engine_select) {
                els.llm_engine_select.value = llmEngine;
            }
            els.translate_shortcut.value = normalizeShortcut(
                items.translate_shortcut,
            );
            els.source_lang.value = items.source_lang || "auto";
            els.target_lang.value = items.target_lang || "auto";
            els.ui_lang.value = items.ui_lang || "auto";
            void applyUiLanguage(items.ui_lang || "auto");
            els.openai_api_url.value = items.openai_api_url;
            els.openai_api_key.value = items.openai_api_key;
            const legacyThinkingModel = String(
                items.openai_thinking_model || "",
            ).trim();
            const unifiedOpenAIModel = String(items.openai_model || "").trim();
            els.openai_model.value =
                unifiedOpenAIModel || legacyThinkingModel || "gpt-4o-mini";
            els.openai_custom_prompt.value = items.openai_custom_prompt || "";
            els.show_thoughts.value = items.show_thoughts ? "true" : "false";
            els.openai_reasoning_effort.value =
                items.openai_reasoning_effort || "medium";
            els.openai_max_completion_tokens.value = Number.isFinite(
                Number(items.openai_max_completion_tokens),
            )
                ? String(Math.floor(Number(items.openai_max_completion_tokens)))
                : "0";
            els.custom_openai_api_url.value =
                items.custom_openai_api_url ||
                "https://api.openai.com/v1/chat/completions";
            els.custom_openai_api_key.value = items.custom_openai_api_key || "";
            els.custom_openai_model.value =
                items.custom_openai_model || "gpt-4o-mini";
            els.custom_openai_custom_prompt.value =
                items.custom_openai_custom_prompt || "";
            els.custom_openai_show_thoughts.value =
                items.custom_openai_show_thoughts ? "true" : "false";
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
            els.deepseek_api_url.value =
                items.deepseek_api_url ||
                "https://api.deepseek.com/chat/completions";
            els.deepseek_api_key.value = items.deepseek_api_key || "";
            els.deepseek_model.value = items.deepseek_model || "deepseek-chat";
            els.deepseek_custom_prompt.value =
                items.deepseek_custom_prompt || "";
            els.deepseek_show_thoughts.value = items.deepseek_show_thoughts
                ? "true"
                : "false";
            els.qwen_api_url.value =
                items.qwen_api_url ||
                "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
            els.qwen_api_key.value = items.qwen_api_key || "";
            els.qwen_model.value = items.qwen_model || "qwen-plus";
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
            els.glm_model.value = items.glm_model || "glm-5.1";
            els.glm_custom_prompt.value = items.glm_custom_prompt || "";
            els.glm_show_thoughts.value = items.glm_show_thoughts
                ? "true"
                : "false";
            els.glm_clear_thinking.value =
                items.glm_clear_thinking === false ? "false" : "true";
            els.xiaomi_api_url.value =
                items.xiaomi_api_url ||
                "https://api.xiaomimimo.com/v1/chat/completions";
            els.xiaomi_api_key.value = items.xiaomi_api_key || "";
            els.xiaomi_model.value = items.xiaomi_model || "mimo-v2-pro";
            els.xiaomi_custom_prompt.value = items.xiaomi_custom_prompt || "";
            els.xiaomi_show_thoughts.value = items.xiaomi_show_thoughts
                ? "true"
                : "false";
            els.xiaomi_max_completion_tokens.value = Number.isFinite(
                Number(items.xiaomi_max_completion_tokens),
            )
                ? String(Math.floor(Number(items.xiaomi_max_completion_tokens)))
                : "0";
            els.claude_api_url.value =
                items.claude_api_url || "https://api.anthropic.com/v1/messages";
            els.claude_api_key.value = items.claude_api_key || "";
            els.claude_model.value = items.claude_model || "claude-sonnet-4-6";
            els.claude_custom_prompt.value = items.claude_custom_prompt || "";
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
            els.gemini_api_url.value =
                items.gemini_api_url ||
                "https://generativelanguage.googleapis.com/v1beta/models";
            els.gemini_api_key.value = items.gemini_api_key || "";
            els.gemini_model.value = items.gemini_model || "gemini-2.5-flash";
            els.gemini_custom_prompt.value = items.gemini_custom_prompt || "";
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
            const savedOllamaModel = items.ollama_model || "";
            els.ollama_api_url.value =
                items.ollama_api_url || "http://localhost:11434/api/chat";
            els.ollama_custom_model.value = items.ollama_custom_model || "";
            els.ollama_custom_prompt.value = items.ollama_custom_prompt || "";
            els.ollama_show_thoughts.value = items.ollama_show_thoughts
                ? "true"
                : "false";
            populateOllamaModelSelect([], savedOllamaModel);
            void requestOllamaModelList(els.ollama_api_url.value)
                .then((res) => {
                    const modelIds = Array.isArray(res.modelIds)
                        ? res.modelIds
                        : [];
                    populateOllamaModelSelect(modelIds, savedOllamaModel);
                })
                .catch(() => {
                    populateOllamaModelSelect([], savedOllamaModel);
                });
            const specialProvider = normalizeSpecialProvider(
                items.special_translate_provider || SPECIAL_PROVIDER_OLLAMA,
            );
            const savedSpecialModel =
                items.special_translate_model || "translategemma";
            els.special_translate_provider.value = specialProvider;
            els.special_translate_api_url.value =
                items.special_translate_api_url ||
                getSpecialApiDefaultByProvider(specialProvider);
            els.special_translate_api_key.value =
                items.special_translate_api_key || "";
            els.special_translate_custom_model.value =
                items.special_translate_custom_model || "";
            els.special_translate_custom_prompt.value =
                items.special_translate_custom_prompt || "";
            els.special_translate_show_thoughts.value =
                items.special_translate_show_thoughts ? "true" : "false";
            populateSpecialTranslateModelSelect(
                RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                savedSpecialModel,
            );
            void requestSpecialTranslateModelList(
                specialProvider,
                els.special_translate_api_url.value,
                els.special_translate_api_key.value,
            )
                .then((res) => {
                    const modelIds = Array.isArray(res.modelIds)
                        ? res.modelIds
                        : RECOMMENDED_SPECIAL_TRANSLATE_MODELS;
                    populateSpecialTranslateModelSelect(
                        modelIds,
                        savedSpecialModel,
                    );
                })
                .catch(() => {
                    populateSpecialTranslateModelSelect(
                        RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                        savedSpecialModel,
                    );
                });
            const savedModel = items.webllm_model || "Qwen3-0.6B-q4f16_1-MLC";
            els.webllm_custom_model.value = items.webllm_custom_model || "";
            els.webllm_custom_prompt.value = items.webllm_custom_prompt || "";
            els.webllm_show_thoughts.value = items.webllm_show_thoughts
                ? "true"
                : "false";
            els.webllm_model_mirror.value =
                items.webllm_model_mirror || "official";
            els.webllm_custom_mirror.value = items.webllm_custom_mirror || "";
            els.webllm_custom_mirror.disabled =
                els.webllm_model_mirror.value !== "custom";
            populateWebLLMModelSelect(RECOMMENDED_WEBLLM_MODELS, savedModel);
            if (isWebLLMSupportedBrowser) {
                void requestWebLLMModelList()
                    .then((res) => {
                        const modelIds = Array.isArray(res.modelIds)
                            ? res.modelIds
                            : [];
                        if (modelIds.length > 0) {
                            populateWebLLMModelSelect(modelIds, savedModel);
                        }
                    })
                    .catch(() => {
                        // keep fallback options silently
                    });
            }
            els.theme_mode.value = items.theme_mode || "auto";
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
        });
    }

    document.getElementById("save").addEventListener("click", () => {
        const selectedEngine = els.engine_select.value;
        const selectedLlmEngine =
            (els.llm_engine_select?.value || "openai").trim() || "openai";
        const effectiveEngine =
            selectedEngine === "llm" ? selectedLlmEngine : selectedEngine;
        const data = {
            enabled: els.enable_select.value,
            engine: selectedEngine,
            llm_engine: selectedLlmEngine,
            translate_shortcut: normalizeShortcut(els.translate_shortcut.value),
            source_lang: els.source_lang.value,
            target_lang: els.target_lang.value,
            ui_lang: els.ui_lang.value,
            openai_api_url: els.openai_api_url.value,
            openai_api_key: els.openai_api_key.value,
            openai_model: els.openai_model.value,
            openai_custom_prompt: els.openai_custom_prompt.value || "",
            show_thoughts: els.show_thoughts.value === "true",
            openai_reasoning_effort: els.openai_reasoning_effort.value,
            openai_max_completion_tokens: Number(
                els.openai_max_completion_tokens.value || 0,
            ),
            custom_openai_api_url: (
                els.custom_openai_api_url.value || ""
            ).trim(),
            custom_openai_api_key: els.custom_openai_api_key.value,
            custom_openai_model: (els.custom_openai_model.value || "").trim(),
            custom_openai_custom_prompt:
                els.custom_openai_custom_prompt.value || "",
            custom_openai_show_thoughts:
                els.custom_openai_show_thoughts.value === "true",
            custom_openai_reasoning_effort:
                els.custom_openai_reasoning_effort.value,
            custom_openai_max_completion_tokens: Number(
                els.custom_openai_max_completion_tokens.value || 0,
            ),
            deepseek_api_url: (els.deepseek_api_url.value || "").trim(),
            deepseek_api_key: els.deepseek_api_key.value,
            deepseek_model: (els.deepseek_model.value || "").trim(),
            deepseek_custom_prompt: els.deepseek_custom_prompt.value || "",
            deepseek_show_thoughts: els.deepseek_show_thoughts.value === "true",
            qwen_api_url: (els.qwen_api_url.value || "").trim(),
            qwen_api_key: els.qwen_api_key.value,
            qwen_model: (els.qwen_model.value || "").trim(),
            qwen_custom_prompt: els.qwen_custom_prompt.value || "",
            qwen_show_thoughts: els.qwen_show_thoughts.value === "true",
            qwen_thinking_budget: Number(els.qwen_thinking_budget.value || 0),
            qwen_preserve_thinking: els.qwen_preserve_thinking.value === "true",
            glm_api_url: (els.glm_api_url.value || "").trim(),
            glm_api_key: els.glm_api_key.value,
            glm_model: (els.glm_model.value || "").trim(),
            glm_custom_prompt: els.glm_custom_prompt.value || "",
            glm_show_thoughts: els.glm_show_thoughts.value === "true",
            glm_clear_thinking: els.glm_clear_thinking.value === "true",
            xiaomi_api_url: (els.xiaomi_api_url.value || "").trim(),
            xiaomi_api_key: els.xiaomi_api_key.value,
            xiaomi_model: (els.xiaomi_model.value || "").trim(),
            xiaomi_custom_prompt: els.xiaomi_custom_prompt.value || "",
            xiaomi_show_thoughts: els.xiaomi_show_thoughts.value === "true",
            xiaomi_max_completion_tokens: Number(
                els.xiaomi_max_completion_tokens.value || 0,
            ),
            claude_api_url: (els.claude_api_url.value || "").trim(),
            claude_api_key: els.claude_api_key.value,
            claude_model: (els.claude_model.value || "").trim(),
            claude_custom_prompt: els.claude_custom_prompt.value || "",
            claude_show_thoughts: els.claude_show_thoughts.value === "true",
            claude_max_tokens: Number(els.claude_max_tokens.value || 4096),
            claude_thinking_mode: els.claude_thinking_mode.value,
            claude_thinking_budget: Number(
                els.claude_thinking_budget.value || 2048,
            ),
            claude_thinking_effort: els.claude_thinking_effort.value,
            gemini_api_url: (els.gemini_api_url.value || "").trim(),
            gemini_api_key: els.gemini_api_key.value,
            gemini_model: (els.gemini_model.value || "").trim(),
            gemini_custom_prompt: els.gemini_custom_prompt.value || "",
            gemini_show_thoughts: els.gemini_show_thoughts.value === "true",
            gemini_thinking_level: els.gemini_thinking_level.value,
            gemini_thinking_budget: Number(
                els.gemini_thinking_budget.value || -1,
            ),
            ollama_api_url: (els.ollama_api_url.value || "").trim(),
            ollama_model: els.ollama_model_select.value,
            ollama_custom_model: (els.ollama_custom_model.value || "").trim(),
            ollama_custom_prompt: els.ollama_custom_prompt.value || "",
            ollama_show_thoughts: els.ollama_show_thoughts.value === "true",
            special_translate_provider: normalizeSpecialProvider(
                els.special_translate_provider.value,
            ),
            special_translate_api_url: (
                els.special_translate_api_url.value || ""
            ).trim(),
            special_translate_api_key: els.special_translate_api_key.value,
            special_translate_model: els.special_translate_model_select.value,
            special_translate_custom_model: (
                els.special_translate_custom_model.value || ""
            ).trim(),
            special_translate_custom_prompt:
                els.special_translate_custom_prompt.value || "",
            special_translate_show_thoughts:
                els.special_translate_show_thoughts.value === "true",
            webllm_model: els.webllm_model_select.value,
            webllm_custom_model: (els.webllm_custom_model.value || "").trim(),
            webllm_custom_prompt: els.webllm_custom_prompt.value || "",
            webllm_show_thoughts: els.webllm_show_thoughts.value === "true",
            webllm_model_mirror: els.webllm_model_mirror.value,
            webllm_custom_mirror: (els.webllm_custom_mirror.value || "").trim(),
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
            config_updated_at: Date.now(),
        };
        if (effectiveEngine === "webllm" && !isWebLLMSupportedBrowser) {
            showToast("当前浏览器不支持 WebLLM，请切换到 Chrome/Edge。");
            return;
        }

        if (effectiveEngine === "custom_openai") {
            if (!data.custom_openai_api_key) {
                showToast("请先填写自定义 OpenAI 兼容 API Key。", true);
                return;
            }
            if (!data.custom_openai_model) {
                showToast("请先填写自定义 OpenAI 兼容模型。", true);
                return;
            }
            if (!data.custom_openai_api_url) {
                data.custom_openai_api_url =
                    "https://api.openai.com/v1/chat/completions";
            }
        }

        if (effectiveEngine === "deepseek") {
            if (!data.deepseek_api_key) {
                showToast("请先填写 DeepSeek API Key。", true);
                return;
            }
            if (!data.deepseek_model) {
                showToast("请先填写 DeepSeek 模型。", true);
                return;
            }
            if (!data.deepseek_api_url) {
                data.deepseek_api_url =
                    "https://api.deepseek.com/chat/completions";
            }
        }

        if (effectiveEngine === "qwen") {
            if (!data.qwen_api_key) {
                showToast("请先填写 Qwen API Key。", true);
                return;
            }
            if (!data.qwen_model) {
                showToast("请先填写 Qwen 模型。", true);
                return;
            }
            if (!data.qwen_api_url) {
                data.qwen_api_url =
                    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";
            }
        }

        if (effectiveEngine === "glm") {
            if (!data.glm_api_key) {
                showToast("请先填写 GLM API Key。", true);
                return;
            }
            if (!data.glm_model) {
                showToast("请先填写 GLM 模型。", true);
                return;
            }
            if (!data.glm_api_url) {
                data.glm_api_url =
                    "https://open.bigmodel.cn/api/paas/v4/chat/completions";
            }
        }

        if (effectiveEngine === "xiaomi") {
            if (!data.xiaomi_api_key) {
                showToast("请先填写 Xiaomi API Key。", true);
                return;
            }
            if (!data.xiaomi_model) {
                showToast("请先填写 Xiaomi 模型。", true);
                return;
            }
            if (!data.xiaomi_api_url) {
                data.xiaomi_api_url =
                    "https://api.xiaomimimo.com/v1/chat/completions";
            }
        }

        if (effectiveEngine === "claude") {
            if (!data.claude_api_key) {
                showToast("请先填写 Claude API Key。", true);
                return;
            }
            if (!data.claude_model) {
                showToast("请先填写 Claude 模型。", true);
                return;
            }
            if (!data.claude_api_url) {
                data.claude_api_url = "https://api.anthropic.com/v1/messages";
            }
        }

        if (effectiveEngine === "gemini") {
            if (!data.gemini_api_key) {
                showToast("请先填写 Gemini API Key。", true);
                return;
            }
            if (!data.gemini_model) {
                showToast("请先填写 Gemini 模型。", true);
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
                showToast("请先选择 Ollama 模型或填写自定义模型名。", true);
                return;
            }
        }

        if (effectiveEngine === "special_translate") {
            data.special_translate_provider = normalizeSpecialProvider(
                data.special_translate_provider,
            );
            if (!data.special_translate_api_url) {
                data.special_translate_api_url = getSpecialApiDefaultByProvider(
                    data.special_translate_provider,
                );
            }

            const selectedSpecialModel =
                data.special_translate_model === "custom"
                    ? data.special_translate_custom_model
                    : data.special_translate_model;

            if (!selectedSpecialModel) {
                showToast("请先选择专用翻译模型或填写自定义模型名。", true);
                return;
            }
        }

        if (
            effectiveEngine === "webllm" &&
            webllmPerfProfile &&
            webllmPerfProfile.isWeak
        ) {
            const ok = window.confirm(
                translateLegacyText(
                    "设备性能偏弱，继续启用 WebLLM 可能导致卡顿或加载失败，确定继续吗？",
                ),
            );
            if (!ok) {
                return;
            }
        }

        chrome.storage.sync.set(data, () => {
            applyTheme(data.theme_mode);
            void applyUiLanguage(data.ui_lang || "auto");
            showToast("已保存");
        });
    });

    document.getElementById("reset").addEventListener("click", () => {
        chrome.storage.sync.clear(() => {
            load();
            showToast("已恢复默认");
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
    els.llm_engine_select?.addEventListener("change", updateEngineDependentUI);

    els.theme_mode.addEventListener("change", () => {
        applyTheme(els.theme_mode.value);
    });

    els.ui_lang?.addEventListener("change", () => {
        void applyUiLanguage(els.ui_lang.value || "auto");
    });

    els.webllm_model_select?.addEventListener("change", () => {
        const isCustom = els.webllm_model_select.value === "custom";
        els.webllm_custom_model.disabled = !isCustom;
    });

    els.ollama_model_select?.addEventListener("change", () => {
        const isCustom = els.ollama_model_select.value === "custom";
        els.ollama_custom_model.disabled = !isCustom;
    });

    els.special_translate_model_select?.addEventListener("change", () => {
        const isCustom = els.special_translate_model_select.value === "custom";
        els.special_translate_custom_model.disabled = !isCustom;
    });

    function refreshSpecialTranslateModels() {
        const selectedModel =
            (els.special_translate_model_select?.value || "").trim() ||
            "translategemma";
        void requestSpecialTranslateModelList(
            els.special_translate_provider?.value,
            els.special_translate_api_url?.value,
            els.special_translate_api_key?.value,
        )
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : RECOMMENDED_SPECIAL_TRANSLATE_MODELS;
                populateSpecialTranslateModelSelect(modelIds, selectedModel);
            })
            .catch(() => {
                populateSpecialTranslateModelSelect(
                    RECOMMENDED_SPECIAL_TRANSLATE_MODELS,
                    selectedModel,
                );
            });
    }

    els.special_translate_provider?.addEventListener("change", () => {
        const provider = normalizeSpecialProvider(
            els.special_translate_provider.value,
        );
        if (!String(els.special_translate_api_url.value || "").trim()) {
            els.special_translate_api_url.value =
                getSpecialApiDefaultByProvider(provider);
        }
        refreshSpecialTranslateModels();
    });

    els.special_translate_api_url?.addEventListener("change", () => {
        refreshSpecialTranslateModels();
    });

    els.special_translate_api_key?.addEventListener("change", () => {
        if (
            normalizeSpecialProvider(els.special_translate_provider?.value) ===
            SPECIAL_PROVIDER_OPENAI
        ) {
            refreshSpecialTranslateModels();
        }
    });

    els.ollama_api_url?.addEventListener("change", () => {
        const selectedModel = (els.ollama_model_select?.value || "").trim();
        void requestOllamaModelList(els.ollama_api_url.value)
            .then((res) => {
                const modelIds = Array.isArray(res.modelIds)
                    ? res.modelIds
                    : [];
                populateOllamaModelSelect(modelIds, selectedModel);
            })
            .catch(() => {
                populateOllamaModelSelect([], selectedModel);
            });
    });

    els.webllm_model_mirror?.addEventListener("change", () => {
        const isCustom = els.webllm_model_mirror.value === "custom";
        els.webllm_custom_mirror.disabled = !isCustom;
    });

    webllmDownloadBtn?.addEventListener("click", () => {
        if (!isWebLLMSupportedBrowser) {
            setWebLLMStatus("当前浏览器不支持 WebLLM", true);
            return;
        }

        const modelId = getSelectedWebLLMModelId();
        if (!modelId) {
            setWebLLMStatus("请先选择或输入模型 ID", true);
            return;
        }

        const requestId = `webllm-preload-${Date.now()}`;
        setWebLLMButtonsEnabled(false);
        setWebLLMStatus("开始下载/加载模型...", false);

        try {
            const port = ensureWebLLMPort();
            port.postMessage({
                type: MESSAGE_TYPES.WEBLLM_PRELOAD || "WEBLLM_PRELOAD",
                requestId,
                modelId,
                settings: {
                    webllm_model_mirror: els.webllm_model_mirror.value,
                    webllm_custom_mirror: (
                        els.webllm_custom_mirror.value || ""
                    ).trim(),
                },
            });
        } catch (err) {
            setWebLLMButtonsEnabled(true);
            setWebLLMStatus("无法连接后台服务，请重试", true);
        }
    });

    webllmClearCacheBtn?.addEventListener("click", () => {
        const modelId = getSelectedWebLLMModelId();
        if (!modelId) {
            setWebLLMStatus("请先选择或输入模型 ID", true);
            return;
        }

        const requestId = `webllm-clear-${Date.now()}`;
        setWebLLMButtonsEnabled(false);
        setWebLLMStatus("正在清理模型缓存...", false);

        try {
            const port = ensureWebLLMPort();
            port.postMessage({
                type: MESSAGE_TYPES.WEBLLM_CLEAR_CACHE || "WEBLLM_CLEAR_CACHE",
                requestId,
                modelId,
                settings: {
                    webllm_model_mirror: els.webllm_model_mirror.value,
                    webllm_custom_mirror: (
                        els.webllm_custom_mirror.value || ""
                    ).trim(),
                },
            });
        } catch (err) {
            setWebLLMButtonsEnabled(true);
            setWebLLMStatus("无法连接后台服务，请重试", true);
        }
    });

    openLocalPdfBtn?.addEventListener("click", async () => {
        const runtimeBaseUrl = chrome.runtime.getURL("");
        const isFirefoxRuntime = runtimeBaseUrl.startsWith("moz-extension://");

        const activeTab = cachedActiveTab || (await getCurrentActiveTab());
        const activeTabUrl =
            activeTab && typeof activeTab.url === "string" ? activeTab.url : "";
        const currentPdfUrl =
            cachedCurrentPdfUrl || extractPdfUrlFromTabUrl(activeTabUrl);

        let viewerUrl;
        if (currentPdfUrl) {
            const isFilePdf = currentPdfUrl.startsWith("file://");
            if (isFirefoxRuntime && isFilePdf) {
                viewerUrl = chrome.runtime.getURL(
                    "vendor/pdfjs/web/viewer.html?file=&openFilePicker=1",
                );
                showToast(
                    "Firefox 安全策略不允许扩展直接读取 file:// 文件。将打开文件选择器，请选择当前 PDF。",
                );
            } else {
                viewerUrl = chrome.runtime.getURL(
                    `vendor/pdfjs/web/viewer.html?file=${encodeURIComponent(currentPdfUrl)}`,
                );
            }
        } else {
            viewerUrl = chrome.runtime.getURL(
                "vendor/pdfjs/web/viewer.html?file=&openFilePicker=1",
            );
        }

        try {
            const maybePromise = chrome.tabs.create({ url: viewerUrl });
            if (maybePromise && typeof maybePromise.then === "function") {
                await maybePromise;
            }
            window.close();
        } catch (err) {
            showToast("打开内置 PDF 页面失败，请重试");
        }
    });

    glossaryExportBtn?.addEventListener("click", async () => {
        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_EXPORT || "TERM_EXPORT",
            );
            if (!result?.ok) {
                throw new Error(result?.error || "导出失败");
            }

            const payload = result.payload || {
                glossary_version: 1,
                glossary_terms: [],
                exported_at: new Date().toISOString(),
            };
            const terms = Array.isArray(payload.glossary_terms)
                ? payload.glossary_terms
                : [];

            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            a.href = url;
            a.download = `jyt-glossary-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            setGlossaryStatus(`导出完成，共 ${terms.length} 条术语`, false);
            await refreshGlossaryList();
        } catch (err) {
            setGlossaryStatus(
                `导出失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossaryImportBtn?.addEventListener("click", () => {
        if (!glossaryImportFileInput) return;

        if (isFirefoxRuntime && isRunningInPopup()) {
            void openImportInNewTab()
                .then(() => {
                    setGlossaryStatus(
                        "Firefox 弹窗模式下已在新标签页打开导入页面",
                        false,
                    );
                })
                .catch((err) => {
                    setGlossaryStatus(
                        `打开导入页面失败: ${err && err.message ? err.message : String(err)}`,
                        true,
                    );
                });
            return;
        }

        glossaryImportFileInput.value = "";
        glossaryImportFileInput.click();
    });

    glossaryImportFileInput?.addEventListener("change", async () => {
        const file = glossaryImportFileInput.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setGlossaryStatus("导入失败: 文件过大，请控制在 5MB 以内", true);
            return;
        }

        try {
            const content = await readFileAsText(file);
            const parsed = JSON.parse(content);
            const importedTerms = sanitizeGlossaryTerms(
                parsed?.glossary_terms || parsed,
            );

            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_IMPORT || "TERM_IMPORT",
                { terms: importedTerms },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "导入失败");
            }

            setGlossaryStatus(
                `导入完成: 新增 ${result.created || 0}，覆盖 ${result.replaced || 0}，总计 ${result.total || 0}`,
                false,
            );
            await refreshGlossaryList();
            resetGlossaryEditor();
        } catch (err) {
            setGlossaryStatus(
                `导入失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossarySaveBtn?.addEventListener("click", async () => {
        const term = getGlossaryFormTerm();
        if (
            !term.sourceLang ||
            !term.targetLang ||
            !term.sourceTerm ||
            !term.targetTerm
        ) {
            setGlossaryStatus("保存失败: 请完整填写术语字段", true);
            return;
        }

        try {
            const nextKey = glossaryTermKey(term);
            const prevKey = glossaryEditingOriginal
                ? glossaryTermKey(glossaryEditingOriginal)
                : "";

            if (glossaryEditingOriginal && prevKey && prevKey !== nextKey) {
                const delRes = await sendTermMessage(
                    MESSAGE_TYPES.TERM_DELETE || "TERM_DELETE",
                    { term: glossaryEditingOriginal },
                );
                if (!delRes?.ok) {
                    throw new Error(delRes?.error || "旧术语删除失败");
                }
            }

            const saveRes = await sendTermMessage(
                MESSAGE_TYPES.TERM_UPSERT || "TERM_UPSERT",
                { term },
            );
            if (!saveRes?.ok) {
                throw new Error(saveRes?.error || "术语保存失败");
            }

            setGlossaryStatus("术语已保存", false);
            await refreshGlossaryList();
            resetGlossaryEditor();
        } catch (err) {
            setGlossaryStatus(
                `保存失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossaryCancelEditBtn?.addEventListener("click", () => {
        resetGlossaryEditor();
        setGlossaryStatus("", false);
    });

    glossaryClearBtn?.addEventListener("click", async () => {
        const ok = window.confirm(
            translateLegacyText("确定清空术语库吗？该操作不可撤销。"),
        );
        if (!ok) return;

        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_CLEAR || "TERM_CLEAR",
            );
            if (!result?.ok) {
                throw new Error(result?.error || "清空失败");
            }
            await refreshGlossaryList();
            resetGlossaryEditor();
            setGlossaryStatus("术语库已清空", false);
        } catch (err) {
            setGlossaryStatus(
                `清空失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    glossaryListEl?.addEventListener("click", async (e) => {
        const editBtn = e.target.closest(".jyt-glossary-row-edit");
        const deleteBtn = e.target.closest(".jyt-glossary-row-delete");
        if (!editBtn && !deleteBtn) return;

        const index = Number((editBtn || deleteBtn).getAttribute("data-index"));
        if (!Number.isInteger(index) || index < 0) return;
        const term = glossaryTermsCache[index];
        if (!term) return;

        if (editBtn) {
            populateGlossaryEditor(term);
            setGlossaryStatus("已载入术语，编辑后点击更新", false);
            return;
        }

        try {
            const result = await sendTermMessage(
                MESSAGE_TYPES.TERM_DELETE || "TERM_DELETE",
                { term },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "删除失败");
            }

            await refreshGlossaryList();
            if (
                glossaryEditingOriginal &&
                glossaryTermKey(glossaryEditingOriginal) ===
                    glossaryTermKey(term)
            ) {
                resetGlossaryEditor();
            }
            setGlossaryStatus("术语已删除", false);
        } catch (err) {
            setGlossaryStatus(
                `删除失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    configExportBtn?.addEventListener("click", async () => {
        try {
            const result = await sendBackgroundMessage(
                MESSAGE_TYPES.CONFIG_EXPORT || "CONFIG_EXPORT",
            );
            if (!result?.ok) {
                throw new Error(result?.error || "配置导出失败");
            }

            downloadJsonFile(result.payload || {}, "jyt-config");
            setConfigStatus("配置导出完成", false);
        } catch (err) {
            setConfigStatus(
                `配置导出失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    configImportBtn?.addEventListener("click", () => {
        if (!configImportFileInput) return;
        configImportFileInput.value = "";
        configImportFileInput.click();
    });

    configImportFileInput?.addEventListener("change", async () => {
        const file = configImportFileInput.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setConfigStatus("配置导入失败: 文件过大，请控制在 5MB 以内", true);
            return;
        }

        try {
            const content = await readFileAsText(file);
            const parsed = JSON.parse(content);
            const payload = sanitizeConfigPayload(parsed?.payload || parsed);
            payload.config_updated_at =
                Number(parsed?.updated_at) ||
                Number(payload.config_updated_at) ||
                Date.now();

            const result = await sendBackgroundMessage(
                MESSAGE_TYPES.CONFIG_IMPORT || "CONFIG_IMPORT",
                {
                    payload: {
                        schema: "jyt-config",
                        schema_version: 1,
                        updated_at: payload.config_updated_at,
                        exported_at: new Date().toISOString(),
                        payload,
                    },
                },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "配置导入失败");
            }

            load();
            setConfigStatus("配置导入完成", false);
        } catch (err) {
            setConfigStatus(
                `配置导入失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    webdavSaveLocalBtn?.addEventListener("click", async () => {
        try {
            await saveWebDavLocalSettings();
            setSyncStatus("WebDAV 配置已保存到本地", false);
        } catch (err) {
            setSyncStatus(
                `保存失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        }
    });

    syncTestBtn?.addEventListener("click", async () => {
        if (syncBusy) return;
        setSyncButtonsEnabled(false);
        setSyncStatus("正在测试 WebDAV 连接...", false);
        try {
            const webdav = getWebDavFormData();
            await saveWebDavLocalSettings();
            const result = await sendBackgroundMessage(
                MESSAGE_TYPES.SYNC_TEST || "SYNC_TEST",
                { webdav },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "连接测试失败");
            }
            setSyncStatus(
                `连接成功: config(${result.configStatus}) glossary(${result.glossaryStatus})`,
                false,
            );
        } catch (err) {
            setSyncStatus(
                `连接测试失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        } finally {
            setSyncButtonsEnabled(true);
        }
    });

    syncUploadBtn?.addEventListener("click", async () => {
        if (syncBusy) return;
        setSyncButtonsEnabled(false);
        setSyncStatus("正在上传配置与术语到 WebDAV...", false);
        try {
            const webdav = getWebDavFormData();
            await saveWebDavLocalSettings();
            const result = await sendBackgroundMessage(
                MESSAGE_TYPES.SYNC_UPLOAD || "SYNC_UPLOAD",
                { webdav },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "上传失败");
            }
            setSyncStatus(
                `上传完成: 术语 ${result.summary?.glossaryCount || 0} 条`,
                false,
            );
        } catch (err) {
            setSyncStatus(
                `上传失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        } finally {
            setSyncButtonsEnabled(true);
        }
    });

    syncDownloadBtn?.addEventListener("click", async () => {
        if (syncBusy) return;
        setSyncButtonsEnabled(false);
        setSyncStatus("正在从 WebDAV 下载配置与术语...", false);
        try {
            const webdav = getWebDavFormData();
            await saveWebDavLocalSettings();
            const result = await sendBackgroundMessage(
                MESSAGE_TYPES.SYNC_DOWNLOAD || "SYNC_DOWNLOAD",
                { webdav },
            );
            if (!result?.ok) {
                throw new Error(result?.error || "下载失败");
            }

            load();
            await refreshGlossaryList();
            resetGlossaryEditor();
            setSyncStatus(
                `下载完成: 术语 ${result.summary?.glossaryCount || 0} 条`,
                false,
            );
        } catch (err) {
            setSyncStatus(
                `下载失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        } finally {
            setSyncButtonsEnabled(true);
        }
    });

    syncBidirectionalBtn?.addEventListener("click", async () => {
        if (syncBusy) return;
        setSyncButtonsEnabled(false);
        setSyncStatus("正在执行双向同步...", false);
        try {
            const webdav = getWebDavFormData();
            await saveWebDavLocalSettings();
            const result = await runBidirectionalSync(webdav);

            load();
            await refreshGlossaryList();
            resetGlossaryEditor();
            setSyncStatus(
                `双向同步完成: 术语 ${result.summary?.glossaryCount || 0} 条`,
                false,
            );
        } catch (err) {
            setSyncStatus(
                `双向同步失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        } finally {
            setSyncButtonsEnabled(true);
        }
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
    void refreshActivePdfContext();
    setConfigStatus("", false);
    setSyncStatus("", false);
    void loadWebDavLocalSettings()
        .then((value) => {
            setWebDavFormData(value);
        })
        .catch((err) => {
            setSyncStatus(
                `本地同步配置读取失败: ${err && err.message ? err.message : String(err)}`,
                true,
            );
        });
    resetGlossaryEditor();
    void refreshGlossaryList().catch((err) => {
        setGlossaryStatus(
            `术语列表加载失败: ${err && err.message ? err.message : String(err)}`,
            true,
        );
    });

    if (window.location.hash === "#glossary-import") {
        setTimeout(() => {
            glossaryImportBtn?.click();
            if (
                window.history &&
                typeof window.history.replaceState === "function"
            ) {
                window.history.replaceState(null, "", "options.html");
            }
        }, 60);
    }

    if (!isWebLLMSupportedBrowser) {
        const webllmOption = els.llm_engine_select?.querySelector(
            'option[value="webllm"]',
        );
        webllmOption?.remove();
        if (els.llm_engine_select?.value === "webllm") {
            els.llm_engine_select.value = "openai";
        }
        updateEngineDependentUI();
    }

    void evaluateWebLLMPerformance().then((profile) => {
        webllmPerfProfile = profile;
        renderWebLLMPerformance(profile);
    });
});
