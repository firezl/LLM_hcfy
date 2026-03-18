(function () {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("openFilePicker") !== "1") {
        return;
    }

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("openFilePicker");
    window.history.replaceState({}, "", cleanUrl.toString());

    function triggerOpenFile() {
        const app = window.PDFViewerApplication;
        if (!app) {
            return false;
        }

        const openFileButton =
            document.getElementById("secondaryOpenFile") ||
            document.getElementById("openFile");

        if (openFileButton) {
            openFileButton.click();
            return true;
        }

        if (app.eventBus && typeof app.eventBus.dispatch === "function") {
            app.eventBus.dispatch("openfile", { source: window });
            return true;
        }

        return false;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
        attempts += 1;
        const ok = triggerOpenFile();
        if (ok || attempts > 40) {
            window.clearInterval(timer);
        }
    }, 100);
})();
