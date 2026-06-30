/**
 * Annotate options.html / help.html with data-i18n* from zh-CN locale values.
 * Run: node scripts/apply-dom-i18n.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ZH_CN = JSON.parse(
    await readFile(resolve("i18n/locales/zh-CN.json"), "utf8"),
);

/** @type {Array<{ file: string, prefixes: string[] }>} */
const TARGETS = [
    { file: "options.html", prefixes: ["options.", "uiLang.", "common."] },
    { file: "help.html", prefixes: ["help.", "common."] },
];

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasI18nAttr(openTag) {
    return /\bdata-i18n(?:-[a-z]+)?=/.test(openTag);
}

function annotateFile(html, prefixes) {
    const entries = Object.entries(ZH_CN)
        .filter(([key]) => prefixes.some((p) => key.startsWith(p)))
        .sort((a, b) => b[1].length - a[1].length);

    for (const [key, rawValue] of entries) {
        const value = String(rawValue);
        if (!value.trim()) continue;
        const esc = escapeRegExp(value);

        // Element text content: <tag ...>VALUE</tag> (skip if tag already has data-i18n)
        html = html.replace(
            new RegExp(
                `(<([a-zA-Z][\\w-]*)([^>]*)>)\\s*${esc}\\s*(</\\2>)`,
                "g",
            ),
            (match, open, tag, attrs, close) => {
                if (hasI18nAttr(open)) return match;
                return `<${tag}${attrs} data-i18n="${key}"></${tag}>`;
            },
        );

        // placeholder="VALUE"
        html = html.replace(
            new RegExp(
                `(placeholder="${esc}")(?![^>]*data-i18n-ph)`,
                "g",
            ),
            `data-i18n-ph="${key}" $1`,
        );

        // title="VALUE"
        html = html.replace(
            new RegExp(`(title="${esc}")(?![^>]*data-i18n-title)`, "g"),
            `data-i18n-title="${key}" $1`,
        );
    }

    // Fix broken annotate from older script: text node "data-i18n=..."
    html = html.replace(
        /<div class="jyt-hint">\s*data-i18n="([^"]+)"\s*<\/div>/g,
        '<div class="jyt-hint" data-i18n="$1"></div>',
    );
    html = html.replace(
        /<option([^>]*)>\s*data-i18n="([^"]+)"\s*<\/option>/g,
        '<option$1 data-i18n="$2"></option>',
    );
    // Remove duplicate text when data-i18n already on element
    html = html.replace(
        /(<[^>]+data-i18n="[^"]+"[^>]*>)[\s\S]*?(<\/[^>]+>)/g,
        (match, open, close) => {
            if (/>\s*[^<\s]/.test(match)) {
                return `${open}${close}`;
            }
            return match;
        },
    );

    return html;
}

async function ensureScripts(html, file) {
    if (html.includes("libs/i18n-messages.js")) {
        return html;
    }
    if (file === "options.html") {
        return html.replace(
            '<script src="libs/shared-config.js"></script>',
            '<script src="libs/i18n-messages.js"></script>\n        <script src="libs/i18n.js"></script>\n        <script src="libs/shared-config.js"></script>',
        );
    }
    if (file === "help.html") {
        return html.replace(
            "</body>",
            '        <script src="libs/i18n-messages.js"></script>\n        <script src="libs/i18n.js"></script>\n        <script src="help.js"></script>\n    </body>',
        ).replace(
            /<script src="help\.js"><\/script>\s*<script src="libs\/i18n-messages\.js">/,
            '<script src="libs/i18n-messages.js">',
        );
    }
    return html;
}

async function main() {
    for (const { file, prefixes } of TARGETS) {
        const path = resolve(file);
        let html = await readFile(path, "utf8");
        html = annotateFile(html, prefixes);
        html = await ensureScripts(html, file);
        await writeFile(path, html, "utf8");
        const remaining = (html.match(/[\u4e00-\u9fff]/g) || []).length;
        console.log(`${file}: annotated (${remaining} CJK chars remain)`);
    }
}

await main();
