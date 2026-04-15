(function (global) {
    function buildApiKeyFields(defaultSettings) {
        const source =
            defaultSettings && typeof defaultSettings === "object"
                ? defaultSettings
                : {};
        return Object.keys(source).filter((key) => key.endsWith("_api_key"));
    }

    function extractApiKeyPayload(apiKeyFields, input) {
        const fields = Array.isArray(apiKeyFields) ? apiKeyFields : [];
        const source = input && typeof input === "object" ? input : {};
        const payload = {};
        for (const key of fields) {
            payload[key] = String(source[key] || "").trim();
        }
        return payload;
    }

    function stripApiKeyPayload(apiKeyFields, input) {
        const fields = Array.isArray(apiKeyFields) ? apiKeyFields : [];
        const source = input && typeof input === "object" ? input : {};
        const next = { ...source };
        for (const key of fields) {
            delete next[key];
        }
        return next;
    }

    function collectMissingLocalApiKeys(apiKeyFields, syncItems, localItems) {
        const fields = Array.isArray(apiKeyFields) ? apiKeyFields : [];
        const sourceSync =
            syncItems && typeof syncItems === "object" ? syncItems : {};
        const sourceLocal =
            localItems && typeof localItems === "object" ? localItems : {};
        const missing = {};

        for (const key of fields) {
            const localValue = String(sourceLocal[key] || "").trim();
            const syncValue = String(sourceSync[key] || "").trim();
            if (!localValue && syncValue) {
                missing[key] = syncValue;
            }
        }

        return missing;
    }

    global.JYT_OPTION_STORAGE = {
        buildApiKeyFields,
        extractApiKeyPayload,
        stripApiKeyPayload,
        collectMissingLocalApiKeys,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
