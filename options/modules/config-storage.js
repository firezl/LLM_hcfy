(function (global) {
    function normalizeCustomHeaders(value) {
        const input = Array.isArray(value) ? value : [];
        return input
            .map((item) => ({
                enabled: item?.enabled !== false,
                name: String(item?.name || "").trim(),
                value: String(item?.value || "").trim(),
            }))
            .filter((item) => item.name && item.value);
    }

    function buildApiKeyFields(defaultSettings) {
        const source =
            defaultSettings && typeof defaultSettings === "object"
                ? defaultSettings
                : {};
        return Object.keys(source).filter((key) => key.endsWith("_api_key"));
    }

    function buildLocalOnlyFields(defaultSettings) {
        const source =
            defaultSettings && typeof defaultSettings === "object"
                ? defaultSettings
                : {};
        return Object.keys(source).filter(
            (key) => key.endsWith("_api_key") || key.endsWith("_custom_headers"),
        );
    }

    function extractApiKeyPayload(apiKeyFields, input) {
        const fields = Array.isArray(apiKeyFields) ? apiKeyFields : [];
        const source = input && typeof input === "object" ? input : {};
        const payload = {};
        for (const key of fields) {
            if (key.endsWith("_custom_headers")) {
                payload[key] = normalizeCustomHeaders(source[key]);
            } else {
                payload[key] = String(source[key] || "").trim();
            }
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
            if (key.endsWith("_custom_headers")) {
                const localValue = normalizeCustomHeaders(sourceLocal[key]);
                const syncValue = normalizeCustomHeaders(sourceSync[key]);
                if (localValue.length === 0 && syncValue.length > 0) {
                    missing[key] = syncValue;
                }
            } else {
                const localValue = String(sourceLocal[key] || "").trim();
                const syncValue = String(sourceSync[key] || "").trim();
                if (!localValue && syncValue) {
                    missing[key] = syncValue;
                }
            }
        }

        return missing;
    }

    global.JYT_OPTION_STORAGE = {
        buildApiKeyFields,
        buildLocalOnlyFields,
        extractApiKeyPayload,
        stripApiKeyPayload,
        collectMissingLocalApiKeys,
    };
})(typeof globalThis !== "undefined" ? globalThis : window);
