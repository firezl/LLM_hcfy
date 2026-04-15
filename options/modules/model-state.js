(function (global) {
    function createModelLoaderState() {
        const loadedSet = new Set();
        const debounceTimers = new Map();

        function debounceByKey(key, task, delayMs) {
            const timeoutMs = Number.isFinite(delayMs) ? delayMs : 600;
            const timer = debounceTimers.get(key);
            if (timer) {
                clearTimeout(timer);
            }

            const nextTimer = setTimeout(() => {
                debounceTimers.delete(key);
                task();
            }, timeoutMs);
            debounceTimers.set(key, nextTimer);
        }

        function clear() {
            for (const timer of debounceTimers.values()) {
                clearTimeout(timer);
            }
            debounceTimers.clear();
            loadedSet.clear();
        }

        return {
            loadedSet,
            debounceByKey,
            clear,
        };
    }

    global.JYT_OPTION_MODEL = {
        createModelLoaderState,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
