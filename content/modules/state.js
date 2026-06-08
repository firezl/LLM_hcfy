// content/modules/state.js
(function (global) {
    function createSessionState(defaultSettings) {
        return {
            lastSelection: "",
            lastSelectionPoint: null,
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
            renderRafId: null,
        };
    }

    global.JYT_CS_STATE = { createSessionState };
})(globalThis);
