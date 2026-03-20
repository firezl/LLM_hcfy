import {
    MESSAGE_TYPE_START,
    MESSAGE_TYPE_WEBLLM_CLEAR_CACHE,
    MESSAGE_TYPE_WEBLLM_GET_MODELS,
    MESSAGE_TYPE_WEBLLM_PRELOAD,
    PORT_NAME,
} from "./constants.js";
import { handleTabRemoved, handleTabUpdated } from "./pdf-redirect.js";
import { handleTranslateStart } from "./translate-router.js";
import {
    handleWebLLMClearCache,
    handleWebLLMGetModels,
    handleWebLLMPreload,
    startWebLLMIdleMonitor,
} from "./engines/webllm.js";

startWebLLMIdleMonitor();

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) {
        return;
    }

    const state = {
        connected: true,
        controllers: new Map(),
    };

    port.onDisconnect.addListener(() => {
        state.connected = false;
        for (const controller of state.controllers.values()) {
            controller.abort();
        }
        state.controllers.clear();
    });

    port.onMessage.addListener((message) => {
        if (!message || !message.type) {
            return;
        }

        if (message.type === MESSAGE_TYPE_START) {
            void handleTranslateStart(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_PRELOAD) {
            void handleWebLLMPreload(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_CLEAR_CACHE) {
            void handleWebLLMClearCache(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_WEBLLM_GET_MODELS) {
            void handleWebLLMGetModels(message, port, state);
        }
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    handleTabUpdated(tabId, changeInfo);
});

chrome.tabs.onRemoved.addListener((tabId) => {
    handleTabRemoved(tabId);
});
