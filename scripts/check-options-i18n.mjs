import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const localeDir = path.join(root, "i18n/locales");
const locales = fs.readdirSync(localeDir).filter((f) => f.endsWith(".json"));

const localeData = {};
for (const f of locales) {
  localeData[f.replace(".json", "")] = JSON.parse(
    fs.readFileSync(path.join(localeDir, f), "utf8"),
  );
}

const en = localeData.en;
const enKeys = new Set(Object.keys(en));

const usedKeys = new Set();
const files = [
  "options.html",
  "options.js",
  ...fs.readdirSync(path.join(root, "options/modules")).map(
    (f) => `options/modules/${f}`,
  ),
];

const patterns = [
  /data-i18n(?:-ph)?="([^"]+)"/g,
  /t\(["']([^"']+)["']/g,
];

for (const rel of files) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, "utf8");
  for (const re of patterns) {
    let m;
    while ((m = re.exec(content))) {
      usedKeys.add(m[1]);
    }
  }
}

const optionsKeys = [...usedKeys]
  .filter(
    (k) =>
      k.startsWith("options.") ||
      k.startsWith("common.") ||
      k.startsWith("uiLang."),
  )
  .sort();

console.log("=== USED KEYS MISSING FROM en.json ===");
const missingInEn = optionsKeys.filter((k) => !enKeys.has(k));
console.log(missingInEn.length ? missingInEn.join("\n") : "(none)");

console.log("\n=== uiLang.* KEY MISMATCH ===");
const uiLangUsed = optionsKeys.filter((k) => k.startsWith("uiLang."));
for (const k of uiLangUsed) {
  const alt = k.replace(/^uiLang\./, "options.appearance.uiLang.");
  if (!enKeys.has(k) && enKeys.has(alt)) {
    console.log(`USED ${k} but en has ${alt}`);
  }
}

console.log("\n=== KEYS IN en.json (options.*) NOT USED IN OPTIONS PAGE ===");
const enOptionsKeys = Object.keys(en)
  .filter((k) => k.startsWith("options."))
  .sort();
const unused = enOptionsKeys.filter((k) => !usedKeys.has(k));
console.log(unused.length ? unused.join("\n") : "(none)");

console.log("\n=== MISSING KEYS PER LOCALE (used on options page) ===");
for (const loc of locales.map((f) => f.replace(".json", "")).sort()) {
  const data = localeData[loc];
  const missing = optionsKeys.filter((k) => !data[k]);
  if (missing.length) {
    console.log(`\n${loc} (${missing.length} missing):`);
    console.log(missing.join("\n"));
  } else {
    console.log(`\n${loc}: complete`);
  }
}

console.log("\n=== options.* + uiLang.* IN en BUT MISSING IN OTHER LOCALES ===");
const enOptions = Object.keys(en).filter(
  (k) => k.startsWith("options.") || k.startsWith("uiLang."),
);
for (const loc of locales
  .map((f) => f.replace(".json", ""))
  .filter((l) => l !== "en")
  .sort()) {
  const missing = enOptions.filter((k) => !localeData[loc][k]);
  if (missing.length) {
    console.log(`\n${loc} (${missing.length}):`);
    console.log(missing.join("\n"));
  }
}
