import { SYNC_CONFIG_FILE, SYNC_GLOSSARY_FILE } from "./constants.js";

const DEFAULT_TIMEOUT_MS = 15000;

function normalizeBaseUrl(baseUrl) {
    const value = String(baseUrl || "").trim();
    if (!value) {
        throw new Error("WebDAV 地址不能为空");
    }
    return value.replace(/\/+$/, "");
}

function normalizeRemoteDir(remoteDir) {
    const value = String(remoteDir || "").trim();
    if (!value) {
        return "/jyt-sync";
    }

    const withLeading = value.startsWith("/") ? value : `/${value}`;
    return withLeading.replace(/\/+$/, "") || "/jyt-sync";
}

function encodePathSegment(segment) {
    return encodeURIComponent(segment).replace(/%2F/gi, "/");
}

function encodePath(pathname) {
    const parts = String(pathname || "")
        .split("/")
        .filter(Boolean)
        .map((part) => encodePathSegment(part));
    return `/${parts.join("/")}`;
}

function encodeBasicCredential(username, password) {
    const user = String(username || "");
    const pass = String(password || "");
    const raw = `${user}:${pass}`;
    try {
        const bytes = new TextEncoder().encode(raw);
        let binary = "";
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return btoa(binary);
    } catch (err) {
        return btoa(raw);
    }
}

export function normalizeWebDavConfig(raw) {
    const baseUrl = normalizeBaseUrl(raw?.baseUrl);
    const remoteDir = normalizeRemoteDir(raw?.remoteDir);
    const username = String(raw?.username || "").trim();
    const password = String(raw?.password || "");

    if (!username || !password) {
        throw new Error("WebDAV 用户名或密码不能为空");
    }

    return {
        baseUrl,
        remoteDir,
        username,
        password,
    };
}

export function buildRemoteFileUrl(webdavConfig, fileName) {
    const cfg = normalizeWebDavConfig(webdavConfig);
    const safeFileName = String(fileName || "").trim();
    if (!safeFileName) {
        throw new Error("远端文件名不能为空");
    }

    const fullPath = encodePath(`${cfg.remoteDir}/${safeFileName}`);
    return `${cfg.baseUrl}${fullPath}`;
}

async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        });
    } catch (err) {
        if (err && err.name === "AbortError") {
            throw new Error("WebDAV 请求超时");
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function buildAuthHeaders(cfg) {
    return {
        Authorization: `Basic ${encodeBasicCredential(cfg.username, cfg.password)}`,
    };
}

async function ensureRemoteDirExists(cfg, timeoutMs) {
    const dir = normalizeRemoteDir(cfg.remoteDir);
    const segments = dir.split("/").filter(Boolean);
    if (segments.length === 0) {
        return;
    }

    let current = "";
    for (const segment of segments) {
        current += `/${segment}`;
        const dirUrl = `${cfg.baseUrl}${encodePath(current)}/`;
        const response = await fetchWithTimeout(
            dirUrl,
            {
                method: "MKCOL",
                headers: {
                    ...buildAuthHeaders(cfg),
                },
            },
            Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS,
        );

        if (
            response.ok ||
            response.status === 405 ||
            response.status === 301 ||
            response.status === 302
        ) {
            continue;
        }

        const text = await response.text();
        throw new Error(
            `WebDAV 目录创建失败(${response.status}): ${text || "未知错误"}`,
        );
    }
}

export async function getRemoteJsonFile(webdavConfig, fileName, timeoutMs) {
    const cfg = normalizeWebDavConfig(webdavConfig);
    const url = buildRemoteFileUrl(cfg, fileName);
    const response = await fetchWithTimeout(
        url,
        {
            method: "GET",
            headers: {
                ...buildAuthHeaders(cfg),
                Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
            },
        },
        Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS,
    );

    if (response.status === 404) {
        return {
            ok: true,
            exists: false,
            status: 404,
            payload: null,
        };
    }

    if (!response.ok) {
        const text = await response.text();
        throw new Error(
            `WebDAV 读取失败(${response.status}): ${text || "未知错误"}`,
        );
    }

    const text = await response.text();
    if (!text.trim()) {
        return {
            ok: true,
            exists: true,
            status: response.status,
            payload: null,
        };
    }

    try {
        return {
            ok: true,
            exists: true,
            status: response.status,
            payload: JSON.parse(text),
        };
    } catch (err) {
        throw new Error(
            `WebDAV JSON 解析失败: ${err && err.message ? err.message : String(err)}`,
        );
    }
}

export async function putRemoteJsonFile(
    webdavConfig,
    fileName,
    payload,
    timeoutMs,
) {
    const cfg = normalizeWebDavConfig(webdavConfig);
    const url = buildRemoteFileUrl(cfg, fileName);
    let response = await fetchWithTimeout(
        url,
        {
            method: "PUT",
            headers: {
                ...buildAuthHeaders(cfg),
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify(payload, null, 2),
        },
        Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS,
    );

    if (response.status === 404 || response.status === 409) {
        await ensureRemoteDirExists(cfg, timeoutMs);
        response = await fetchWithTimeout(
            url,
            {
                method: "PUT",
                headers: {
                    ...buildAuthHeaders(cfg),
                    "Content-Type": "application/json; charset=utf-8",
                },
                body: JSON.stringify(payload, null, 2),
            },
            Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS,
        );
    }

    if (!response.ok) {
        const text = await response.text();
        throw new Error(
            `WebDAV 写入失败(${response.status}): ${text || "未知错误"}`,
        );
    }

    return {
        ok: true,
        status: response.status,
    };
}

export async function testWebDavConnection(webdavConfig) {
    const configRes = await getRemoteJsonFile(webdavConfig, SYNC_CONFIG_FILE);
    const glossaryRes = await getRemoteJsonFile(
        webdavConfig,
        SYNC_GLOSSARY_FILE,
    );

    return {
        ok: true,
        configStatus: configRes.status,
        glossaryStatus: glossaryRes.status,
        configExists: configRes.exists,
        glossaryExists: glossaryRes.exists,
    };
}
