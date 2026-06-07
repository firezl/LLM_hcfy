import { extensionApi } from "./extension-api.js";
import { MESSAGE_TYPE_TRANSLATE_SELECTION } from "./constants.js";

const CONTEXT_MENU_ID = "jyt-translate-selection";

function registerContextMenu() {
    if (!extensionApi.contextMenus?.create) {
        return;
    }

    extensionApi.contextMenus.removeAll(() => {
        extensionApi.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: '翻译「%s」',
            contexts: ["selection"],
        });
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
    registerContextMenu();

    if (extensionApi.runtime.onInstalled) {
        extensionApi.runtime.onInstalled.addListener(() => {
            registerContextMenu();
        });
    }

    if (extensionApi.contextMenus?.onClicked) {
        extensionApi.contextMenus.onClicked.addListener((info, tab) => {
            void handleContextMenuClick(info, tab);
        });
    }
}
