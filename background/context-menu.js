import { extensionApi, isFirefoxExtension } from "./extension-api.js";
import { MESSAGE_TYPE_TRANSLATE_SELECTION } from "./constants.js";
import { onLangChange, t } from "./i18n.js";

const CONTEXT_MENU_ID = "jyt-translate-selection";

/** Serialize menu mutations to avoid duplicate-id create races. */
let menuTask = Promise.resolve();
/** Whether our menu item was created in this service worker lifetime. */
let menuRegistered = false;

function drainContextMenuLastError(action) {
    const lastError = extensionApi.runtime?.lastError;
    if (lastError?.message) {
        console.warn(`LLM划词翻译: contextMenus.${action} 失败:`, lastError.message);
    }
}

function runMenuTask(task) {
    menuTask = menuTask.then(task).catch((err) => {
        console.warn("LLM划词翻译: contextMenus 任务失败:", err);
    });
    return menuTask;
}

function promisifyContextMenuCall(method, ...args) {
    return new Promise((resolve) => {
        method(...args, () => {
            const err = extensionApi.runtime?.lastError;
            resolve(!err?.message);
        });
    });
}

function getMenuTitle() {
    return t("contextMenu.translateSelection");
}

async function createContextMenuItem() {
    if (!extensionApi.contextMenus?.create) {
        console.warn("LLM划词翻译: contextMenus.create 不可用");
        return false;
    }

    const ok = await promisifyContextMenuCall(
        extensionApi.contextMenus.create.bind(extensionApi.contextMenus),
        {
            id: CONTEXT_MENU_ID,
            title: getMenuTitle(),
            contexts: ["selection"],
        },
    );
    if (!ok) {
        drainContextMenuLastError("create");
    }
    return ok;
}

async function updateContextMenuItem() {
    if (!extensionApi.contextMenus?.update) {
        return false;
    }

    const ok = await promisifyContextMenuCall(
        extensionApi.contextMenus.update.bind(extensionApi.contextMenus),
        CONTEXT_MENU_ID,
        { title: getMenuTitle() },
    );
    if (!ok) {
        drainContextMenuLastError("update");
    }
    return ok;
}

async function removeAllContextMenuItems() {
    if (!extensionApi.contextMenus?.removeAll) {
        return;
    }

    await promisifyContextMenuCall(
        extensionApi.contextMenus.removeAll.bind(extensionApi.contextMenus),
    );
    drainContextMenuLastError("removeAll");
}

async function ensureContextMenuItem() {
    if (!extensionApi.contextMenus?.create) {
        console.warn("LLM划词翻译: contextMenus API 不可用");
        return;
    }

    if (menuRegistered) {
        const updated = await updateContextMenuItem();
        if (updated) {
            return;
        }
        menuRegistered = false;
    }

    if (isFirefoxExtension()) {
        const created = await createContextMenuItem();
        menuRegistered = created;
        return;
    }

    await removeAllContextMenuItems();
    const created = await createContextMenuItem();
    menuRegistered = created;
}

function registerContextMenu() {
    void runMenuTask(() => ensureContextMenuItem());
}

function refreshContextMenuTitle() {
    void runMenuTask(async () => {
        if (menuRegistered) {
            const updated = await updateContextMenuItem();
            if (updated) {
                return;
            }
            menuRegistered = false;
        }
        await ensureContextMenuItem();
    });
}

async function sendTranslateMessage(tabId, payload, frameId) {
    const options = frameId != null ? { frameId } : undefined;

    try {
        const maybePromise = extensionApi.tabs.sendMessage(
            tabId,
            payload,
            options,
        );
        if (maybePromise && typeof maybePromise.then === "function") {
            await maybePromise;
        }
        return true;
    } catch {
        return false;
    }
}

async function handleContextMenuClick(info, tab) {
    if (info.menuItemId !== CONTEXT_MENU_ID) {
        return;
    }

    const text = String(info.selectionText || "").trim();
    if (!text || !tab?.id) {
        return;
    }

    const payload = {
        type: MESSAGE_TYPE_TRANSLATE_SELECTION,
        text,
    };

    const frameId = info.frameId ?? 0;
    const sent = await sendTranslateMessage(tab.id, payload, frameId);
    if (!sent && frameId !== 0) {
        await sendTranslateMessage(tab.id, payload);
    }
}

export function initContextMenu() {
    if (extensionApi.contextMenus?.onClicked) {
        extensionApi.contextMenus.onClicked.addListener((info, tab) => {
            void handleContextMenuClick(info, tab);
        });
    }

    onLangChange(() => {
        refreshContextMenuTitle();
    });

    if (extensionApi.runtime?.onInstalled) {
        extensionApi.runtime.onInstalled.addListener(() => {
            menuRegistered = false;
            registerContextMenu();
        });
    }

    registerContextMenu();
}
