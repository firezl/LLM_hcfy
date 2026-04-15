import { extensionApi } from "./extension-api.js";

const TERM_DB_NAME = "jyt-terms-db";
const TERM_DB_VERSION = 1;
const TERM_STORE = "terms";
const TERM_MIGRATION_FLAG = "glossary_migrated_v1";
const DEFAULT_MAX_MATCH = 20;

let dbPromise = null;
let termMatcherIndexPromise = null;

function normalizeLang(lang) {
    const value = String(lang || "")
        .trim()
        .toLowerCase();
    if (!value || value === "auto") return "";
    return value.split("-")[0];
}

function normalizeText(value) {
    return String(value || "").trim();
}

function containsTerm(text, sourceTerm) {
    if (!text || !sourceTerm) return false;
    return String(text)
        .toLowerCase()
        .includes(String(sourceTerm).toLowerCase());
}

function termKey(sourceLang, targetLang, sourceTerm) {
    return `${normalizeLang(sourceLang)}::${normalizeLang(targetLang)}::${normalizeText(sourceTerm).toLowerCase()}`;
}

function langPairKey(sourceLang, targetLang) {
    return `${normalizeLang(sourceLang)}::${normalizeLang(targetLang)}`;
}

function normalizeTermEntry(raw, now) {
    const sourceTerm = normalizeText(raw?.sourceTerm);
    const targetTerm = normalizeText(raw?.targetTerm);
    const sourceLang = normalizeLang(raw?.sourceLang);
    const targetLang = normalizeLang(raw?.targetLang);

    if (!sourceTerm || !targetTerm || !sourceLang || !targetLang) {
        return null;
    }

    const ts = Number(now) || Date.now();
    const createdAt = Number(raw?.createdAt) || ts;
    const updatedAt = Number(raw?.updatedAt) || ts;

    return {
        key: termKey(sourceLang, targetLang, sourceTerm),
        sourceTerm,
        targetTerm,
        sourceLang,
        targetLang,
        createdAt,
        updatedAt,
    };
}

function openTermDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(TERM_DB_NAME, TERM_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(TERM_STORE)) {
                const store = db.createObjectStore(TERM_STORE, {
                    keyPath: "key",
                });
                store.createIndex("sourceLang", "sourceLang", {
                    unique: false,
                });
                store.createIndex("targetLang", "targetLang", {
                    unique: false,
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error || new Error("打开术语数据库失败"));
    });

    return dbPromise;
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error || new Error("数据库请求失败"));
    });
}

async function getAllTermsFromDb() {
    const db = await openTermDb();
    const tx = db.transaction(TERM_STORE, "readonly");
    const store = tx.objectStore(TERM_STORE);
    const values = await requestToPromise(store.getAll());
    return Array.isArray(values) ? values : [];
}

function invalidateTermMatcherIndex() {
    termMatcherIndexPromise = null;
}

function buildTermMatcherIndex(terms) {
    const grouped = new Map();
    const sourceLowerByKey = new Map();

    for (const term of terms) {
        const pairKey = langPairKey(term?.sourceLang, term?.targetLang);
        if (!pairKey || pairKey === "::") {
            continue;
        }

        if (!grouped.has(pairKey)) {
            grouped.set(pairKey, []);
        }

        grouped.get(pairKey).push(term);
        sourceLowerByKey.set(
            term.key,
            String(term.sourceTerm || "").toLowerCase(),
        );
    }

    return {
        grouped,
        sourceLowerByKey,
    };
}

async function getTermMatcherIndex() {
    if (termMatcherIndexPromise) {
        return termMatcherIndexPromise;
    }

    termMatcherIndexPromise = getAllTermsFromDb().then((terms) =>
        buildTermMatcherIndex(terms),
    );

    try {
        return await termMatcherIndexPromise;
    } catch (err) {
        termMatcherIndexPromise = null;
        throw err;
    }
}

async function putTermsToDb(terms) {
    const db = await openTermDb();
    const tx = db.transaction(TERM_STORE, "readwrite");
    const store = tx.objectStore(TERM_STORE);

    for (const term of terms) {
        store.put(term);
    }

    await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("术语写入失败"));
        tx.onabort = () => reject(tx.error || new Error("术语写入被中止"));
    });
}

async function deleteTermByKey(key) {
    const db = await openTermDb();
    const tx = db.transaction(TERM_STORE, "readwrite");
    const store = tx.objectStore(TERM_STORE);
    store.delete(key);

    await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("术语删除失败"));
        tx.onabort = () => reject(tx.error || new Error("术语删除被中止"));
    });
}

async function clearTermStore() {
    const db = await openTermDb();
    const tx = db.transaction(TERM_STORE, "readwrite");
    const store = tx.objectStore(TERM_STORE);
    store.clear();

    await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("术语清空失败"));
        tx.onabort = () => reject(tx.error || new Error("术语清空被中止"));
    });
}

function stripInternalKey(term) {
    return {
        sourceTerm: term.sourceTerm,
        targetTerm: term.targetTerm,
        sourceLang: term.sourceLang,
        targetLang: term.targetLang,
        createdAt: term.createdAt,
        updatedAt: term.updatedAt,
    };
}

async function getMigrationFlag() {
    const items = await extensionApi.storage.local.get({
        [TERM_MIGRATION_FLAG]: false,
    });
    return !!items?.[TERM_MIGRATION_FLAG];
}

async function setMigrationFlag() {
    await extensionApi.storage.local.set({ [TERM_MIGRATION_FLAG]: true });
}

export async function ensureTermStoreReady() {
    await openTermDb();

    const migrated = await getMigrationFlag();
    if (migrated) {
        return;
    }

    const items = await extensionApi.storage.sync.get({ glossary_terms: [] });
    const rawTerms = Array.isArray(items?.glossary_terms)
        ? items.glossary_terms
        : [];
    let imported = 0;
    if (rawTerms.length > 0) {
        const now = Date.now();
        const map = new Map();
        for (const item of rawTerms) {
            const normalized = normalizeTermEntry(item, now);
            if (!normalized) continue;
            map.set(normalized.key, normalized);
        }

        const terms = Array.from(map.values());
        if (terms.length > 0) {
            await putTermsToDb(terms);
        }
        imported = terms.length;
    }

    await setMigrationFlag();
    invalidateTermMatcherIndex();
    return imported;
}

export async function upsertTerm(term) {
    await ensureTermStoreReady();

    const now = Date.now();
    const normalized = normalizeTermEntry(term, now);
    if (!normalized) {
        throw new Error("术语字段不完整");
    }

    const existing = await getAllTermsFromDb();
    const previous = existing.find((item) => item.key === normalized.key);
    if (previous) {
        normalized.createdAt = previous.createdAt;
        normalized.updatedAt = now;
    }

    await putTermsToDb([normalized]);
    invalidateTermMatcherIndex();
    return stripInternalKey(normalized);
}

export async function listTerms() {
    await ensureTermStoreReady();
    const terms = await getAllTermsFromDb();
    return terms.map(stripInternalKey);
}

export async function deleteTerm(rawTerm) {
    await ensureTermStoreReady();
    const sourceLang = normalizeLang(rawTerm?.sourceLang);
    const targetLang = normalizeLang(rawTerm?.targetLang);
    const sourceTerm = normalizeText(rawTerm?.sourceTerm);
    if (!sourceLang || !targetLang || !sourceTerm) {
        throw new Error("术语删除参数不完整");
    }

    const key = termKey(sourceLang, targetLang, sourceTerm);

    await deleteTermByKey(key);
    invalidateTermMatcherIndex();
    return { ok: true };
}

export async function clearTerms() {
    await ensureTermStoreReady();
    await clearTermStore();
    invalidateTermMatcherIndex();
    return { ok: true };
}

export async function importTerms(rawTerms) {
    await ensureTermStoreReady();

    const input = Array.isArray(rawTerms) ? rawTerms : [];
    const now = Date.now();
    const incoming = new Map();

    for (const item of input) {
        const normalized = normalizeTermEntry(item, now);
        if (!normalized) continue;
        incoming.set(normalized.key, normalized);
    }

    const current = await getAllTermsFromDb();
    const currentMap = new Map(current.map((item) => [item.key, item]));

    let created = 0;
    let replaced = 0;

    for (const [key, term] of incoming.entries()) {
        if (currentMap.has(key)) {
            replaced += 1;
            term.createdAt = currentMap.get(key).createdAt;
            term.updatedAt = now;
        } else {
            created += 1;
        }
        currentMap.set(key, term);
    }

    const next = Array.from(currentMap.values());
    await putTermsToDb(next);
    invalidateTermMatcherIndex();

    return {
        created,
        replaced,
        total: next.length,
    };
}

export async function exportTerms() {
    const terms = await listTerms();
    return {
        glossary_version: 1,
        glossary_terms: terms,
        exported_at: new Date().toISOString(),
    };
}

export async function getMatchedGlossaryTerms(params) {
    await ensureTermStoreReady();

    const enabled = params?.enabled !== false;
    if (!enabled) {
        return [];
    }

    const from = normalizeLang(params?.from);
    const to = normalizeLang(params?.to);
    const text = normalizeText(params?.text);
    const maxTerms = Number.isFinite(params?.maxTerms)
        ? Math.max(1, Math.floor(params.maxTerms))
        : DEFAULT_MAX_MATCH;

    if (!from || !to || !text) {
        return [];
    }

    const normalizedText = String(text).toLowerCase();
    const pairKey = langPairKey(from, to);
    const matcherIndex = await getTermMatcherIndex();
    const terms = matcherIndex.grouped.get(pairKey) || [];
    const matched = [];

    for (const term of terms) {
        const sourceLower = matcherIndex.sourceLowerByKey.get(term.key);
        if (!sourceLower || !normalizedText.includes(sourceLower)) {
            continue;
        }

        matched.push(stripInternalKey(term));
        if (matched.length >= maxTerms) {
            break;
        }
    }

    return matched;
}

export async function handleTermMessage(message) {
    const type = String(message?.type || "");

    if (type === "TERM_UPSERT") {
        const term = await upsertTerm(message?.term || {});
        return { ok: true, term };
    }

    if (type === "TERM_IMPORT") {
        const summary = await importTerms(message?.terms || []);
        return { ok: true, ...summary };
    }

    if (type === "TERM_EXPORT") {
        const payload = await exportTerms();
        return { ok: true, payload };
    }

    if (type === "TERM_LIST") {
        const terms = await listTerms();
        return { ok: true, terms };
    }

    if (type === "TERM_DELETE") {
        await deleteTerm(message?.term || {});
        return { ok: true };
    }

    if (type === "TERM_CLEAR") {
        await clearTerms();
        return { ok: true };
    }

    return { ok: false, error: "不支持的术语消息类型" };
}
