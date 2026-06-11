// options/modules/dom-refs.js — DOM element references for the options page
(function (global) {
    const registry = global.JYT_ENGINE_REGISTRY || {};
    const LLM_ENGINES = new Set(registry.LLM_ENGINE_IDS || []);

    function collectSettingFields() {
        const els = {};
        for (const el of document.querySelectorAll("[data-jyt-setting]")) {
            els[el.dataset.jytSetting] = el;
        }
        return els;
    }

    function collectEngineSections() {
        const byEngine = new Map();
        for (const el of document.querySelectorAll("[data-jyt-engine]")) {
            byEngine.set(el.dataset.jytEngine, el);
        }
        return byEngine;
    }

    function createDomRefs() {
        const els = collectSettingFields();
        const engineSectionsById = collectEngineSections();

        const sections = {
            openai: engineSectionsById.get("openai") || null,
            customOpenAI: engineSectionsById.get("custom_openai") || null,
            openrouter: engineSectionsById.get("openrouter") || null,
            deepseek: engineSectionsById.get("deepseek") || null,
            siliconflow: engineSectionsById.get("siliconflow") || null,
            qwen: engineSectionsById.get("qwen") || null,
            glm: engineSectionsById.get("glm") || null,
            xiaomi: engineSectionsById.get("xiaomi") || null,
            grok: engineSectionsById.get("grok") || null,
            nim: engineSectionsById.get("nim") || null,
            claude: engineSectionsById.get("claude") || null,
            gemini: engineSectionsById.get("gemini") || null,
            ollama: engineSectionsById.get("ollama") || null,
            deepl: engineSectionsById.get("deepl") || null,
            deeplx: engineSectionsById.get("deeplx") || null,
            specialTranslate: engineSectionsById.get("special_translate") || null,
        };

        const glossary = {
            exportBtn: document.getElementById("glossary_export"),
            importBtn: document.getElementById("glossary_import"),
            importFileInput: document.getElementById("glossary_import_file"),
            statusEl: document.getElementById("glossary_status"),
            listEl: document.getElementById("glossary_list"),
            saveBtn: document.getElementById("glossary_save"),
            cancelEditBtn: document.getElementById("glossary_cancel_edit"),
            clearBtn: document.getElementById("glossary_clear"),
            sourceLangEl: document.getElementById("glossary_source_lang"),
            targetLangEl: document.getElementById("glossary_target_lang"),
            sourceTermEl: document.getElementById("glossary_source_term"),
            targetTermEl: document.getElementById("glossary_target_term"),
            caseSensitiveEl: document.getElementById("glossary_case_sensitive"),
            wholeWordEl: document.getElementById("glossary_whole_word"),
        };

        const history = {
            searchEl: document.getElementById("history_search"),
            filterEl: document.getElementById("history_filter"),
            refreshBtn: document.getElementById("history_refresh"),
            clearBtn: document.getElementById("history_clear"),
            listEl: document.getElementById("history_list"),
            statusEl: document.getElementById("history_status"),
        };

        const wizard = {
            toggleBtn: document.getElementById("setup_wizard_toggle"),
            panelEl: document.getElementById("setup_wizard_panel"),
            statusEl: document.getElementById("setup_wizard_status"),
        };

        const sync = {
            configExportBtn: document.getElementById("config_export"),
            configImportBtn: document.getElementById("config_import"),
            configImportFileInput: document.getElementById("config_import_file"),
            configStatusEl: document.getElementById("config_status"),
            webdavBaseUrlEl: document.getElementById("webdav_base_url"),
            webdavUsernameEl: document.getElementById("webdav_username"),
            webdavPasswordEl: document.getElementById("webdav_password"),
            webdavRemoteDirEl: document.getElementById("webdav_remote_dir"),
            webdavSaveLocalBtn: document.getElementById("webdav_save_local"),
            syncTestBtn: document.getElementById("sync_test"),
            syncUploadBtn: document.getElementById("sync_upload"),
            syncDownloadBtn: document.getElementById("sync_download"),
            syncBidirectionalBtn: document.getElementById("sync_bidirectional"),
            syncStatusEl: document.getElementById("sync_status"),
        };

        const pdf = {
            openLocalPdfBtn: document.getElementById("open_local_pdf"),
            currentPdfStatusEl: document.getElementById("current_pdf_status"),
        };

        return {
            els,
            sections,
            openaiSection: sections.openai,
            engineSectionsById,
            glossary,
            history,
            wizard,
            sync,
            pdf,
            LLM_ENGINES,
        };
    }

    global.JYT_OPTION_DOM = {
        createDomRefs,
        collectSettingFields,
        LLM_ENGINES,
    };
})(globalThis);
