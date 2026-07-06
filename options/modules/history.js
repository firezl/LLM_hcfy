(function (global) {
    function createHistoryController(options) {
        const deps = options && typeof options === "object" ? options : {};
        const t = (key, vars) =>
            global.JYT_I18N?.t ? global.JYT_I18N.t(key, vars) : key;
        const errMsg = (err) =>
            err && err.message ? err.message : String(err);
        const elements = deps.elements || {};
        const messageTypes = deps.messageTypes || {};
        const sendBackgroundMessage = deps.sendBackgroundMessage;
        const showToast = deps.showToast || (() => {});

        let itemsCache = [];

        function setStatus(text, isError) {
            if (!elements.status) return;
            elements.status.textContent = text || "";
            elements.status.classList.toggle("jyt-status-error", !!isError);
        }

        function formatTime(value) {
            const date = new Date(Number(value) || Date.now());
            return date.toLocaleString();
        }

        function getFilters() {
            return {
                query: String(elements.search?.value || "").trim(),
                favoriteOnly:
                    String(elements.filter?.value || "all") === "favorite",
            };
        }

        async function copyText(text) {
            const value = String(text || "");
            if (!value) return;
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                return;
            }

            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
        }

        function renderList(items) {
            if (!elements.list) return;
            const list = Array.isArray(items) ? items : [];
            elements.list.textContent = "";

            if (list.length === 0) {
                const empty = document.createElement("div");
                empty.className = "jyt-history-empty";
                empty.textContent = t("options.history.empty");
                elements.list.appendChild(empty);
                return;
            }

            for (const item of list) {
                const row = document.createElement("article");
                row.className = "jyt-history-item";
                row.dataset.id = item.id;

                const meta = document.createElement("div");
                meta.className = "jyt-history-meta";
                meta.textContent = [
                    formatTime(item.createdAt),
                    item.sourceLang && item.targetLang
                        ? `${item.sourceLang} -> ${item.targetLang}`
                        : "",
                    item.engine || "",
                    item.model || "",
                ]
                    .filter(Boolean)
                    .join(" · ");

                const source = document.createElement("div");
                source.className = "jyt-history-source";
                source.textContent = item.sourceText || "";

                const target = document.createElement("div");
                target.className = "jyt-history-target";
                target.textContent = item.translatedText || "";

                const page = document.createElement("div");
                page.className = "jyt-history-page";
                page.textContent = item.pageTitle || item.pageUrl || "";

                const actions = document.createElement("div");
                actions.className = "jyt-history-actions";

                const copyBtn = document.createElement("button");
                copyBtn.type = "button";
                copyBtn.className = "jyt-history-copy";
                copyBtn.textContent = t("options.history.copyTranslation");

                const favoriteBtn = document.createElement("button");
                favoriteBtn.type = "button";
                favoriteBtn.className = "jyt-history-favorite";
                favoriteBtn.textContent = item.favorite
                    ? t("common.unfavorite")
                    : t("common.favorite");

                const deleteBtn = document.createElement("button");
                deleteBtn.type = "button";
                deleteBtn.className = "jyt-history-delete";
                deleteBtn.textContent = t("common.delete");

                actions.append(copyBtn, favoriteBtn, deleteBtn);
                row.append(meta, source, target, page, actions);
                elements.list.appendChild(row);
            }
        }

        async function refreshList() {
            if (typeof sendBackgroundMessage !== "function") return;
            const filters = getFilters();
            const result = await sendBackgroundMessage(
                messageTypes.HISTORY_LIST || "HISTORY_LIST",
                {
                    query: filters.query,
                    favoriteOnly: filters.favoriteOnly,
                    limit: 1000,
                },
            );
            if (!result?.ok) {
                throw new Error(
                    result?.error || t("options.error.historyReadFailed"),
                );
            }
            itemsCache = Array.isArray(result.items) ? result.items : [];
            renderList(itemsCache);
            setStatus(t("options.history.count", { count: itemsCache.length }), false);
        }

        async function handleListClick(event) {
            const row = event.target.closest(".jyt-history-item");
            if (!row) return;
            const id = row.dataset.id || "";
            const item = itemsCache.find((entry) => entry.id === id);
            if (!item) return;

            try {
                if (event.target.closest(".jyt-history-copy")) {
                    await copyText(item.translatedText);
                    showToast(t("options.toast.translationCopied"));
                    return;
                }

                if (event.target.closest(".jyt-history-favorite")) {
                    const result = await sendBackgroundMessage(
                        messageTypes.HISTORY_UPDATE_FAVORITE ||
                            "HISTORY_UPDATE_FAVORITE",
                        { id, favorite: !item.favorite },
                    );
                    if (!result?.ok) {
                        throw new Error(
                            result?.error ||
                                t("options.error.favoriteUpdateFailed"),
                        );
                    }
                    await refreshList();
                    return;
                }

                if (event.target.closest(".jyt-history-delete")) {
                    const result = await sendBackgroundMessage(
                        messageTypes.HISTORY_DELETE || "HISTORY_DELETE",
                        { id },
                    );
                    if (!result?.ok) {
                        throw new Error(
                            result?.error ||
                                t("options.error.historyDeleteFailed"),
                        );
                    }
                    await refreshList();
                }
            } catch (err) {
                setStatus(
                    t("options.error.operationFailed", { error: errMsg(err) }),
                    true,
                );
            }
        }

        async function clearHistory() {
            const ok = window.confirm(t("options.history.clearConfirm"));
            if (!ok) return;

            try {
                const result = await sendBackgroundMessage(
                    messageTypes.HISTORY_CLEAR || "HISTORY_CLEAR",
                );
                if (!result?.ok) {
                    throw new Error(
                        result?.error || t("options.error.historyClearFailed"),
                    );
                }
                await refreshList();
            } catch (err) {
                setStatus(
                    t("options.error.operationFailed", { error: errMsg(err) }),
                    true,
                );
            }
        }

        function bindEvents() {
            elements.search?.addEventListener("input", () => {
                window.clearTimeout(bindEvents.searchTimer);
                bindEvents.searchTimer = window.setTimeout(() => {
                    void refreshList().catch((err) =>
                        setStatus(
                            t("options.error.historyLoadFailed", {
                                error: errMsg(err),
                            }),
                            true,
                        ),
                    );
                }, 200);
            });
            elements.filter?.addEventListener("change", () => {
                void refreshList().catch((err) =>
                    setStatus(
                        t("options.error.historyLoadFailed", {
                            error: errMsg(err),
                        }),
                        true,
                    ),
                );
            });
            elements.refreshButton?.addEventListener("click", () => {
                void refreshList().catch((err) =>
                    setStatus(
                        t("options.error.historyLoadFailed", {
                            error: errMsg(err),
                        }),
                        true,
                    ),
                );
            });
            elements.clearButton?.addEventListener("click", clearHistory);
            elements.list?.addEventListener("click", handleListClick);
        }

        return {
            bindEvents,
            refreshList,
            setStatus,
        };
    }

    global.JYT_OPTION_HISTORY = {
        createHistoryController,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
