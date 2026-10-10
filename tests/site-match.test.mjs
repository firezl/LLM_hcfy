import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSiteDisabled } from "../libs/site-match.mjs";

describe("isSiteDisabled", () => {
    it("ignores blank lines and comments", () => {
        const rules = "\n# example.com\n\n  # still a comment\n";
        assert.equal(isSiteDisabled("example.com", rules), false);
        assert.equal(isSiteDisabled("example.com", ""), false);
        assert.equal(isSiteDisabled("example.com", null), false);
    });

    it("matches a bare hostname and not its subdomains", () => {
        const rules = "example.com";
        assert.equal(isSiteDisabled("example.com", rules), true);
        assert.equal(isSiteDisabled("EXAMPLE.COM.", rules), true);
        assert.equal(isSiteDisabled("www.example.com", rules), false);
        assert.equal(isSiteDisabled("notexample.com", rules), false);
        assert.equal(isSiteDisabled("example.com.evil.com", rules), false);
    });

    it("treats *.example.com as the apex plus any subdomain", () => {
        const rules = "*.example.com";
        assert.equal(isSiteDisabled("example.com", rules), true);
        assert.equal(isSiteDisabled("www.example.com", rules), true);
        assert.equal(isSiteDisabled("a.b.example.com", rules), true);
        assert.equal(isSiteDisabled("example.com.evil.com", rules), false);
        assert.equal(isSiteDisabled("notexample.com", rules), false);
    });

    it("extracts the hostname from urls and host:port lines", () => {
        const rules = [
            "https://example.com/path?q=1#top",
            "news.example.org:443",
            "*.cdn.example.net/assets",
        ].join("\n");
        assert.equal(isSiteDisabled("example.com", rules), true);
        assert.equal(isSiteDisabled("news.example.org", rules), true);
        assert.equal(isSiteDisabled("cdn.example.net", rules), true);
        assert.equal(isSiteDisabled("img.cdn.example.net", rules), true);
        assert.equal(isSiteDisabled("example.org", rules), false);
    });

    it("skips invalid lines and still applies later rules", () => {
        const rules = ["*", "*.", "javascript:alert(1)", "not a host", "ok.example"].join(
            "\n",
        );
        assert.equal(isSiteDisabled("ok.example", rules), true);
        assert.equal(isSiteDisabled("example.com", rules), false);
    });

    it("matches punycode hostnames pasted as unicode urls", () => {
        const host = new URL("https://例子.测试").hostname;
        assert.equal(isSiteDisabled(host, "https://例子.测试/path"), true);
        assert.equal(isSiteDisabled(host, "例子.测试"), true);
        assert.equal(isSiteDisabled(`www.${host}`, "例子.测试"), false);
    });
});
