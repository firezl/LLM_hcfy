// options/modules/pdf-context.js — PDF detection and viewer launch
(function (global) {
    function createPdfContext(deps) {
        const { pdf, showToast, isFirefoxRuntime } = deps;
        const { openLocalPdfBtn, currentPdfStatusEl } = pdf;
        const t = (key, vars) =>
            global.JYT_I18N?.t ? global.JYT_I18N.t(key, vars) : key;

        let cachedActiveTab = null;
        let cachedCurrentPdfUrl = "";

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
                        setOpenButtonLabel(t("options.pdf.openLocalFirefox"));
                        currentPdfStatusEl.textContent = t(
                            "options.pdf.detectedFirefox",
                            { fileName },
                        );
                        return;
                    }

                    setOpenButtonLabel(t("options.pdf.openCurrentPdf"));
                    currentPdfStatusEl.textContent = t("options.pdf.detected", {
                        fileName,
                    });
                    return;
                }

                setOpenButtonLabel(t("options.pdf.openLocalCompat"));
                if (activeTab?.url) {
                    currentPdfStatusEl.textContent = t("options.pdf.noPdfDetected");
                } else {
                    currentPdfStatusEl.textContent = t("options.pdf.noTabInfo");
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

        function bindOpenPdfButton() {
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
                            showToast(t("options.pdf.firefoxFilePickerHint"));
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
                        showToast(t("options.pdf.openFailed"));
                    }
                });
        }

        return {
            refreshActivePdfContext,
            getCurrentActiveTab,
            bindOpenPdfButton,
            getCachedActiveTab: () => cachedActiveTab,
            getCachedCurrentPdfUrl: () => cachedCurrentPdfUrl,
        };
    }

    global.JYT_OPTION_PDF = {
        createPdfContext,
    };
})(globalThis);
