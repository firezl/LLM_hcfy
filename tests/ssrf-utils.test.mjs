import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    isIpv6Loopback,
    isRiskyIpv4,
    isSsrfRiskyHttpUrl,
    parseIpv4Octets,
} from "../background/ssrf-utils.js";

describe("ssrf-utils parseIpv4Octets", () => {
    it("parses valid IPv4 into four octets", () => {
        assert.deepEqual(parseIpv4Octets("192.168.1.1"), [192, 168, 1, 1]);
        assert.deepEqual(parseIpv4Octets("10.0.0.5"), [10, 0, 0, 5]);
    });

    it("rejects non-IPv4 hostnames", () => {
        assert.equal(parseIpv4Octets("example.com"), null);
        assert.equal(parseIpv4Octets("::1"), null);
        assert.equal(parseIpv4Octets("1.2.3"), null);
        assert.equal(parseIpv4Octets("1.2.3.4.5"), null);
        assert.equal(parseIpv4Octets("256.1.1.1"), null);
        assert.equal(parseIpv4Octets("1.2.3.abc"), null);
    });
});

describe("ssrf-utils isRiskyIpv4", () => {
    it("flags private and loopback ranges as risky", () => {
        assert.equal(isRiskyIpv4([10, 0, 0, 5]), true);
        assert.equal(isRiskyIpv4([10, 255, 255, 255]), true);
        assert.equal(isRiskyIpv4([172, 16, 0, 2]), true);
        assert.equal(isRiskyIpv4([172, 31, 255, 255]), true);
        assert.equal(isRiskyIpv4([192, 168, 1, 1]), true);
        assert.equal(isRiskyIpv4([127, 0, 0, 1]), true);
        assert.equal(isRiskyIpv4([127, 255, 255, 254]), true);
        assert.equal(isRiskyIpv4([169, 254, 169, 254]), true);
        assert.equal(isRiskyIpv4([0, 0, 0, 0]), true);
        assert.equal(isRiskyIpv4([0, 1, 2, 3]), true);
        assert.equal(isRiskyIpv4([100, 64, 0, 1]), true);
        assert.equal(isRiskyIpv4([100, 127, 255, 255]), true);
    });

    it("passes public and boundary-out addresses", () => {
        assert.equal(isRiskyIpv4([8, 8, 8, 8]), false);
        assert.equal(isRiskyIpv4([1, 1, 1, 1]), false);
        assert.equal(isRiskyIpv4([172, 15, 0, 1]), false);
        assert.equal(isRiskyIpv4([172, 32, 0, 1]), false);
        assert.equal(isRiskyIpv4([100, 128, 0, 1]), false);
        assert.equal(isRiskyIpv4([11, 0, 0, 1]), false);
        assert.equal(isRiskyIpv4([255, 255, 255, 255]), false);
    });
});

describe("ssrf-utils isIpv6Loopback", () => {
    it("detects ::1 in compressed and bracketed forms", () => {
        assert.equal(isIpv6Loopback("::1"), true);
        assert.equal(isIpv6Loopback("[::1]"), true);
        assert.equal(isIpv6Loopback("0:0:0:0:0:0:0:1"), true);
    });

    it("rejects non-loopback IPv6", () => {
        assert.equal(isIpv6Loopback("2001:4860:4860::8888"), false);
        assert.equal(isIpv6Loopback("fd12:3456::1"), false);
    });
});

describe("ssrf-utils isSsrfRiskyHttpUrl", () => {
    const risky = [
        "http://127.0.0.1:6379/",
        "http://localhost:8000/",
        "http://sub.localhost/",
        "http://169.254.169.254/latest/meta-data/",
        "http://192.168.1.1/admin",
        "http://10.0.0.5/",
        "http://172.16.0.2/",
        "http://172.31.255.255/",
        "http://100.64.0.1/",
        "http://0.0.0.0/",
        "http://0.1.2.3/",
        "http://[::1]/",
        "http://[fd12:3456::1]/",
        "http://[fc00::1]/",
        "https://127.0.0.1/x.pdf",
        "not-a-url",
    ];

    const safe = [
        "https://example.com/foo.pdf",
        "https://api.example.com/a.pdf",
        "https://1.1.1.1/x.pdf",
        "http://8.8.8.8/",
        "http://11.0.0.1/",
        "http://172.32.0.1/",
        "http://172.15.0.1/",
        "http://100.128.0.1/",
        "http://255.255.255.255/",
        "http://[2001:4860:4860::8888]/",
        "file:///D:/test.pdf",
    ];

    for (const url of risky) {
        it(`flags ${url} as risky`, () => {
            assert.equal(isSsrfRiskyHttpUrl(url), true, url);
        });
    }

    for (const url of safe) {
        it(`passes ${url} as safe`, () => {
            assert.equal(isSsrfRiskyHttpUrl(url), false, url);
        });
    }
});
