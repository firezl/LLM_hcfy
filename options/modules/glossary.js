(function (global) {
    function normalizeLang(lang) {
        const value = String(lang || "")
            .trim()
            .toLowerCase();
        if (!value || value === "auto") return "";
        return value.split("-")[0];
    }

    function normalizeTermText(text) {
        return String(text || "").trim();
    }

    function termKey(term) {
        const sourceLang = normalizeLang(term?.sourceLang);
        const targetLang = normalizeLang(term?.targetLang);
        const sourceTerm = normalizeTermText(term?.sourceTerm).toLowerCase();
        return `${sourceLang}::${targetLang}::${sourceTerm}`;
    }

    function sanitizeTerms(rawTerms) {
        const input = Array.isArray(rawTerms) ? rawTerms : [];
        const map = new Map();

        for (const item of input) {
            const sourceTerm = normalizeTermText(item?.sourceTerm);
            const targetTerm = normalizeTermText(item?.targetTerm);
            const sourceLang = normalizeLang(item?.sourceLang);
            const targetLang = normalizeLang(item?.targetLang);
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
            map.set(termKey(normalized), normalized);
        }

        return Array.from(map.values());
    }

    function createGlossaryController(options) {
        const deps = options && typeof options === "object" ? options : {};
        const elements = deps.elements || {};
        const messageTypes = deps.messageTypes || {};
        const sendTermMessage = deps.sendTermMessage;
        const readFileAsText = deps.readFileAsText;
        const shouldOpenImportInNewTab =
            deps.shouldOpenImportInNewTab || (() => false);
        const openImportInNewTab =
            deps.openImportInNewTab ||
            (() => Promise.reject(new Error("无法打开导入页面")));

        let termsCache = [];
        let editingOriginal = null;

        function setStatus(text, isError) {
            if (!elements.status) return;
            elements.status.textContent = text || "";
            elements.status.classList.toggle("jyt-status-error", !!isError);
        }

        function getFormTerm() {
            return {
                sourceLang: normalizeLang(elements.sourceLang?.value),
                targetLang: normalizeLang(elements.targetLang?.value),
                sourceTerm: normalizeTermText(elements.sourceTerm?.value),
                targetTerm: normalizeTermText(elements.targetTerm?.value),
            };
        }

        function resetEditor() {
            editingOriginal = null;
            if (elements.sourceLang) elements.sourceLang.value = "en";
            if (elements.targetLang) elements.targetLang.value = "zh";
            if (elements.sourceTerm) elements.sourceTerm.value = "";
            if (elements.targetTerm) elements.targetTerm.value = "";
            if (elements.saveButton) elements.saveButton.textContent = "新增术语";
        }

        function populateEditor(term) {
            editingOriginal = term || null;
            if (!term) {
                resetEditor();
                return;
            }

            if (elements.sourceLang) elements.sourceLang.value = term.sourceLang;
            if (elements.targetLang) elements.targetLang.value = term.targetLang;
            if (elements.sourceTerm) elements.sourceTerm.value = term.sourceTerm;
            if (elements.targetTerm) elements.targetTerm.value = term.targetTerm;
            if (elements.saveButton) elements.saveButton.textContent = "更新术语";
        }

        function renderList(terms) {
            if (!elements.list) return;
            const list = Array.isArray(terms) ? terms : [];
            elements.list.textContent = "";
            if (list.length === 0) {
                const emptyEl = document.createElement("div");
                emptyEl.className = "jyt-glossary-empty";
                emptyEl.textContent = "暂无术语，先添加一条吧。";
                elements.list.appendChild(emptyEl);
                return;
            }

            const table = document.createElement("table");
            table.className = "jyt-glossary-table";

            const thead = document.createElement("thead");
            const headRow = document.createElement("tr");
            for (const label of ["语言对", "原文", "目标", "操作"]) {
                const th = document.createElement("th");
                th.textContent = label;
                headRow.appendChild(th);
            }
            thead.appendChild(headRow);
            table.appendChild(thead);

            const tbody = document.createElement("tbody");
            list.forEach((term, index) => {
                const row = document.createElement("tr");
                const pairCell = document.createElement("td");
                const sourceCell = document.createElement("td");
                const targetCell = document.createElement("td");
                const actionCell = document.createElement("td");
                const editBtn = document.createElement("button");
                const deleteBtn = document.createElement("button");

                pairCell.textContent = `${term.sourceLang} -> ${term.targetLang}`;
                sourceCell.textContent = term.sourceTerm || "";
                targetCell.textContent = term.targetTerm || "";

                editBtn.className = "jyt-glossary-row-edit";
                editBtn.dataset.index = String(index);
                editBtn.type = "button";
                editBtn.textContent = "编辑";

                deleteBtn.className = "jyt-glossary-row-delete";
                deleteBtn.dataset.index = String(index);
                deleteBtn.type = "button";
                deleteBtn.textContent = "删除";

                actionCell.append(editBtn, deleteBtn);
                row.append(pairCell, sourceCell, targetCell, actionCell);
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            elements.list.appendChild(table);
        }

        async function refreshList() {
            const result = await sendTermMessage(
                messageTypes.TERM_LIST || "TERM_LIST",
            );
            if (!result?.ok) {
                throw new Error(result?.error || "术语列表获取失败");
            }

            const sorted = (
                Array.isArray(result.terms) ? result.terms : []
            ).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
            termsCache = sorted;
            renderList(sorted);
        }

        async function exportTerms() {
            try {
                const result = await sendTermMessage(
                    messageTypes.TERM_EXPORT || "TERM_EXPORT",
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

                setStatus(`导出完成，共 ${terms.length} 条术语`, false);
                await refreshList();
            } catch (err) {
                setStatus(
                    `导出失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            }
        }

        function openImportPicker() {
            if (!elements.importFileInput) return;

            if (shouldOpenImportInNewTab()) {
                void openImportInNewTab()
                    .then(() => {
                        setStatus(
                            "Firefox 弹窗模式下已在新标签页打开导入页面",
                            false,
                        );
                    })
                    .catch((err) => {
                        setStatus(
                            `打开导入页面失败: ${err && err.message ? err.message : String(err)}`,
                            true,
                        );
                    });
                return;
            }

            elements.importFileInput.value = "";
            elements.importFileInput.click();
        }

        async function importSelectedFile() {
            const file = elements.importFileInput?.files?.[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                setStatus("导入失败: 文件过大，请控制在 5MB 以内", true);
                return;
            }

            try {
                const content = await readFileAsText(file);
                const parsed = JSON.parse(content);
                const importedTerms = sanitizeTerms(
                    parsed?.glossary_terms || parsed,
                );

                const result = await sendTermMessage(
                    messageTypes.TERM_IMPORT || "TERM_IMPORT",
                    { terms: importedTerms },
                );
                if (!result?.ok) {
                    throw new Error(result?.error || "导入失败");
                }

                setStatus(
                    `导入完成: 新增 ${result.created || 0}，覆盖 ${result.replaced || 0}，总计 ${result.total || 0}`,
                    false,
                );
                await refreshList();
                resetEditor();
            } catch (err) {
                setStatus(
                    `导入失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            }
        }

        async function saveCurrentTerm() {
            const term = getFormTerm();
            if (
                !term.sourceLang ||
                !term.targetLang ||
                !term.sourceTerm ||
                !term.targetTerm
            ) {
                setStatus("保存失败: 请完整填写术语字段", true);
                return;
            }

            try {
                const nextKey = termKey(term);
                const prevKey = editingOriginal ? termKey(editingOriginal) : "";

                if (editingOriginal && prevKey && prevKey !== nextKey) {
                    const delRes = await sendTermMessage(
                        messageTypes.TERM_DELETE || "TERM_DELETE",
                        { term: editingOriginal },
                    );
                    if (!delRes?.ok) {
                        throw new Error(delRes?.error || "旧术语删除失败");
                    }
                }

                const saveRes = await sendTermMessage(
                    messageTypes.TERM_UPSERT || "TERM_UPSERT",
                    { term },
                );
                if (!saveRes?.ok) {
                    throw new Error(saveRes?.error || "术语保存失败");
                }

                setStatus("术语已保存", false);
                await refreshList();
                resetEditor();
            } catch (err) {
                setStatus(
                    `保存失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            }
        }

        async function clearTerms() {
            const ok = window.confirm("确定清空术语库吗？该操作不可撤销。");
            if (!ok) return;

            try {
                const result = await sendTermMessage(
                    messageTypes.TERM_CLEAR || "TERM_CLEAR",
                );
                if (!result?.ok) {
                    throw new Error(result?.error || "清空失败");
                }
                await refreshList();
                resetEditor();
                setStatus("术语库已清空", false);
            } catch (err) {
                setStatus(
                    `清空失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            }
        }

        async function handleListClick(e) {
            const editBtn = e.target.closest(".jyt-glossary-row-edit");
            const deleteBtn = e.target.closest(".jyt-glossary-row-delete");
            if (!editBtn && !deleteBtn) return;

            const index = Number(
                (editBtn || deleteBtn).getAttribute("data-index"),
            );
            if (!Number.isInteger(index) || index < 0) return;
            const term = termsCache[index];
            if (!term) return;

            if (editBtn) {
                populateEditor(term);
                setStatus("已载入术语，编辑后点击更新", false);
                return;
            }

            try {
                const result = await sendTermMessage(
                    messageTypes.TERM_DELETE || "TERM_DELETE",
                    { term },
                );
                if (!result?.ok) {
                    throw new Error(result?.error || "删除失败");
                }

                await refreshList();
                if (editingOriginal && termKey(editingOriginal) === termKey(term)) {
                    resetEditor();
                }
                setStatus("术语已删除", false);
            } catch (err) {
                setStatus(
                    `删除失败: ${err && err.message ? err.message : String(err)}`,
                    true,
                );
            }
        }

        function bindEvents() {
            elements.exportButton?.addEventListener("click", exportTerms);
            elements.importButton?.addEventListener("click", openImportPicker);
            elements.importFileInput?.addEventListener(
                "change",
                importSelectedFile,
            );
            elements.saveButton?.addEventListener("click", saveCurrentTerm);
            elements.cancelEditButton?.addEventListener("click", () => {
                resetEditor();
                setStatus("", false);
            });
            elements.clearButton?.addEventListener("click", clearTerms);
            elements.list?.addEventListener("click", handleListClick);
        }

        return {
            bindEvents,
            refreshList,
            resetEditor,
            setStatus,
            openImportPicker,
        };
    }

    global.JYT_OPTION_GLOSSARY = {
        createGlossaryController,
        normalizeLang,
        normalizeTermText,
        sanitizeTerms,
        termKey,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
