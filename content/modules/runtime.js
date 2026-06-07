// content/modules/runtime.js — auto-extracted from content_script.js
(function (global) {
    function install(app) {
        const state = app.state;
            function drainRuntimeLastError() {
                let message = "";
                try {
                    if (
                        typeof chrome !== "undefined" &&
                        chrome.runtime &&
                        chrome.runtime.lastError
                    ) {
                        message = chrome.runtime.lastError.message || "";
                    }
                } catch (err) {
                    // ignore
                }
                return message;
            }

            function getRuntimeApi() {
                if (
                    typeof chrome !== "undefined" &&
                    chrome.runtime &&
                    typeof chrome.runtime.sendMessage === "function"
                ) {
                    return chrome.runtime;
                }
                if (
                    typeof browser !== "undefined" &&
                    browser.runtime &&
                    typeof browser.runtime.sendMessage === "function"
                ) {
                    return browser.runtime;
                }
                return null;
            }

            function sendTermMessage(type, payload) {
                const runtimeApi = getRuntimeApi();
                if (!runtimeApi) {
                    return Promise.reject(new Error("运行时消息接口不可用"));
                }

                const request = {
                    type,
                    ...(payload || {}),
                };

                if (typeof browser !== "undefined" && runtimeApi === browser.runtime) {
                    return runtimeApi.sendMessage(request);
                }

                return new Promise((resolve, reject) => {
                    try {
                        runtimeApi.sendMessage(request, (resp) => {
                            const err = chrome?.runtime?.lastError;
                            if (err) {
                                reject(new Error(err.message || "术语消息发送失败"));
                                return;
                            }
                            resolve(resp);
                        });
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        Object.assign(app, {
            drainRuntimeLastError,
            getRuntimeApi,
            sendTermMessage,
        });
    }

    global.JYT_CS_RUNTIME = { install };
})(globalThis);
