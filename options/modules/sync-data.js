(function (global) {
    function createSyncDataController(options) {
        const deps = options && typeof options === "object" ? options : {};
        const t = (key, vars) =>
            global.JYT_I18N?.t ? global.JYT_I18N.t(key, vars) : key;
        const errMsg = (err) =>
            err && err.message ? err.message : String(err);
        const elements = deps.elements || {};
        const defaultSettings = deps.defaultSettings || {};
        const messageTypes = deps.messageTypes || {};
        const sendBackgroundMessage = deps.sendBackgroundMessage;
        const readFileAsText = deps.readFileAsText;
        const reloadSettings = deps.reloadSettings || (() => {});
        const glossary = deps.glossary || {};
        const extractApiKeyPayload = deps.extractApiKeyPayload || (() => ({}));
        const stripApiKeyPayload = deps.stripApiKeyPayload || ((input) => input);

        let syncBusy = false;

        function setConfigStatus(text, isError) {
            if (!elements.configStatus) return;
            elements.configStatus.textContent = text || "";
            elements.configStatus.classList.toggle(
                "jyt-status-error",
                !!isError,
            );
        }

        function setSyncStatus(text, isError) {
            if (!elements.syncStatus) return;
            elements.syncStatus.textContent = text || "";
            elements.syncStatus.classList.toggle("jyt-status-error", !!isError);
        }

        function clampPercent(value, fallback) {
            const n = Number(value);
            if (!Number.isFinite(n)) return fallback;
            return Math.min(95, Math.max(5, Math.round(n)));
        }

        function sanitizeConfigPayload(rawPayload) {
            const input =
                rawPayload && typeof rawPayload === "object" ? rawPayload : {};
            const next = {};
            const keys = Object.keys(defaultSettings).filter(
                (key) => key !== "glossary_terms" && key !== "glossary_version",
            );

            for (const key of keys) {
                const fallback = defaultSettings[key];
                const value = input[key];

                if (
                    key === "show_thoughts" ||
                    key === "custom_openai_show_thoughts" ||
                    key === "openrouter_show_thoughts" ||
                    key === "deepseek_show_thoughts" ||
                    key === "siliconflow_show_thoughts" ||
                    key === "qwen_show_thoughts" ||
                    key === "qwen_preserve_thinking" ||
                    key === "glm_show_thoughts" ||
                    key === "glm_clear_thinking" ||
                    key === "xiaomi_show_thoughts" ||
                    key === "grok_show_thoughts" ||
                    key === "nim_show_thoughts" ||
                    key === "claude_show_thoughts" ||
                    key === "gemini_show_thoughts"
                ) {
                    next[key] = typeof value === "boolean" ? value : !!fallback;
                    continue;
                }

                if (
                    key === "openai_max_completion_tokens" ||
                    key === "custom_openai_max_completion_tokens" ||
                    key === "openrouter_max_completion_tokens" ||
                    key === "qwen_thinking_budget" ||
                    key === "xiaomi_max_completion_tokens" ||
                    key === "nim_max_tokens" ||
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

        function getOptionalPermissionOrigin(rawUrl) {
            const trimmed = String(rawUrl || "").trim();
            if (!trimmed) return "";

            const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
                ? trimmed
                : trimmed.startsWith("//")
                  ? `https:${trimmed}`
                  : `https://${trimmed}`;

            try {
                const url = new URL(candidate);
                if (!/^https?:$/i.test(url.protocol)) {
                    return "";
                }
                return `${url.protocol}//${url.hostname}/*`;
            } catch (err) {
                return "";
            }
        }

        function collectOptionalPermissionOrigins(urls) {
            return Array.from(
                new Set(
                    (Array.isArray(urls) ? urls : [])
                        .map(getOptionalPermissionOrigin)
                        .filter(Boolean),
                ),
            );
        }

        // 判定 WebDAV 地址是否为非本机的 HTTP（明文）地址，用于提醒用户密码将明文传输。
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

        async function requestOptionalHostPermissions(urls) {
            const origins = collectOptionalPermissionOrigins(urls);
            if (
                origins.length === 0 ||
                typeof chrome === "undefined" ||
                !chrome.permissions ||
                typeof chrome.permissions.request !== "function"
            ) {
                return true;
            }

            return new Promise((resolve) => {
                chrome.permissions.request({ origins }, (granted) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        console.warn("Optional permission request failed", err);
                    }
                    resolve(!!granted);
                });
            });
        }

        function getWebDavFormData() {
            return {
                baseUrl: String(elements.webdavBaseUrl?.value || "").trim(),
                username: String(elements.webdavUsername?.value || "").trim(),
                password: String(elements.webdavPassword?.value || ""),
                remoteDir: String(elements.webdavRemoteDir?.value || "").trim(),
            };
        }

        function setWebDavFormData(data) {
            const value = data && typeof data === "object" ? data : {};
            if (elements.webdavBaseUrl)
                elements.webdavBaseUrl.value = value.baseUrl || "";
            if (elements.webdavUsername)
                elements.webdavUsername.value = value.username || "";
            if (elements.webdavPassword)
                elements.webdavPassword.value = value.password || "";
            if (elements.webdavRemoteDir)
                elements.webdavRemoteDir.value = value.remoteDir || "/jyt-sync";
        }

        async function saveWebDavLocalSettings() {
            const payload = getWebDavFormData();
            if (isInsecureHttpEndpoint(payload.baseUrl)) {
                setSyncStatus(t("options.sync.insecureHttpWarning"), true);
            }
            const granted = await requestOptionalHostPermissions([
                payload.baseUrl,
            ]);
            if (!granted) {
                setSyncStatus(t("options.sync.permissionDenied"), true);
            }

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
                chrome.storage.local.set({ webdav_sync: payload }, () => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        reject(new Error(err.message || t("options.sync.webdavSaveFailed")));
                        return;
                    }
                    resolve(payload);
                });
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
                return items?.webdav_sync &&
                    typeof items.webdav_sync === "object"
                    ? items.webdav_sync
                    : fallback;
            }

            return new Promise((resolve, reject) => {
                chrome.storage.local.get({ webdav_sync: fallback }, (items) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        reject(new Error(err.message || t("options.sync.webdavLoadFailed")));
                        return;
                    }

                    const raw =
                        items.webdav_sync && typeof items.webdav_sync === "object"
                            ? items.webdav_sync
                            : fallback;
                    resolve({
                        baseUrl: String(raw.baseUrl || ""),
                        username: String(raw.username || ""),
                        password: String(raw.password || ""),
                        remoteDir: String(raw.remoteDir || "/jyt-sync"),
                    });
                });
            });
        }

        function setSyncButtonsEnabled(enabled) {
            syncBusy = !enabled;
            for (const btn of [
                elements.syncTestButton,
                elements.syncUploadButton,
                elements.syncDownloadButton,
                elements.syncBidirectionalButton,
            ]) {
                if (btn) btn.disabled = !enabled;
            }
        }

        async function askConflictPolicy(conflict) {
            const cfgCount = Array.isArray(conflict?.configFields)
                ? conflict.configFields.length
                : 0;
            const glossarySummary = conflict?.glossary || {};
            const message = [
                t("options.sync.conflict.title"),
                "",
                t("options.sync.conflict.configFields", { count: cfgCount }),
                t("options.sync.conflict.localTerms", {
                    count: glossarySummary.localCount || 0,
                }),
                t("options.sync.conflict.remoteTerms", {
                    count: glossarySummary.remoteCount || 0,
                }),
                "",
                t("options.sync.conflict.optionRemote"),
                t("options.sync.conflict.optionLocal"),
                t("options.sync.conflict.optionMerge"),
            ].join("\n");

            const answer = window.prompt(message, "3");
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
                    messageTypes.SYNC_BIDIRECTIONAL || "SYNC_BIDIRECTIONAL",
                    {
                        webdav,
                        conflictPolicy,
                    },
                );

                if (result?.ok) {
                    return result;
                }

                if (result?.errorCode !== "SYNC_CONFLICT") {
                    throw new Error(
                        result?.error ||
                            t("options.error.syncBidirectionalFailed", {
                                error: "",
                            }),
                    );
                }

                const selected = await askConflictPolicy(result?.conflict || {});
                if (!selected) {
                    throw new Error(t("options.sync.cancelled"));
                }
                conflictPolicy = selected;
            }

            throw new Error(t("options.sync.conflictRetriesExceeded"));
        }

        async function exportConfig() {
            try {
                const result = await sendBackgroundMessage(
                    messageTypes.CONFIG_EXPORT || "CONFIG_EXPORT",
                );
                if (!result?.ok) {
                    throw new Error(
                        result?.error ||
                            t("options.error.configExportFailed", { error: "" }),
                    );
                }

                downloadJsonFile(result.payload || {}, "jyt-config");
                setConfigStatus(t("options.sync.configExportDone"), false);
            } catch (err) {
                setConfigStatus(
                    t("options.error.configExportFailed", {
                        error: errMsg(err),
                    }),
                    true,
                );
            }
        }

        function openConfigImportPicker() {
            if (!elements.configImportFileInput) return;
            elements.configImportFileInput.value = "";
            elements.configImportFileInput.click();
        }

        async function importSelectedConfigFile() {
            const file = elements.configImportFileInput?.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                setConfigStatus(t("options.validation.fileTooLarge"), true);
                return;
            }

            try {
                const content = await readFileAsText(file);
                const parsed = JSON.parse(content);
                const payload = sanitizeConfigPayload(parsed?.payload || parsed);
                const localApiKeys = extractApiKeyPayload(payload);
                const syncPayload = stripApiKeyPayload(payload);
                payload.config_updated_at =
                    Number(parsed?.updated_at) ||
                    Number(payload.config_updated_at) ||
                    Date.now();

                syncPayload.config_updated_at = payload.config_updated_at;

                const result = await sendBackgroundMessage(
                    messageTypes.CONFIG_IMPORT || "CONFIG_IMPORT",
                    {
                        payload: {
                            schema: "jyt-config",
                            schema_version: 1,
                            updated_at: syncPayload.config_updated_at,
                            exported_at: new Date().toISOString(),
                            payload: syncPayload,
                        },
                    },
                );
                if (!result?.ok) {
                    throw new Error(
                        result?.error ||
                            t("options.error.configImportFailed", { error: "" }),
                    );
                }

                await new Promise((resolve, reject) => {
                    chrome.storage.local.set(localApiKeys, () => {
                        const err = chrome.runtime.lastError;
                        if (err) {
                            reject(
                                new Error(
                                    err.message ||
                                        t("options.sync.localKeysImportFailed"),
                                ),
                            );
                            return;
                        }
                        resolve();
                    });
                });

                reloadSettings();
                setConfigStatus(t("options.sync.configImportDone"), false);
            } catch (err) {
                setConfigStatus(
                    t("options.error.configImportFailed", {
                        error: errMsg(err),
                    }),
                    true,
                );
            }
        }

        async function saveLocalWebDavConfig() {
            try {
                await saveWebDavLocalSettings();
                setSyncStatus(t("options.sync.webdavSavedLocally"), false);
            } catch (err) {
                setSyncStatus(
                    t("options.toast.saveFailed", { error: errMsg(err) }),
                    true,
                );
            }
        }

        async function testWebDavConnection() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus(t("options.sync.testing"), false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await sendBackgroundMessage(
                    messageTypes.SYNC_TEST || "SYNC_TEST",
                    { webdav },
                );
                if (!result?.ok) {
                    throw new Error(
                        result?.error ||
                            t("options.error.webdavTestFailed", { error: "" }),
                    );
                }
                setSyncStatus(
                    t("options.sync.testSuccess", {
                        configStatus: result.configStatus,
                        glossaryStatus: result.glossaryStatus,
                    }),
                    false,
                );
            } catch (err) {
                setSyncStatus(
                    t("options.error.webdavTestFailed", {
                        error: errMsg(err),
                    }),
                    true,
                );
            } finally {
                setSyncButtonsEnabled(true);
            }
        }

        async function uploadSyncData() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus(t("options.sync.uploading"), false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await sendBackgroundMessage(
                    messageTypes.SYNC_UPLOAD || "SYNC_UPLOAD",
                    { webdav },
                );
                if (!result?.ok) {
                    throw new Error(
                        result?.error ||
                            t("options.error.webdavUploadFailed", { error: "" }),
                    );
                }
                setSyncStatus(
                    t("options.sync.uploadDone", {
                        count: result.summary?.glossaryCount || 0,
                    }),
                    false,
                );
            } catch (err) {
                setSyncStatus(
                    t("options.error.webdavUploadFailed", {
                        error: errMsg(err),
                    }),
                    true,
                );
            } finally {
                setSyncButtonsEnabled(true);
            }
        }

        async function downloadSyncData() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus(t("options.sync.downloading"), false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await sendBackgroundMessage(
                    messageTypes.SYNC_DOWNLOAD || "SYNC_DOWNLOAD",
                    { webdav },
                );
                if (!result?.ok) {
                    throw new Error(
                        result?.error ||
                            t("options.error.webdavDownloadFailed", { error: "" }),
                    );
                }

                reloadSettings();
                await glossary.refreshList?.();
                glossary.resetEditor?.();
                setSyncStatus(
                    t("options.sync.downloadDone", {
                        count: result.summary?.glossaryCount || 0,
                    }),
                    false,
                );
            } catch (err) {
                setSyncStatus(
                    t("options.error.webdavDownloadFailed", {
                        error: errMsg(err),
                    }),
                    true,
                );
            } finally {
                setSyncButtonsEnabled(true);
            }
        }

        async function bidirectionalSyncData() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus(t("options.sync.bidirectionalRunning"), false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await runBidirectionalSync(webdav);

                reloadSettings();
                await glossary.refreshList?.();
                glossary.resetEditor?.();
                setSyncStatus(
                    t("options.sync.bidirectionalDone", {
                        count: result.summary?.glossaryCount || 0,
                    }),
                    false,
                );
            } catch (err) {
                setSyncStatus(
                    t("options.error.syncBidirectionalFailed", {
                        error: errMsg(err),
                    }),
                    true,
                );
            } finally {
                setSyncButtonsEnabled(true);
            }
        }

        function bindEvents() {
            elements.configExportButton?.addEventListener("click", exportConfig);
            elements.configImportButton?.addEventListener(
                "click",
                openConfigImportPicker,
            );
            elements.configImportFileInput?.addEventListener(
                "change",
                importSelectedConfigFile,
            );
            elements.webdavSaveLocalButton?.addEventListener(
                "click",
                saveLocalWebDavConfig,
            );
            elements.syncTestButton?.addEventListener(
                "click",
                testWebDavConnection,
            );
            elements.syncUploadButton?.addEventListener("click", uploadSyncData);
            elements.syncDownloadButton?.addEventListener(
                "click",
                downloadSyncData,
            );
            elements.syncBidirectionalButton?.addEventListener(
                "click",
                bidirectionalSyncData,
            );
        }

        function init() {
            setConfigStatus("", false);
            setSyncStatus("", false);
            void loadWebDavLocalSettings()
                .then((value) => {
                    setWebDavFormData(value);
                })
                .catch((err) => {
                    setSyncStatus(
                        t("options.toast.syncConfigReadFailed", {
                            error: errMsg(err),
                        }),
                        true,
                    );
                });
        }

        return {
            bindEvents,
            init,
            requestOptionalHostPermissions,
        };
    }

    global.JYT_OPTION_SYNC_DATA = {
        createSyncDataController,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
