// content/modules/context-collector.js — smart context collection for LLM translation
import {
    collectSelectionContext,
    resolveContextMode,
} from "../../libs/context-collector.mjs";

(function (global) {
    function install(app) {
        Object.assign(app, {
            resolveContextMode(settings) {
                return resolveContextMode(settings);
            },
            collectSelectionContext(sel, mode) {
                try {
                    const resolvedMode =
                        mode ||
                        resolveContextMode(app.state?.runtimeSettings || {});
                    return collectSelectionContext(
                        sel,
                        resolvedMode,
                        document,
                        window,
                    );
                } catch (_err) {
                    return null;
                }
            },
        });
    }

    global.JYT_CS_CONTEXT = { install };
})(globalThis);
