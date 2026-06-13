import { extensionApi } from "./extension-api.js";

const ONBOARDING_PENDING_KEY = "onboarding_pending";

export function initOnboarding() {
    if (!extensionApi.runtime.onInstalled) {
        return;
    }

    extensionApi.runtime.onInstalled.addListener((details) => {
        if (details.reason !== "install") {
            return;
        }

        void extensionApi.storage.local.set({ [ONBOARDING_PENDING_KEY]: true });

        const optionsUrl = extensionApi.runtime.getURL("options.html");
        try {
            const maybePromise = extensionApi.tabs.create({ url: optionsUrl });
            if (maybePromise && typeof maybePromise.catch === "function") {
                maybePromise.catch(() => {
                    /* 无 tabs 权限时用户手动打开设置页，pending 标记仍会触发引导 */
                });
            }
        } catch {
            /* ignore */
        }
    });
}
