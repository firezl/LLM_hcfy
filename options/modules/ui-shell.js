// options/modules/ui-shell.js — tabs, toast, theme
(function (global) {
    function createUiShell(deps) {
        const { onTabActivated } = deps || {};
        const tabs = document.querySelectorAll(".jyt-tab");
        const contents = document.querySelectorAll(".jyt-tab-content");
        const toastContainer = document.getElementById("toast_container");

        const showToast = (global.showToast = (msg, isError = false) => {
            if (!toastContainer) return;
            const toast = document.createElement("div");
            toast.className = `jyt-toast jyt-toast-show ${isError ? "jyt-toast-error" : "jyt-toast-success"}`;
            toast.textContent = msg;
            toastContainer.appendChild(toast);
            setTimeout(() => toast.classList.remove("jyt-toast-show"), 2500);
            setTimeout(() => toast.remove(), 3000);
        });

        function activateOptionsTab(tabId) {
            tabs.forEach((tab) => {
                tab.classList.toggle("active", tab.dataset.tab === tabId);
            });
            contents.forEach((content) => {
                content.classList.toggle("active", content.id === tabId);
            });
        }

        function bindTabs() {
            tabs.forEach((tab) => {
                tab.addEventListener("click", () => {
                    tabs.forEach((t) => t.classList.remove("active"));
                    contents.forEach((c) => c.classList.remove("active"));
                    tab.classList.add("active");
                    const targetId = tab.dataset.tab;
                    if (targetId) {
                        document.getElementById(targetId)?.classList.add("active");
                    }
                    if (targetId && typeof onTabActivated === "function") {
                        onTabActivated(targetId);
                    }
                });
            });
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

        function bindSystemThemeListener(themeModeEl) {
            window
                .matchMedia("(prefers-color-scheme: dark)")
                .addEventListener("change", () => {
                    if (themeModeEl?.value === "auto") {
                        applyTheme("auto");
                    }
                });
        }

        return {
            showToast,
            activateOptionsTab,
            bindTabs,
            applyTheme,
            bindSystemThemeListener,
        };
    }

    global.JYT_OPTION_UI = {
        createUiShell,
    };
})(globalThis);
