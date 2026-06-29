import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    CONTEXT_LIMITS,
    collectSelectionContext,
    normalizeWhitespace,
    resolveContextMode,
    sanitizeTranslateContext,
    truncateText,
} from "../libs/context-collector.mjs";

class MockTextNode {
    constructor(text) {
        this.nodeType = 3;
        this.textContent = text;
        this.parentElement = null;
    }
}

class MockElement {
    constructor(tag, options = {}) {
        this.nodeType = 1;
        this.tagName = tag.toUpperCase();
        this.type = options.type || "";
        this.className = options.className || "";
        this.parentElement = options.parent || null;
        this._children = options.children || [];
        this._innerText = options.innerText;
        this.contentEditable = options.contentEditable;
        for (const child of this._children) {
            child.parentElement = this;
        }
    }

    get textContent() {
        if (this._innerText !== undefined) {
            return this._innerText;
        }
        return this._children
            .map((child) => child.textContent || "")
            .join("");
    }

    get classList() {
        const names = this.className.split(/\s+/).filter(Boolean);
        return {
            contains: (name) => names.includes(name),
        };
    }

    querySelectorAll(selector) {
        if (selector !== 'span[role="presentation"]') {
            return [];
        }
        const out = [];
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 1 && node.getAttribute?.("role") === "presentation") {
                out.push(node);
            }
            for (const child of node._children || []) {
                walk(child);
            }
        };
        walk(this);
        return out;
    }

    getAttribute(name) {
        return this[`_${name}`] || null;
    }

    get innerText() {
        if (this._innerText !== undefined) {
            return this._innerText;
        }
        return this._children
            .map((child) => child.textContent || child.innerText || "")
            .join("");
    }

    closest(selectors) {
        const tags = selectors.split(",").map((item) => item.trim().toLowerCase());
        let node = this;
        while (node) {
            if (node.nodeType !== 1) {
                node = node.parentElement;
                continue;
            }
            if (tags.includes(node.tagName.toLowerCase())) {
                return node;
            }
            if (
                selectors.includes(".textLayer") &&
                node.classList?.contains("textLayer")
            ) {
                return node;
            }
            if (
                selectors.includes("contenteditable") &&
                (node.contentEditable === true ||
                    node.contentEditable === "" ||
                    node.contentEditable === "true")
            ) {
                return node;
            }
            if (
                selectors.includes("input") &&
                node.tagName.toLowerCase() === "input"
            ) {
                return node;
            }
            if (
                selectors.includes("textarea") &&
                node.tagName.toLowerCase() === "textarea"
            ) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }
}

class MockSelection {
    constructor(range, text) {
        this._range = range;
        this._text = text;
    }

    get rangeCount() {
        return this._range ? 1 : 0;
    }

    getRangeAt() {
        return this._range;
    }

    toString() {
        return this._text;
    }
}

function createParagraphSelection(paragraphText, selectedText) {
    const textNode = new MockTextNode(selectedText);
    const paragraph = new MockElement("p", {
        innerText: paragraphText,
        children: [textNode],
    });
    const body = new MockElement("body", { children: [paragraph] });
    paragraph.parentElement = body;
    textNode.parentElement = paragraph;

    const range = {
        startContainer: textNode,
        endContainer: textNode,
        startOffset: 0,
        endOffset: selectedText.length,
    };

    return {
        selection: new MockSelection(range, selectedText),
        doc: {
            title: "Example Page",
            documentElement: { lang: "en-US" },
        },
        win: { location: { hostname: "example.com" } },
    };
}

function createPdfTextLayerSelection(layerText, selectedText) {
    const selectedSpan = new MockElement("span", {
        className: "",
        children: [new MockTextNode(selectedText)],
    });
    selectedSpan._role = "presentation";
    selectedSpan.getAttribute = (name) =>
        name === "role" ? selectedSpan._role : null;

    const beforeSpan = new MockElement("span", {
        children: [new MockTextNode("Before ")],
    });
    beforeSpan._role = "presentation";
    beforeSpan.getAttribute = (name) =>
        name === "role" ? beforeSpan._role : null;

    const afterSpan = new MockElement("span", {
        children: [new MockTextNode(" After")],
    });
    afterSpan._role = "presentation";
    afterSpan.getAttribute = (name) =>
        name === "role" ? afterSpan._role : null;

    const textLayer = new MockElement("div", {
        className: "textLayer",
        innerText: layerText,
        children: [beforeSpan, selectedSpan, afterSpan],
    });
    const body = new MockElement("body", { children: [textLayer] });
    textLayer.parentElement = body;
    selectedSpan.parentElement = textLayer;

    const range = {
        startContainer: selectedSpan._children[0],
        endContainer: selectedSpan._children[0],
        startOffset: 0,
        endOffset: selectedText.length,
    };

    return {
        selection: new MockSelection(range, selectedText),
        doc: {
            title: "paper.pdf",
            documentElement: { lang: "en-US" },
            location: { pathname: "/vendor/pdfjs/web/viewer.html" },
        },
        win: {
            location: {
                hostname: "",
                href: "chrome-extension://id/vendor/pdfjs/web/viewer.html?file=https%3A%2F%2Fexample.com%2Fpaper.pdf",
            },
        },
    };
}

describe("context-collector", () => {
    it("normalizes whitespace", () => {
        assert.equal(normalizeWhitespace("  hello \n world  "), "hello world");
    });

    it("truncates text to max length after normalization", () => {
        const long = "a".repeat(CONTEXT_LIMITS.beforeContext + 50);
        assert.equal(
            truncateText(long, CONTEXT_LIMITS.beforeContext).length,
            CONTEXT_LIMITS.beforeContext,
        );
    });

    it("resolves context mode with legacy migration", () => {
        assert.equal(resolveContextMode({ context_translate_mode: "off" }), "off");
        assert.equal(
            resolveContextMode({ context_translate_mode: "lightweight" }),
            "lightweight",
        );
        assert.equal(
            resolveContextMode({ context_translate_enabled: false }),
            "off",
        );
        assert.equal(resolveContextMode({}), "enhanced");
    });

    it("sanitizes nested context fields by mode", () => {
        const sanitized = sanitizeTranslateContext(
            {
                selectedText: "selected",
                before: "x".repeat(400),
                after: "y".repeat(400),
                block: "z".repeat(2000),
                page: {
                    title: "t".repeat(300),
                    domain: "d".repeat(300),
                    lang: "l".repeat(80),
                },
            },
            "enhanced",
        );

        assert.equal(sanitized.mode, "enhanced");
        assert.equal(sanitized.before.length, CONTEXT_LIMITS.beforeContext);
        assert.equal(sanitized.after.length, CONTEXT_LIMITS.afterContext);
        assert.equal(sanitized.block.length, CONTEXT_LIMITS.blockText);
        assert.equal(sanitized.page.title.length, CONTEXT_LIMITS.pageTitle);
        assert.equal(sanitized.page.domain.length, CONTEXT_LIMITS.pageDomain);
        assert.equal(sanitized.page.lang.length, CONTEXT_LIMITS.pageLang);
    });

    it("drops block and page fields in lightweight sanitize mode", () => {
        const sanitized = sanitizeTranslateContext(
            {
                selectedText: "selected",
                before: "before",
                after: "after",
                block: "block",
                page: { title: "title", domain: "example.com", lang: "en" },
            },
            "lightweight",
        );

        assert.equal(sanitized.mode, "lightweight");
        assert.equal(sanitized.block, "");
        assert.equal(sanitized.page.title, "");
        assert.equal(sanitized.page.domain, "");
        assert.equal(sanitized.page.lang, "");
    });

    it("returns null for empty sanitized context", () => {
        assert.equal(sanitizeTranslateContext(null, "enhanced"), null);
        assert.equal(
            sanitizeTranslateContext(
                {
                    selectedText: "   ",
                    before: "",
                    after: "",
                },
                "enhanced",
            ),
            null,
        );
    });

    it("returns null when mode is off", () => {
        const { selection, doc, win } = createParagraphSelection(
            "Before text. Selected phrase. After text.",
            "Selected phrase",
        );
        assert.equal(collectSelectionContext(selection, "off", doc, win), null);
    });

    it("collects lightweight structured context", () => {
        const paragraphText =
            "Before text. Selected phrase. After text that continues.";
        const { selection, doc, win } = createParagraphSelection(
            paragraphText,
            "Selected phrase",
        );

        const context = collectSelectionContext(
            selection,
            "lightweight",
            doc,
            win,
        );
        assert.ok(context);
        assert.equal(context.mode, "lightweight");
        assert.match(context.before, /Before text/);
        assert.match(context.after, /After text/);
        assert.equal(context.block, "");
        assert.equal(context.page.title, "");
        assert.equal(context.selectedText, "Selected phrase");
    });

    it("collects enhanced structured context", () => {
        const paragraphText =
            "Before text. Selected phrase. After text that continues.";
        const { selection, doc, win } = createParagraphSelection(
            paragraphText,
            "Selected phrase",
        );

        const context = collectSelectionContext(selection, "enhanced", doc, win);
        assert.ok(context);
        assert.equal(context.mode, "enhanced");
        assert.equal(context.block, paragraphText);
        assert.equal(context.page.title, "Example Page");
        assert.equal(context.page.domain, "example.com");
        assert.equal(context.page.lang, "en-US");
    });

    it("collects enhanced structured context from pdf text layer", () => {
        const layerText = "Before Selected phrase After";
        const { selection, doc, win } = createPdfTextLayerSelection(
            layerText,
            "Selected phrase",
        );

        const context = collectSelectionContext(
            selection,
            "enhanced",
            doc,
            win,
        );
        assert.ok(context);
        assert.equal(context.mode, "enhanced");
        assert.equal(context.selectedText, "Selected phrase");
        assert.match(context.before, /Before/);
        assert.match(context.after, /After/);
        assert.match(context.block, /Selected phrase/);
        assert.equal(context.page.title, "paper.pdf");
        assert.equal(context.page.domain, "example.com");
    });

    it("skips collection inside input elements", () => {
        const input = new MockElement("input", { type: "text" });
        const textNode = new MockTextNode("secret");
        input._children = [textNode];
        textNode.parentElement = input;

        const selection = new MockSelection(
            {
                startContainer: textNode,
                endContainer: textNode,
                startOffset: 0,
                endOffset: 6,
            },
            "secret",
        );

        assert.equal(
            collectSelectionContext(
                selection,
                "enhanced",
                { title: "", documentElement: {} },
                {},
            ),
            null,
        );
    });
});
