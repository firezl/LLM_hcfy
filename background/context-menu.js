import { extensionApi, isFirefoxExtension } from "./extension-api.js";
import { MESSAGE_TYPE_TRANSLATE_SELECTION } from "./constants.js";

const CONTEXT_MENU_ID = "jyt-translate-selection";

function drainContextMenuLastError(action) {
    const lastError = extensionApi.runtime?.lastError;
    if (lastError?.message) {
        console.warn(`LLM划词翻译: contextMenus.${action} 失败:`, lastError.message);
    }
}

function createContextMenuItem() {
    if (!extensionApi.contextMenus?.create) {
        console.warn("LLM划词翻译: contextMenus.create 不可用");
        return;
    }

    extensionApi.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: '翻译「%s」',
        contexts: ["selection"],
    });
    drainContextMenuLastError("create");
}

function registerContextMenu() {
    if (!extensionApi.contextMenus?.create) {
        console.warn("LLM划词翻译: contextMenus API 不可用");
        return;
    }

    if (isFirefoxExtension()) {
        // Firefox 不会持久化菜单项，每次 Service Worker 启动都需同步创建。
        createContextMenuItem();
        return;
    }

    const removeAll = extensionApi.contextMenus.removeAll?.bind(
        extensionApi.contextMenus,
    );
    if (!removeAll) {
        createContextMenuItem();
        return;
    }

    const removed = removeAll();
    if (removed && typeof removed.then === "function") {
        void removed.then(() => createContextMenuItem());
        return;
    }

    removeAll(() => {
        createContextMenuItem();
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

    if (extensionApi.runtime?.onInstalled) {
        extensionApi.runtime.onInstalled.addListener(() => {
            registerContextMenu();
        });
    }

    registerContextMenu();
}
