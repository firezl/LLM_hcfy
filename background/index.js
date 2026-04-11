import {
    MESSAGE_TYPE_CONFIG_EXPORT,
    MESSAGE_TYPE_CONFIG_IMPORT,
    MESSAGE_TYPE_TERM_CLEAR,
    MESSAGE_TYPE_TERM_DELETE,
    MESSAGE_TYPE_START,
    MESSAGE_TYPE_SYNC_BIDIRECTIONAL,
    MESSAGE_TYPE_SYNC_DOWNLOAD,
    MESSAGE_TYPE_SYNC_TEST,
    MESSAGE_TYPE_SYNC_UPLOAD,
    MESSAGE_TYPE_OLLAMA_GET_MODELS,
    MESSAGE_TYPE_PDF_CHECK_URL,
    MESSAGE_TYPE_PDF_OPEN_IN_VIEWER,
    MESSAGE_TYPE_PDF_PROMPT_DECISION,
    MESSAGE_TYPE_PDF_GET_PENDING_PROMPT,
    MESSAGE_TYPE_TERM_EXPORT,
    MESSAGE_TYPE_TERM_IMPORT,
    MESSAGE_TYPE_TERM_LIST,
    MESSAGE_TYPE_TERM_UPSERT,
    MESSAGE_TYPE_WEBLLM_CLEAR_CACHE,
    MESSAGE_TYPE_WEBLLM_GET_MODELS,
    MESSAGE_TYPE_WEBLLM_PRELOAD,
    PORT_NAME,
} from "./constants.js";
import {
    handlePdfRuntimeMessage,
    handleTabRemoved,
    handleTabUpdated,
} from "./pdf-redirect.js";
import { handleTranslateStart } from "./translate-router.js";
import { handleOllamaGetModels } from "./engines/ollama.js";
import {
    handleWebLLMClearCache,
    handleWebLLMGetModels,
    handleWebLLMPreload,
    startWebLLMIdleMonitor,
} from "./engines/webllm.js";
import {
    ensureTermStoreReady,
    handleTermMessage as handleBackgroundTermMessage,
} from "./term.js";
import { extensionApi } from "./extension-api.js";
import { handleSyncMessage } from "./sync-manager.js";

startWebLLMIdleMonitor();
void ensureTermStoreReady();

extensionApi.runtime.onConnect.addListener((port) => {
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
            return;
        }

        if (message.type === MESSAGE_TYPE_OLLAMA_GET_MODELS) {
            void handleOllamaGetModels(message, port, state);
        }
    });
});

extensionApi.tabs.onUpdated.addListener((tabId, changeInfo) => {
    handleTabUpdated(tabId, changeInfo);
});

extensionApi.tabs.onRemoved.addListener((tabId) => {
    handleTabRemoved(tabId);
});

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const type = String(message?.type || "");
    const isPdfMessage =
        type === MESSAGE_TYPE_PDF_CHECK_URL ||
        type === MESSAGE_TYPE_PDF_OPEN_IN_VIEWER ||
        type === MESSAGE_TYPE_PDF_PROMPT_DECISION ||
        type === MESSAGE_TYPE_PDF_GET_PENDING_PROMPT;
    const isTermMessage =
        type === MESSAGE_TYPE_TERM_UPSERT ||
        type === MESSAGE_TYPE_TERM_IMPORT ||
        type === MESSAGE_TYPE_TERM_EXPORT ||
        type === MESSAGE_TYPE_TERM_LIST ||
        type === MESSAGE_TYPE_TERM_DELETE ||
        type === MESSAGE_TYPE_TERM_CLEAR;
    const isSyncMessage =
        type === MESSAGE_TYPE_CONFIG_EXPORT ||
        type === MESSAGE_TYPE_CONFIG_IMPORT ||
        type === MESSAGE_TYPE_SYNC_TEST ||
        type === MESSAGE_TYPE_SYNC_UPLOAD ||
        type === MESSAGE_TYPE_SYNC_DOWNLOAD ||
        type === MESSAGE_TYPE_SYNC_BIDIRECTIONAL;

    if (!isPdfMessage && !isTermMessage && !isSyncMessage) {
        return false;
    }

    const handler = isPdfMessage
        ? (payload) => handlePdfRuntimeMessage(payload, sender)
        : isTermMessage
          ? handleBackgroundTermMessage
          : handleSyncMessage;

    void handler(message)
        .then((result) => {
            sendResponse(result);
        })
        .catch((err) => {
            sendResponse({
                ok: false,
                error: err && err.message ? err.message : String(err),
            });
        });

    return true;
});
