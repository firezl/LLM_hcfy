// 后台 service worker 内的设置缓存：作为 settings/Key 的权威来源，
// 避免从网页 content script 接收可能被篡改的 settings，并免去每次翻译的 Port 传输开销。
import { DEFAULT_SETTINGS, CONFIG_SYNC_KEYS } from "./config-defaults.js";
import { extensionApi } from "./extension-api.js";

// 仅存于 storage.local 的敏感/本地字段（与 content/entry.js 的 API_KEY_FIELDS 对齐）。
const LOCAL_KEY_FIELDS = Object.freeze(
    Object.keys(DEFAULT_SETTINGS).filter(
        (key) => key.endsWith("_api_key") || key.endsWith("_custom_headers"),
    ),
);

let cached = null;
let loadPromise = null;

function mergeSettings(syncItems, localItems) {
    const safeSync = syncItems && typeof syncItems === "object" ? syncItems : {};
    const safeLocal = localItems && typeof localItems === "object" ? localItems : {};
    const merged = { ...DEFAULT_SETTINGS, ...safeSync, ...safeLocal };
    // custom_headers 必须是数组，缺省或类型错误时回退为空数组。
    for (const key of LOCAL_KEY_FIELDS) {
        if (key.endsWith("_custom_headers") && !Array.isArray(merged[key])) {
            merged[key] = [];
        }
    }
    return merged;
}

async function loadSettings() {
    const syncItems = await extensionApi.storage.sync.get(CONFIG_SYNC_KEYS);
    const localItems = await extensionApi.storage.local.get(LOCAL_KEY_FIELDS);
    cached = mergeSettings(syncItems, localItems);
    return cached;
}

// 返回最新缓存设置；首次调用或缓存未就绪时触发加载。
export async function getSettings() {
    if (cached) {
        return cached;
    }
    if (!loadPromise) {
        loadPromise = loadSettings().finally(() => {
            loadPromise = null;
        });
    }
    return loadPromise;
}

// 主动刷新缓存（例如测试连接后用户未保存但需读取最新 local 字段时）。
export async function refreshSettings() {
    return loadSettings();
}

// 在 service worker 启动时调用：预加载并监听存储变更以保持缓存新鲜。
export function initSettingsCache() {
    void loadSettings().catch((err) => {
        console.warn("settings-cache load failed", err);
    });

    extensionApi.storage.onChanged.addListener((changes, area) => {
        if (!cached) {
            return;
        }
        if (area === "sync") {
            for (const key of Object.keys(changes || {})) {
                if (Object.prototype.hasOwnProperty.call(changes[key], "newValue")) {
                    cached[key] = changes[key].newValue;
                } else if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
                    cached[key] = DEFAULT_SETTINGS[key];
                }
            }
        } else if (area === "local") {
            for (const key of Object.keys(changes || {})) {
                if (!LOCAL_KEY_FIELDS.includes(key)) {
                    continue;
                }
                if (Object.prototype.hasOwnProperty.call(changes[key], "newValue")) {
                    const value = changes[key].newValue;
                    cached[key] = key.endsWith("_custom_headers")
                        ? Array.isArray(value)
                            ? value
                            : []
                        : String(value || "");
                } else if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
                    cached[key] = key.endsWith("_custom_headers")
                        ? []
                        : "";
                }
            }
        }
    });
}
