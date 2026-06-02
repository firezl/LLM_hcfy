(function (global) {
    function createSyncDataController(options) {
        const deps = options && typeof options === "object" ? options : {};
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
            const granted = await requestOptionalHostPermissions([
                payload.baseUrl,
            ]);
            if (!granted) {
                setSyncStatus(
                    "未授予 WebDAV 访问权限，远端同步可能失败。",
                    true,
                );
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
                        reject(new Error(err.message || "WebDAV 配置保存失败"));
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
                        reject(new Error(err.message || "WebDAV 配置读取失败"));
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
                "检测到云端和本地都有更新，请选择处理方式：",
                "",
                `配置冲突字段: ${cfgCount}`,
                `本地术语: ${glossarySummary.localCount || 0} 条`,
                `云端术语: ${glossarySummary.remoteCount || 0} 条`,
                "",
                "输入 1 使用云端覆盖本地",
                "输入 2 使用本地覆盖云端",
                "输入 3 合并并保留最新更新时间",
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

        async function exportConfig() {
            try {
                const result = await sendBackgroundMessage(
                    messageTypes.CONFIG_EXPORT || "CONFIG_EXPORT",
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
                setConfigStatus(
                    "配置导入失败: 文件过大，请控制在 5MB 以内",
                    true,
                );
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
                    throw new Error(result?.error || "配置导入失败");
                }

                await new Promise((resolve, reject) => {
                    chrome.storage.local.set(localApiKeys, () => {
                        const err = chrome.runtime.lastError;
                        if (err) {
                            reject(new Error(err.message || "导入本地密钥失败"));
                            return;
                        }
                        resolve();
                    });
                });

                reloadSettings();
                setConfigStatus("配置导入完成", false);
            } catch (err) {
                setConfigStatus(
                    `配置导入失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            }
        }

        async function saveLocalWebDavConfig() {
            try {
                await saveWebDavLocalSettings();
                setSyncStatus("WebDAV 配置已保存到本地", false);
            } catch (err) {
                setSyncStatus(
                    `保存失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            }
        }

        async function testWebDavConnection() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus("正在测试 WebDAV 连接...", false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await sendBackgroundMessage(
                    messageTypes.SYNC_TEST || "SYNC_TEST",
                    { webdav },
                );
                if (!result?.ok) {
                    throw new Error(result?.error || "测试失败");
                }
                setSyncStatus(
                    `连接成功: config(${result.configStatus}) glossary(${result.glossaryStatus})`,
                    false,
                );
            } catch (err) {
                setSyncStatus(
                    `测试失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            } finally {
                setSyncButtonsEnabled(true);
            }
        }

        async function uploadSyncData() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus("正在上传配置与术语到 WebDAV...", false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await sendBackgroundMessage(
                    messageTypes.SYNC_UPLOAD || "SYNC_UPLOAD",
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
        }

        async function downloadSyncData() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus("正在从 WebDAV 下载配置与术语...", false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await sendBackgroundMessage(
                    messageTypes.SYNC_DOWNLOAD || "SYNC_DOWNLOAD",
                    { webdav },
                );
                if (!result?.ok) {
                    throw new Error(result?.error || "下载失败");
                }

                reloadSettings();
                await glossary.refreshList?.();
                glossary.resetEditor?.();
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
        }

        async function bidirectionalSyncData() {
            if (syncBusy) return;
            setSyncButtonsEnabled(false);
            setSyncStatus("正在执行双向同步...", false);
            try {
                const webdav = getWebDavFormData();
                await saveWebDavLocalSettings();
                const result = await runBidirectionalSync(webdav);

                reloadSettings();
                await glossary.refreshList?.();
                glossary.resetEditor?.();
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
                        `本地同步配置读取失败: ${err && err.message ? err.message : String(err)}`,
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
