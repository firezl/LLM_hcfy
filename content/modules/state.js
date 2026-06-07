// content/modules/state.js
(function (global) {
    function createSessionState(defaultSettings) {
        return {
            lastSelection: "",
            isPinned: false,
            translatePort: null,
            activeRequest: null,
            translateGeneration: 0,
            lastTranslateContext: null,
            copyStatusTimer: null,
            runtimeSettings: { ...defaultSettings },
            pdfPromptState: null,
            pdfPromptEl: null,
            pdfPromptAutoCloseTimer: null,
            pdfPromptCountdownInterval: null,
            translatorCache: new Map(),
            translationModelReady: false,
            languageDetectorModelReady: false,
            languageDetectorInstance: null,
            translatePortClosing: false,
        };
    }

    global.JYT_CS_STATE = { createSessionState };
})(globalThis);
