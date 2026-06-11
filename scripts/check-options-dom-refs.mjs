/**
 * Verifies options.html form fields referenced as els.* in options JS
 * are registered via data-jyt-setting (or created dynamically with dataset).
 * Run: node scripts/check-options-dom-refs.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(".");
const OPTIONS_DIR = resolve(ROOT, "options/modules");

const html = await readFile(resolve(ROOT, "options.html"), "utf8");
const optionFiles = (await readdir(OPTIONS_DIR)).filter((f) => f.endsWith(".js"));
const optionsJs = await Promise.all(
    optionFiles.map((f) => readFile(resolve(OPTIONS_DIR, f), "utf8")),
).then((files) => files.join("\n"));

const elsRefs = new Set([...optionsJs.matchAll(/els\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]));
const annotated = new Set(
    [...html.matchAll(/data-jyt-setting="([^"]+)"/g)].map((m) => m[1]),
);
const formIds = new Set(
    [...html.matchAll(/<(input|select|textarea)\b[^>]*\bid="([^"]+)"/gi)].map(
        (m) => m[2],
    ),
);

const IGNORED_ELS = new Set([
    "openai",
    "customOpenAI",
]);

const missingAnnotation = [...elsRefs]
    .filter((ref) => !IGNORED_ELS.has(ref) && !annotated.has(ref))
    .sort();

const missingInHtml = missingAnnotation.filter((ref) => !formIds.has(ref)).sort();
const inHtmlButNotAnnotated = missingAnnotation.filter((ref) => formIds.has(ref)).sort();

const unannotatedFormIds = [...formIds]
    .filter((id) => !annotated.has(id))
    .sort();

console.log("els.* refs in options JS:", elsRefs.size);
console.log("data-jyt-setting in HTML:", annotated.size);
console.log("form element ids in HTML:", formIds.size);
console.log("");

if (inHtmlButNotAnnotated.length) {
    console.log("MISSING data-jyt-setting (referenced in JS, present in HTML):");
    for (const id of inHtmlButNotAnnotated) {
        console.log(`  - ${id}`);
    }
    console.log("");
}

if (missingInHtml.length) {
    console.log("Referenced in JS but not in static HTML (may be dynamic):");
    for (const id of missingInHtml) {
        console.log(`  - ${id}`);
    }
    console.log("");
}

if (unannotatedFormIds.length) {
    console.log("Form ids in HTML without data-jyt-setting:");
    for (const id of unannotatedFormIds) {
        console.log(`  - ${id}`);
    }
    console.log("");
}

if (inHtmlButNotAnnotated.length) {
    process.exit(1);
}

console.log("All els.* form refs are annotated.");
