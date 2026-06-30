document.addEventListener("DOMContentLoaded", () => {
    const i18n = globalThis.JYT_I18N;
    if (i18n) {
        i18n.loadUiLangFromStorage();
        i18n.bindStorageListener();
    }

    const t = (key, vars) => (i18n?.t ? i18n.t(key, vars) : key);

    const toastContainer = document.getElementById("toast_container");
    const extensionApi =
        (typeof chrome !== "undefined" && chrome.storage) ||
        (typeof browser !== "undefined" && browser.storage
            ? browser
            : null);

    let currentThemeMode = "auto";

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

    function syncThemeFromStorage() {
        if (!extensionApi?.storage?.sync) {
            applyTheme("auto");
            return;
        }

        extensionApi.storage.sync.get({ theme_mode: "auto" }, (items) => {
            const err = extensionApi.runtime?.lastError;
            if (err) {
                applyTheme("auto");
                return;
            }
            currentThemeMode = String(items?.theme_mode || "auto");
            applyTheme(currentThemeMode);
        });
    }

    function bindThemeListeners() {
        window
            .matchMedia("(prefers-color-scheme: dark)")
            .addEventListener("change", () => {
                if (currentThemeMode === "auto") {
                    applyTheme("auto");
                }
            });

        if (!extensionApi?.storage?.onChanged) {
            return;
        }

        extensionApi.storage.onChanged.addListener((changes, area) => {
            if (area !== "sync" || !changes.theme_mode) {
                return;
            }
            currentThemeMode = String(changes.theme_mode.newValue || "auto");
            applyTheme(currentThemeMode);
        });
    }

    function showToast(message) {
        if (!toastContainer) {
            return;
        }

        const toast = document.createElement("div");
        toast.className = "jyt-toast";
        toast.textContent = message;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("jyt-toast-show");
        });

        setTimeout(() => {
            toast.classList.remove("jyt-toast-show");
            setTimeout(() => toast.remove(), 250);
        }, 1600);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast(t("common.copySuccess"));
        } catch (err) {
            showToast(t("help.copyFailedManual"));
        }
    }

    syncThemeFromStorage();
    bindThemeListeners();

    document.querySelectorAll("[data-copy]").forEach((button) => {
        button.addEventListener("click", () => {
            copyText(button.dataset.copy || "");
        });
    });
});
