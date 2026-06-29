/**
 * Adds data-jyt-setting / data-jyt-engine attributes to options.html.
 * Run: node scripts/annotate-options-html.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(".");
const HTML_PATH = resolve(ROOT, "options.html");

const { DEFAULT_SETTINGS } = await import(
    pathToFileURL(resolve(ROOT, "libs/default-settings.mjs")).href
);

const EXTRA_SETTING_IDS = new Set([
    "enable_select",
    "engine_select",
    "llm_engine_select",
    "translate_shortcut",
    "source_lang",
    "target_lang",
    "theme_mode",
    "font_family",
    "bubble_width_percent",
    "bubble_height_percent",
    "show_thoughts",
    "ollama_model_select",
]);

const SETTING_IDS = new Set([
    ...Object.keys(DEFAULT_SETTINGS),
    ...EXTRA_SETTING_IDS,
]);

const SECTION_ENGINE_IDS = new Map([
    ["openai_section", "openai"],
    ["custom_openai_section", "custom_openai"],
    ["openrouter_section", "openrouter"],
    ["deepseek_section", "deepseek"],
    ["siliconflow_section", "siliconflow"],
    ["qwen_section", "qwen"],
    ["glm_section", "glm"],
    ["xiaomi_section", "xiaomi"],
    ["grok_section", "grok"],
    ["nim_section", "nim"],
    ["claude_section", "claude"],
    ["gemini_section", "gemini"],
    ["ollama_section", "ollama"],
    ["deepl_section", "deepl"],
    ["deeplx_section", "deeplx"],
]);

function upsertAttribute(attrs, name, value) {
    const attr = `${name}="${value}"`;
    if (new RegExp(`\\b${name}=`).test(attrs)) {
        return attrs.replace(new RegExp(`\\b${name}="[^"]*"`), attr);
    }
    return `${attrs.replace(/\s+$/, "")} ${attr}`;
}

function annotateSettingFields(html) {
    return html.replace(
        /<(input|select|textarea)\b([\s\S]*?\bid="([^"]+)"[\s\S]*?)\s*\/?>/gi,
        (match, tag, attrs, id) => {
            if (!SETTING_IDS.has(id)) {
                return match;
            }
            if (/\bdata-jyt-setting=/.test(attrs)) {
                return match;
            }
            const nextAttrs = upsertAttribute(attrs, "data-jyt-setting", id);
            return `<${tag}${nextAttrs}>`;
        },
    );
}

function annotateEngineSections(html) {
    let next = html;

    for (const [sectionId, engineId] of SECTION_ENGINE_IDS.entries()) {
        const marker = `id="${sectionId}"`;
        if (!next.includes(marker) || next.includes(`${marker} data-jyt-engine=`)) {
            continue;
        }

        const sharedAttr =
            sectionId === "openai_section" ? ' data-jyt-shared-openai="true"' : "";
        next = next.replace(
            marker,
            `${marker} data-jyt-engine="${engineId}"${sharedAttr}`,
        );
    }

    const llmMarker = 'id="llm_engine_section"';
    if (
        next.includes(llmMarker) &&
        !next.includes(`${llmMarker} data-jyt-panel=`)
    ) {
        next = next.replace(
            llmMarker,
            `${llmMarker} data-jyt-panel="llm"`,
        );
    }

    return next;
}

const checkOnly = process.argv.includes("--check");

let html = await readFile(HTML_PATH, "utf8");
const before = html;
html = annotateSettingFields(html);
html = annotateEngineSections(html);

if (checkOnly) {
    if (html !== before) {
        console.error(
            "options.html is missing data-jyt-* attributes. Run: npm run annotate:options",
        );
        process.exit(1);
    }
    const { spawnSync } = await import("node:child_process");
    const domCheck = spawnSync(
        process.execPath,
        ["scripts/check-options-dom-refs.mjs"],
        { cwd: ROOT, stdio: "inherit" },
    );
    if (domCheck.status !== 0) {
        process.exit(domCheck.status || 1);
    }
    console.log("options.html data-jyt annotations are up to date");
    process.exit(0);
}

if (html !== before) {
    await writeFile(HTML_PATH, html, "utf8");
    console.log("Updated options.html with data-jyt-* attributes");
} else {
    console.log("options.html already annotated");
}
