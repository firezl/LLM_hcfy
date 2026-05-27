const HISTORY_DB_NAME = "jyt-history-db";
const HISTORY_DB_VERSION = 1;
const HISTORY_STORE = "items";
const DEFAULT_HISTORY_LIMIT = 1000;

let historyDbPromise = null;

function openHistoryDb() {
    if (historyDbPromise) return historyDbPromise;

    historyDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(HISTORY_STORE)) {
                const store = db.createObjectStore(HISTORY_STORE, {
                    keyPath: "id",
                });
                store.createIndex("createdAt", "createdAt", { unique: false });
                store.createIndex("favorite", "favorite", { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error || new Error("打开翻译历史数据库失败"));
    });

    return historyDbPromise;
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error || new Error("翻译历史数据库请求失败"));
    });
}

function transactionDone(tx, fallbackMessage) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error(fallbackMessage));
        tx.onabort = () => reject(tx.error || new Error(fallbackMessage));
    });
}

function normalizeText(value, maxLength) {
    const text = String(value || "").trim();
    if (!maxLength || text.length <= maxLength) return text;
    return text.slice(0, maxLength);
}

function normalizeHistoryEntry(raw) {
    const sourceText = normalizeText(raw?.sourceText, 20000);
    const translatedText = normalizeText(raw?.translatedText, 20000);
    if (!sourceText || !translatedText) {
        return null;
    }

    const createdAt = Number(raw?.createdAt) || Date.now();
    return {
        id:
            normalizeText(raw?.id, 120) ||
            `${createdAt}-${Math.random().toString(36).slice(2)}`,
        sourceText,
        translatedText,
        sourceLang: normalizeText(raw?.sourceLang, 20),
        targetLang: normalizeText(raw?.targetLang, 20),
        engine: normalizeText(raw?.engine, 40),
        model: normalizeText(raw?.model, 160),
        pageUrl: normalizeText(raw?.pageUrl, 2048),
        pageTitle: normalizeText(raw?.pageTitle, 500),
        createdAt,
        favorite: !!raw?.favorite,
    };
}

async function getAllHistoryItems() {
    const db = await openHistoryDb();
    const tx = db.transaction(HISTORY_STORE, "readonly");
    const store = tx.objectStore(HISTORY_STORE);
    const values = await requestToPromise(store.getAll());
    return Array.isArray(values) ? values : [];
}

async function pruneHistory(limit) {
    const maxItems = Number.isFinite(Number(limit))
        ? Math.max(1, Math.floor(Number(limit)))
        : DEFAULT_HISTORY_LIMIT;
    const items = await getAllHistoryItems();
    if (items.length <= maxItems) return;

    const removable = items
        .filter((item) => !item.favorite)
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
    const removeCount = items.length - maxItems;
    const ids = removable.slice(0, removeCount).map((item) => item.id);
    if (ids.length === 0) return;

    const db = await openHistoryDb();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const store = tx.objectStore(HISTORY_STORE);
    ids.forEach((id) => store.delete(id));
    await transactionDone(tx, "翻译历史清理失败");
}

export async function addHistoryItem(rawItem, options = {}) {
    const entry = normalizeHistoryEntry(rawItem);
    if (!entry) {
        throw new Error("翻译历史字段不完整");
    }

    const db = await openHistoryDb();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    tx.objectStore(HISTORY_STORE).put(entry);
    await transactionDone(tx, "翻译历史写入失败");
    await pruneHistory(options.limit || DEFAULT_HISTORY_LIMIT);
    return entry;
}

export async function listHistoryItems(params = {}) {
    const query = normalizeText(params?.query, 200).toLowerCase();
    const favoriteOnly = !!params?.favoriteOnly;
    const limit = Number.isFinite(Number(params?.limit))
        ? Math.max(1, Math.floor(Number(params.limit)))
        : DEFAULT_HISTORY_LIMIT;

    const items = (await getAllHistoryItems())
        .filter((item) => !favoriteOnly || !!item.favorite)
        .filter((item) => {
            if (!query) return true;
            return [
                item.sourceText,
                item.translatedText,
                item.pageTitle,
                item.pageUrl,
            ]
                .join("\n")
                .toLowerCase()
                .includes(query);
        })
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, limit);

    return items;
}

export async function updateHistoryFavorite(id, favorite) {
    const cleanId = normalizeText(id, 120);
    if (!cleanId) throw new Error("历史记录 ID 不能为空");

    const db = await openHistoryDb();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const store = tx.objectStore(HISTORY_STORE);
    const item = await requestToPromise(store.get(cleanId));
    if (!item) throw new Error("历史记录不存在");
    item.favorite = !!favorite;
    store.put(item);
    await transactionDone(tx, "收藏状态更新失败");
    return item;
}

export async function deleteHistoryItem(id) {
    const cleanId = normalizeText(id, 120);
    if (!cleanId) throw new Error("历史记录 ID 不能为空");

    const db = await openHistoryDb();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    tx.objectStore(HISTORY_STORE).delete(cleanId);
    await transactionDone(tx, "历史记录删除失败");
    return { ok: true };
}

export async function clearHistoryItems(params = {}) {
    const favoriteOnly = !!params?.favoriteOnly;
    const db = await openHistoryDb();

    if (!favoriteOnly) {
        const tx = db.transaction(HISTORY_STORE, "readwrite");
        tx.objectStore(HISTORY_STORE).clear();
        await transactionDone(tx, "历史记录清空失败");
        return { ok: true };
    }

    const items = await getAllHistoryItems();
    const ids = items.filter((item) => !item.favorite).map((item) => item.id);
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const store = tx.objectStore(HISTORY_STORE);
    ids.forEach((id) => store.delete(id));
    await transactionDone(tx, "历史记录清理失败");
    return { ok: true };
}

export async function handleHistoryMessage(message) {
    const type = String(message?.type || "");

    if (type === "HISTORY_ADD") {
        const item = await addHistoryItem(message?.item || {}, {
            limit: message?.limit,
        });
        return { ok: true, item };
    }

    if (type === "HISTORY_LIST") {
        const items = await listHistoryItems(message || {});
        return { ok: true, items };
    }

    if (type === "HISTORY_UPDATE_FAVORITE") {
        const item = await updateHistoryFavorite(
            message?.id,
            message?.favorite,
        );
        return { ok: true, item };
    }

    if (type === "HISTORY_DELETE") {
        await deleteHistoryItem(message?.id);
        return { ok: true };
    }

    if (type === "HISTORY_CLEAR") {
        await clearHistoryItems(message || {});
        return { ok: true };
    }

    return { ok: false, error: "不支持的历史消息类型" };
}
