import {
    MESSAGE_TYPE_CONFIG_EXPORT,
    MESSAGE_TYPE_CONFIG_IMPORT,
    MESSAGE_TYPE_HISTORY_ADD,
    MESSAGE_TYPE_HISTORY_CLEAR,
    MESSAGE_TYPE_HISTORY_DELETE,
    MESSAGE_TYPE_HISTORY_LIST,
    MESSAGE_TYPE_HISTORY_UPDATE_FAVORITE,
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
    MESSAGE_TYPE_CANCEL,
    PORT_NAME,
    MESSAGE_TYPE_OPENAI_COMPAT_GET_MODELS,
    MESSAGE_TYPE_OPENROUTER_GET_MODELS,
    MESSAGE_TYPE_CLAUDE_GET_MODELS,
    MESSAGE_TYPE_GEMINI_GET_MODELS,
    MESSAGE_TYPE_API_CONNECTION_TEST,
} from "./constants.js";
import {
    handlePdfRuntimeMessage,
    handleTabRemoved,
    handleTabUpdated,
} from "./pdf-redirect.js";
import { handleTranslateStart, handleTestConnection } from "./translate-router.js";
import { handleOllamaGetModels } from "./engines/ollama.js";
import { handleOpenAICompatGetModels } from "./engines/openai-compat-models.js";
import { handleOpenRouterGetModels } from "./engines/openrouter.js";
import { handleClaudeGetModels } from "./engines/claude-models.js";
import { handleGeminiGetModels } from "./engines/gemini-models.js";
import {
    ensureTermStoreReady,
    handleTermMessage as handleBackgroundTermMessage,
} from "./term.js";
import { extensionApi } from "./extension-api.js";
import { handleHistoryMessage } from "./history.js";
import { handleSyncMessage } from "./sync-manager.js";
import { initContextMenu } from "./context-menu.js";
import { initOnboarding } from "./onboarding.js";
import { initSettingsCache } from "./settings-cache.js";
import { initBackgroundI18n } from "./i18n.js";

void ensureTermStoreReady();
void initBackgroundI18n();
initContextMenu();
initOnboarding();
initSettingsCache();

// 来自网页 content script 可安全调用的消息子集。
// 其余消息（CONFIG_*、SYNC_*、API_CONNECTION_TEST、HISTORY_LIST/DELETE/CLEAR、
// TERM_IMPORT/EXPORT/LIST/DELETE/CLEAR 等）属于特权操作，仅接受扩展自身页面触发。
const CONTENT_ALLOWED_MESSAGE_TYPES = new Set([
    MESSAGE_TYPE_HISTORY_ADD,
    MESSAGE_TYPE_TERM_UPSERT,
    MESSAGE_TYPE_PDF_CHECK_URL,
    MESSAGE_TYPE_PDF_OPEN_IN_VIEWER,
    MESSAGE_TYPE_PDF_PROMPT_DECISION,
    MESSAGE_TYPE_PDF_GET_PENDING_PROMPT,
]);

function getExtensionBaseUrl() {
    try {
        return extensionApi.runtime.getURL("");
    } catch (err) {
        return "";
    }
}

// 扩展自身页面（options.html 等）的 sender 没有 tab，且 url 以扩展基址开头；
// content script 的 sender.tab 指向宿主标签页，据此区分来源以防止恶意网页调用特权消息。
function isExtensionPageSender(sender) {
    if (sender?.tab) {
        return false;
    }
    const url = String(sender?.url || "");
    const base = getExtensionBaseUrl();
    return Boolean(base && url && url.startsWith(base));
}

extensionApi.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) {
        return;
    }

    const state = {
        connected: true,
        controllers: new Map(),
    };

    port.onDisconnect.addListener(() => {
        // 端口因页面进入 bfcache 等原因断开时，Chrome 会设置 runtime.lastError
        // （如 "The page keeping the extension port is moved into back/forward cache..."），
        // 必须在此处读取以避免 "Unchecked runtime.lastError" 控制台告警。
        const lastError = extensionApi.runtime?.lastError;
        state.connected = false;
        if (lastError) {
            // bfcache / 通道关闭属预期断开，无需告警；其他原因可选记录。
        }
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

        if (message.type === MESSAGE_TYPE_CANCEL) {
            const requestId = String(message.requestId || "").trim();
            if (!requestId) {
                return;
            }

            const controller = state.controllers.get(requestId);
            if (controller) {
                controller.abort();
                state.controllers.delete(requestId);
            }
            return;
        }

        if (message.type === MESSAGE_TYPE_OLLAMA_GET_MODELS) {
            void handleOllamaGetModels(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_OPENAI_COMPAT_GET_MODELS) {
            void handleOpenAICompatGetModels(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_OPENROUTER_GET_MODELS) {
            void handleOpenRouterGetModels(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_CLAUDE_GET_MODELS) {
            void handleClaudeGetModels(message, port, state);
            return;
        }

        if (message.type === MESSAGE_TYPE_GEMINI_GET_MODELS) {
            void handleGeminiGetModels(message, port, state);
            return;
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
    const isHistoryMessage =
        type === MESSAGE_TYPE_HISTORY_ADD ||
        type === MESSAGE_TYPE_HISTORY_LIST ||
        type === MESSAGE_TYPE_HISTORY_UPDATE_FAVORITE ||
        type === MESSAGE_TYPE_HISTORY_DELETE ||
        type === MESSAGE_TYPE_HISTORY_CLEAR;
    const isTestMessage = type === MESSAGE_TYPE_API_CONNECTION_TEST;

    if (!isPdfMessage && !isTermMessage && !isSyncMessage && !isHistoryMessage && !isTestMessage) {
        return false;
    }

    // 来源校验：非扩展自身页面（即网页 content script）只能调用安全子集，
    // 防止恶意页面通过 sendMessage 触发 CONFIG/SYNC/连接测试/历史导出等特权操作。
    if (!isExtensionPageSender(sender) && !CONTENT_ALLOWED_MESSAGE_TYPES.has(type)) {
        return false;
    }

    const handler = isPdfMessage
        ? (payload) => handlePdfRuntimeMessage(payload, sender)
        : isTermMessage
          ? handleBackgroundTermMessage
          : isHistoryMessage
            ? handleHistoryMessage
            : isSyncMessage
              ? handleSyncMessage
              : handleTestConnection;

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
