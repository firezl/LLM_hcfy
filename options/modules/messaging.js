// options/modules/messaging.js — background port and one-shot messages
(function (global) {
    function createMessaging() {
        let backgroundPort = null;
        const ollamaModelRequestResolvers = new Map();
        const openaiCompatModelRequestResolvers = new Map();
        const openrouterModelRequestResolvers = new Map();
        const claudeModelRequestResolvers = new Map();
        const geminiModelRequestResolvers = new Map();
        const specialModelRequestResolvers = new Map();

        function sendBackgroundMessage(type, payload) {
            const request = {
                type,
                ...(payload || {}),
            };

            if (
                typeof browser !== "undefined" &&
                browser.runtime &&
                typeof browser.runtime.sendMessage === "function"
            ) {
                return browser.runtime.sendMessage(request);
            }

            return new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage(request, (resp) => {
                        const err = chrome.runtime.lastError;
                        if (err) {
                            reject(new Error(err.message || "后台消息发送失败"));
                            return;
                        }
                        resolve(resp);
                    });
                } catch (err) {
                    reject(err);
                }
            });
        }

        function sendTermMessage(type, payload) {
            return sendBackgroundMessage(type, payload);
        }

        function ensureBackgroundPort() {
            if (backgroundPort) return backgroundPort;

            backgroundPort = chrome.runtime.connect({ name: "jyt-translate" });
            backgroundPort.onMessage.addListener((message) => {
                if (!message) return;

                if (message.type === "OLLAMA_OP_ERROR") {
                    const resolvePending = ollamaModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        ollamaModelRequestResolvers.delete(message.requestId);
                        resolvePending({ modelIds: [] });
                    }
                    return;
                }

                if (message.type === "OLLAMA_MODELS_RESPONSE") {
                    const resolvePending = ollamaModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        ollamaModelRequestResolvers.delete(message.requestId);
                        resolvePending(message);
                    }
                    return;
                }

                if (message.type === "OPENAI_COMPAT_OP_ERROR") {
                    const resolvePending =
                        openaiCompatModelRequestResolvers.get(message.requestId);
                    if (resolvePending) {
                        openaiCompatModelRequestResolvers.delete(
                            message.requestId,
                        );
                        resolvePending({ modelIds: [] });
                    }
                    return;
                }

                if (message.type === "OPENAI_COMPAT_MODELS_RESPONSE") {
                    const resolvePending =
                        openaiCompatModelRequestResolvers.get(message.requestId);
                    if (resolvePending) {
                        openaiCompatModelRequestResolvers.delete(
                            message.requestId,
                        );
                        resolvePending(message);
                    }
                    return;
                }

                if (message.type === "OPENROUTER_OP_ERROR") {
                    const resolvePending = openrouterModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        openrouterModelRequestResolvers.delete(message.requestId);
                        resolvePending({ modelItems: [] });
                    }
                    return;
                }

                if (message.type === "OPENROUTER_MODELS_RESPONSE") {
                    const resolvePending = openrouterModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        openrouterModelRequestResolvers.delete(message.requestId);
                        resolvePending(message);
                    }
                    return;
                }

                if (message.type === "CLAUDE_OP_ERROR") {
                    const resolvePending = claudeModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        claudeModelRequestResolvers.delete(message.requestId);
                        resolvePending({ modelIds: [] });
                    }
                    return;
                }

                if (message.type === "CLAUDE_MODELS_RESPONSE") {
                    const resolvePending = claudeModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        claudeModelRequestResolvers.delete(message.requestId);
                        resolvePending(message);
                    }
                    return;
                }

                if (message.type === "GEMINI_OP_ERROR") {
                    const resolvePending = geminiModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        geminiModelRequestResolvers.delete(message.requestId);
                        resolvePending({ modelIds: [] });
                    }
                    return;
                }

                if (message.type === "GEMINI_MODELS_RESPONSE") {
                    const resolvePending = geminiModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        geminiModelRequestResolvers.delete(message.requestId);
                        resolvePending(message);
                    }
                    return;
                }

                if (message.type === "SPECIAL_TRANSLATE_OP_ERROR") {
                    const resolvePending = specialModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        specialModelRequestResolvers.delete(message.requestId);
                        resolvePending({ modelIds: ["translategemma"] });
                    }
                    return;
                }

                if (message.type === "SPECIAL_TRANSLATE_MODELS_RESPONSE") {
                    const resolvePending = specialModelRequestResolvers.get(
                        message.requestId,
                    );
                    if (resolvePending) {
                        specialModelRequestResolvers.delete(message.requestId);
                        resolvePending(message);
                    }
                }
            });

            backgroundPort.onDisconnect.addListener(() => {
                backgroundPort = null;
            });

            return backgroundPort;
        }

        return {
            sendBackgroundMessage,
            sendTermMessage,
            ensureBackgroundPort,
            resolvers: {
                ollama: ollamaModelRequestResolvers,
                openaiCompat: openaiCompatModelRequestResolvers,
                openrouter: openrouterModelRequestResolvers,
                claude: claudeModelRequestResolvers,
                gemini: geminiModelRequestResolvers,
                special: specialModelRequestResolvers,
            },
        };
    }

    global.JYT_OPTION_MESSAGING = {
        createMessaging,
    };
})(globalThis);
