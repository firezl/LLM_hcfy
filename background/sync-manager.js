import {
    SYNC_CONFIG_FILE,
    SYNC_CONFLICT_POLICY_ASK,
    SYNC_CONFLICT_POLICY_LOCAL_WINS,
    SYNC_CONFLICT_POLICY_MERGE_NEWEST,
    SYNC_CONFLICT_POLICY_REMOTE_WINS,
    SYNC_ERROR_CONFLICT,
    SYNC_GLOSSARY_FILE,
} from "./constants.js";
import { extensionApi } from "./extension-api.js";
import { clearTerms, exportTerms, importTerms, listTerms } from "./term.js";
import {
    getRemoteJsonFile,
    putRemoteJsonFile,
    testWebDavConnection,
} from "./sync-webdav.js";
import {
    CONFIG_SYNC_DEFAULTS as CONFIG_DEFAULTS,
    CONFIG_SYNC_KEYS as CONFIG_KEYS,
} from "./config-defaults.js";

const CONFIG_SCHEMA_VERSION = 1;
const GLOSSARY_SCHEMA_VERSION = 1;

function stableStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (err) {
        return String(value);
    }
}

function clampPercent(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.max(5, Math.min(95, Math.round(n)));
}

function normalizeLang(lang) {
    const value = String(lang || "")
        .trim()
        .toLowerCase();
    if (!value || value === "auto") {
        return "";
    }
    return value.split("-")[0];
}

function normalizeTermText(value) {
    return String(value || "").trim();
}

function termKey(term) {
    return `${normalizeLang(term?.sourceLang)}::${normalizeLang(term?.targetLang)}::${normalizeTermText(term?.sourceTerm).toLowerCase()}`;
}

function normalizeConfigPayload(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const next = {};

    for (const key of CONFIG_KEYS) {
        const fallback = CONFIG_DEFAULTS[key];
        const value = input[key];

        if (
            key === "show_thoughts" ||
            key === "custom_openai_show_thoughts" ||
            key === "deepseek_show_thoughts" ||
            key === "siliconflow_show_thoughts" ||
            key === "qwen_show_thoughts" ||
            key === "qwen_preserve_thinking" ||
            key === "glm_show_thoughts" ||
            key === "glm_clear_thinking" ||
            key === "xiaomi_show_thoughts" ||
            key === "grok_show_thoughts" ||
            key === "nim_show_thoughts" ||
            key === "claude_show_thoughts" ||
            key === "gemini_show_thoughts"
        ) {
            next[key] = typeof value === "boolean" ? value : !!fallback;
            continue;
        }

        if (
            key === "openai_max_completion_tokens" ||
            key === "custom_openai_max_completion_tokens" ||
            key === "qwen_thinking_budget" ||
            key === "xiaomi_max_completion_tokens" ||
            key === "nim_max_tokens" ||
            key === "claude_max_tokens" ||
            key === "claude_thinking_budget" ||
            key === "gemini_thinking_budget"
        ) {
            const numericValue = Number(value);
            next[key] = Number.isFinite(numericValue)
                ? Math.floor(numericValue)
                : fallback;
            continue;
        }

        if (key === "bubble_width_percent") {
            next[key] = clampPercent(
                value,
                CONFIG_DEFAULTS.bubble_width_percent,
            );
            continue;
        }

        if (key === "bubble_height_percent") {
            next[key] = clampPercent(
                value,
                CONFIG_DEFAULTS.bubble_height_percent,
            );
            continue;
        }

        if (key === "config_updated_at") {
            const ts = Number(value);
            next[key] = Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : 0;
            continue;
        }

        if (typeof fallback === "string") {
            next[key] = String(value == null ? fallback : value).trim();
            continue;
        }

        next[key] = value == null ? fallback : value;
    }

    return next;
}

function normalizeTermEntries(rawTerms) {
    const input = Array.isArray(rawTerms) ? rawTerms : [];
    const now = Date.now();
    const map = new Map();

    for (const item of input) {
        const sourceTerm = normalizeTermText(item?.sourceTerm);
        const targetTerm = normalizeTermText(item?.targetTerm);
        const sourceLang = normalizeLang(item?.sourceLang);
        const targetLang = normalizeLang(item?.targetLang);

        if (!sourceTerm || !targetTerm || !sourceLang || !targetLang) {
            continue;
        }

        const normalized = {
            sourceTerm,
            targetTerm,
            sourceLang,
            targetLang,
            caseSensitive: item?.caseSensitive === true,
            wholeWord:
                item?.wholeWord === true || item?.wholeWord === false
                    ? item.wholeWord
                    : "auto",
            createdAt: Number(item?.createdAt) || now,
            updatedAt: Number(item?.updatedAt) || now,
        };
        map.set(termKey(normalized), normalized);
    }

    return Array.from(map.values());
}

async function getLocalConfigPayload() {
    const items = await extensionApi.storage.sync.get(CONFIG_DEFAULTS);
    const normalized = normalizeConfigPayload(items);
    return normalized;
}

function getConfigUpdatedAt(configPayload) {
    const ts = Number(configPayload?.config_updated_at || 0);
    return Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : 0;
}

async function buildLocalConfigFile() {
    const payload = await getLocalConfigPayload();
    return {
        schema: "jyt-config",
        schema_version: CONFIG_SCHEMA_VERSION,
        updated_at: getConfigUpdatedAt(payload),
        exported_at: new Date().toISOString(),
        payload,
    };
}

async function buildLocalGlossaryFile() {
    const raw = await exportTerms();
    const terms = normalizeTermEntries(raw?.glossary_terms || []);
    const updatedAt = terms.reduce(
        (max, item) => Math.max(max, Number(item?.updatedAt) || 0),
        0,
    );

    return {
        schema: "jyt-glossary",
        schema_version: GLOSSARY_SCHEMA_VERSION,
        updated_at: updatedAt,
        exported_at: new Date().toISOString(),
        payload: {
            glossary_version: 1,
            glossary_terms: terms,
        },
    };
}

function normalizeRemoteConfigFile(payload) {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const configPayload = normalizeConfigPayload(payload?.payload || payload);
    const updatedAt =
        Number(payload?.updated_at) || getConfigUpdatedAt(configPayload);
    return {
        schema: "jyt-config",
        schema_version: CONFIG_SCHEMA_VERSION,
        updated_at: updatedAt > 0 ? Math.floor(updatedAt) : 0,
        exported_at: String(payload?.exported_at || ""),
        payload: configPayload,
    };
}

function normalizeRemoteGlossaryFile(payload) {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const glossaryPayload = payload?.payload || payload;
    const terms = normalizeTermEntries(glossaryPayload?.glossary_terms || []);
    const fallbackUpdatedAt = terms.reduce(
        (max, item) => Math.max(max, Number(item?.updatedAt) || 0),
        0,
    );
    const updatedAt = Number(payload?.updated_at) || fallbackUpdatedAt;

    return {
        schema: "jyt-glossary",
        schema_version: GLOSSARY_SCHEMA_VERSION,
        updated_at: updatedAt > 0 ? Math.floor(updatedAt) : 0,
        exported_at: String(payload?.exported_at || ""),
        payload: {
            glossary_version: 1,
            glossary_terms: terms,
        },
    };
}

function detectConfigConflicts(localFile, remoteFile) {
    if (!localFile || !remoteFile) {
        return [];
    }

    const localPayload = localFile.payload || {};
    const remotePayload = remoteFile.payload || {};
    const conflicts = [];
    for (const key of CONFIG_KEYS) {
        if (key === "config_updated_at") {
            continue;
        }
        if (
            stableStringify(localPayload[key]) !==
            stableStringify(remotePayload[key])
        ) {
            conflicts.push(key);
        }
    }
    return conflicts;
}

function detectGlossaryConflicts(localFile, remoteFile) {
    if (!localFile || !remoteFile) {
        return [];
    }

    const localTerms = normalizeTermEntries(localFile?.payload?.glossary_terms);
    const remoteTerms = normalizeTermEntries(
        remoteFile?.payload?.glossary_terms,
    );
    const localMap = new Map(localTerms.map((item) => [termKey(item), item]));
    const conflicts = [];

    for (const term of remoteTerms) {
        const key = termKey(term);
        const localTerm = localMap.get(key);
        if (!localTerm) {
            continue;
        }

        const sameTarget =
            normalizeTermText(localTerm.targetTerm) ===
            normalizeTermText(term.targetTerm);
        const sameMatching =
            localTerm.caseSensitive === term.caseSensitive &&
            localTerm.wholeWord === term.wholeWord;
        const sameUpdatedAt =
            Number(localTerm.updatedAt || 0) === Number(term.updatedAt || 0);

        if (!sameTarget || !sameMatching || !sameUpdatedAt) {
            conflicts.push(key);
        }
    }

    return conflicts;
}

function mergeGlossaryNewest(localFile, remoteFile) {
    const localTerms = normalizeTermEntries(localFile?.payload?.glossary_terms);
    const remoteTerms = normalizeTermEntries(
        remoteFile?.payload?.glossary_terms,
    );
    const map = new Map(localTerms.map((item) => [termKey(item), item]));

    for (const remoteItem of remoteTerms) {
        const key = termKey(remoteItem);
        const localItem = map.get(key);
        if (!localItem) {
            map.set(key, remoteItem);
            continue;
        }

        const localUpdated = Number(localItem.updatedAt || 0);
        const remoteUpdated = Number(remoteItem.updatedAt || 0);
        if (remoteUpdated >= localUpdated) {
            map.set(key, remoteItem);
        }
    }

    const mergedTerms = Array.from(map.values());
    const updatedAt = mergedTerms.reduce(
        (max, item) => Math.max(max, Number(item?.updatedAt) || 0),
        0,
    );

    return {
        schema: "jyt-glossary",
        schema_version: GLOSSARY_SCHEMA_VERSION,
        updated_at: updatedAt,
        exported_at: new Date().toISOString(),
        payload: {
            glossary_version: 1,
            glossary_terms: mergedTerms,
        },
    };
}

function chooseConfigByNewest(localFile, remoteFile) {
    if (!localFile) {
        return remoteFile;
    }
    if (!remoteFile) {
        return localFile;
    }
    return Number(remoteFile.updated_at || 0) >=
        Number(localFile.updated_at || 0)
        ? remoteFile
        : localFile;
}

async function applyConfigFile(localTargetFile) {
    const payload = normalizeConfigPayload(localTargetFile?.payload || {});
    const updatedAt = Number(localTargetFile?.updated_at) || Date.now();
    payload.config_updated_at =
        Number.isFinite(updatedAt) && updatedAt > 0
            ? Math.floor(updatedAt)
            : Date.now();

    await extensionApi.storage.sync.set(payload);
    return payload;
}

async function applyGlossaryFile(localTargetFile) {
    const terms = normalizeTermEntries(
        localTargetFile?.payload?.glossary_terms,
    );
    await clearTerms();
    if (terms.length > 0) {
        await importTerms(terms);
    }
    return terms.length;
}

async function fetchRemoteSnapshot(webdav) {
    const configRes = await getRemoteJsonFile(webdav, SYNC_CONFIG_FILE);
    const glossaryRes = await getRemoteJsonFile(webdav, SYNC_GLOSSARY_FILE);

    return {
        config: configRes.exists
            ? normalizeRemoteConfigFile(configRes.payload)
            : null,
        glossary: glossaryRes.exists
            ? normalizeRemoteGlossaryFile(glossaryRes.payload)
            : null,
        configExists: configRes.exists,
        glossaryExists: glossaryRes.exists,
    };
}

async function uploadSnapshot(webdav, configFile, glossaryFile) {
    await putRemoteJsonFile(webdav, SYNC_CONFIG_FILE, configFile);
    await putRemoteJsonFile(webdav, SYNC_GLOSSARY_FILE, glossaryFile);
}

function normalizeConflictPolicy(value) {
    const policy = String(value || "")
        .trim()
        .toLowerCase();
    if (policy === SYNC_CONFLICT_POLICY_LOCAL_WINS) {
        return SYNC_CONFLICT_POLICY_LOCAL_WINS;
    }
    if (policy === SYNC_CONFLICT_POLICY_REMOTE_WINS) {
        return SYNC_CONFLICT_POLICY_REMOTE_WINS;
    }
    if (policy === SYNC_CONFLICT_POLICY_MERGE_NEWEST) {
        return SYNC_CONFLICT_POLICY_MERGE_NEWEST;
    }
    return SYNC_CONFLICT_POLICY_ASK;
}

export async function handleSyncMessage(message) {
    const type = String(message?.type || "");

    if (type === "CONFIG_EXPORT") {
        const payload = await buildLocalConfigFile();
        return { ok: true, payload };
    }

    if (type === "CONFIG_IMPORT") {
        const incoming = normalizeRemoteConfigFile(
            message?.payload || message?.config,
        );
        if (!incoming) {
            throw new Error("配置导入数据格式不正确");
        }
        const applied = await applyConfigFile(incoming);
        return {
            ok: true,
            payload: {
                appliedKeys: CONFIG_KEYS.length,
                config_updated_at: applied.config_updated_at,
            },
        };
    }

    if (type === "SYNC_TEST") {
        const result = await testWebDavConnection(message?.webdav || {});
        return { ok: true, ...result };
    }

    if (type === "SYNC_UPLOAD") {
        const localConfig = await buildLocalConfigFile();
        const localGlossary = await buildLocalGlossaryFile();
        await uploadSnapshot(message?.webdav || {}, localConfig, localGlossary);
        return {
            ok: true,
            summary: {
                action: "upload",
                configUpdatedAt: localConfig.updated_at,
                glossaryCount: localGlossary.payload.glossary_terms.length,
            },
        };
    }

    if (type === "SYNC_DOWNLOAD") {
        const remote = await fetchRemoteSnapshot(message?.webdav || {});
        if (!remote.config && !remote.glossary) {
            throw new Error("远端未找到配置或术语文件");
        }

        if (remote.config) {
            await applyConfigFile(remote.config);
        }
        if (remote.glossary) {
            await applyGlossaryFile(remote.glossary);
        }

        return {
            ok: true,
            summary: {
                action: "download",
                configApplied: !!remote.config,
                glossaryApplied: !!remote.glossary,
                glossaryCount: remote.glossary
                    ? remote.glossary.payload.glossary_terms.length
                    : 0,
            },
        };
    }

    if (type === "SYNC_BIDIRECTIONAL") {
        const policy = normalizeConflictPolicy(message?.conflictPolicy);
        const [localConfig, localGlossary, remote] = await Promise.all([
            buildLocalConfigFile(),
            buildLocalGlossaryFile(),
            fetchRemoteSnapshot(message?.webdav || {}),
        ]);

        const remoteConfig = remote.config;
        const remoteGlossary = remote.glossary;
        const configConflicts = detectConfigConflicts(
            localConfig,
            remoteConfig,
        );
        const glossaryConflicts = detectGlossaryConflicts(
            localGlossary,
            remoteGlossary,
        );

        const hasConflict =
            configConflicts.length > 0 || glossaryConflicts.length > 0;
        if (policy === SYNC_CONFLICT_POLICY_ASK && hasConflict) {
            return {
                ok: false,
                error: "检测到本地与远端存在冲突，请选择处理策略后重试",
                errorCode: SYNC_ERROR_CONFLICT,
                conflict: {
                    configFields: configConflicts,
                    glossaryConflictCount: glossaryConflicts.length,
                },
            };
        }

        let resolvedConfig = localConfig;
        let resolvedGlossary = localGlossary;

        if (policy === SYNC_CONFLICT_POLICY_REMOTE_WINS) {
            resolvedConfig = remoteConfig || localConfig;
            resolvedGlossary = remoteGlossary || localGlossary;
        } else if (policy === SYNC_CONFLICT_POLICY_LOCAL_WINS) {
            resolvedConfig = localConfig;
            resolvedGlossary = localGlossary;
        } else {
            resolvedConfig = chooseConfigByNewest(localConfig, remoteConfig);
            resolvedGlossary = mergeGlossaryNewest(
                localGlossary,
                remoteGlossary,
            );
        }

        if (resolvedConfig) {
            await applyConfigFile(resolvedConfig);
        }
        if (resolvedGlossary) {
            await applyGlossaryFile(resolvedGlossary);
        }

        await uploadSnapshot(
            message?.webdav || {},
            resolvedConfig || localConfig,
            resolvedGlossary || localGlossary,
        );

        return {
            ok: true,
            summary: {
                action: "bidirectional",
                policy,
                configConflictFields: configConflicts.length,
                glossaryConflictTerms: glossaryConflicts.length,
                glossaryCount: (resolvedGlossary || localGlossary).payload
                    .glossary_terms.length,
            },
        };
    }

    return { ok: false, error: "不支持的同步消息类型" };
}

export async function getConfigImportExportPayload() {
    return buildLocalConfigFile();
}

export async function getGlossaryImportExportPayload() {
    return buildLocalGlossaryFile();
}

export async function getLocalGlossaryCount() {
    const terms = await listTerms();
    return Array.isArray(terms) ? terms.length : 0;
}
