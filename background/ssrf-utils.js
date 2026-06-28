// 纯函数 SSRF 风险地址判定，无扩展 API 依赖，便于单元测试。
// 用于收窄来自网页 content script 的 PDF_CHECK_URL 请求，避免后台被利用做 SSRF。

// 将主机名解析为 IPv4 四段数值；非合法 IPv4 返回 null。
export function parseIpv4Octets(host) {
    const parts = String(host || "").split(".");
    if (parts.length !== 4) {
        return null;
    }
    const octets = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) {
            return null;
        }
        const num = Number(part);
        if (num < 0 || num > 255) {
            return null;
        }
        octets.push(num);
    }
    return octets;
}

// 按段判定 IPv4 是否属于本机/内网/link-local 等不应被网页触发探测的范围。
export function isRiskyIpv4(octets) {
    if (!Array.isArray(octets) || octets.length !== 4) {
        return false;
    }
    const [a, b] = octets;
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 127) return true;                       // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local（含云元数据）
    if (a === 0) return true;                         // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    return false;
}

export function isIpv6Loopback(host) {
    const raw = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (raw === "::1") {
        return true;
    }
    // 兼容完整形式，如 0:0:0:0:0:0:0:1
    return /^0:0:0:0:0:0:0:1$/.test(raw);
}

export function isIpv6UniqueLocal(host) {
    const raw = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
    // fc00::/7 覆盖 fc00:: 与 fd00:: 起始地址
    return raw.startsWith("fc") || raw.startsWith("fd");
}

// 判定 http(s) URL 是否指向本机/内网/link-local 等不应被网页触发探测的地址。
// file:// 与公网地址不受此函数限制；非 http(s) 协议返回 false。
// 畸形 URL 视为风险（返回 true），保守拒绝。
export function isSsrfRiskyHttpUrl(url) {
    if (!url || typeof url !== "string") {
        return false;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (err) {
        return true;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
    }

    const hostname = String(parsed.hostname || "").toLowerCase();
    if (!hostname) {
        return true;
    }

    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        return true;
    }

    if (isIpv6Loopback(hostname) || isIpv6UniqueLocal(hostname)) {
        return true;
    }

    const octets = parseIpv4Octets(hostname);
    if (octets === null) {
        // 非点分十进制的主机名（含内网 DNS 名）无法在此层判定，放行由 fetch 自身处理。
        return false;
    }

    return isRiskyIpv4(octets);
}
