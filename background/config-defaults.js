import { DEFAULT_SETTINGS as RAW_DEFAULT_SETTINGS } from "../libs/default-settings.mjs";

export const DEFAULT_SETTINGS = Object.freeze(
    structuredClone(RAW_DEFAULT_SETTINGS),
);

export const CONFIG_SYNC_DEFAULTS = Object.freeze(
    Object.fromEntries(
        Object.entries(DEFAULT_SETTINGS).filter(
            ([key]) =>
                key !== "glossary_terms" &&
                key !== "glossary_version" &&
                !key.endsWith("_api_key"),
        ),
    ),
);

export const CONFIG_SYNC_KEYS = Object.freeze(
    Object.keys(CONFIG_SYNC_DEFAULTS),
);
