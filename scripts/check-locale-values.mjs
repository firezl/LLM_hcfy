import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const localeDir = path.join(root, "i18n/locales");
const locales = fs.readdirSync(localeDir).filter((f) => f.endsWith(".json"));
const data = {};
for (const f of locales) {
  data[f.replace(".json", "")] = JSON.parse(
    fs.readFileSync(path.join(localeDir, f), "utf8"),
  );
}
const en = data.en;
const optionsKeys = Object.keys(en).filter(
  (k) =>
    k.startsWith("options.") || k.startsWith("uiLang.") || k.startsWith("common."),
);
console.log("Total options/common/uiLang keys in en:", optionsKeys.length);
for (const loc of Object.keys(data).sort()) {
  if (loc === "en") continue;
  let missingKey = 0,
    emptyVal = 0,
    sameAsEn = 0;
  const missingList = [];
  const emptyList = [];
  const sameList = [];
  for (const k of optionsKeys) {
    const v = data[loc][k];
    if (v === undefined) {
      missingKey++;
      missingList.push(k);
      continue;
    }
    if (v === "") {
      emptyVal++;
      emptyList.push(k);
      continue;
    }
    if (v === en[k] && /[A-Za-z]{3,}/.test(en[k])) {
      sameAsEn++;
      sameList.push(k);
    }
  }
  const pct = (100 * (optionsKeys.length - sameAsEn) / optionsKeys.length).toFixed(1);
  console.log(
    `\n${loc}: translated=${pct}% missingKey=${missingKey} emptyVal=${emptyVal} sameAsEnglish(untranslated)=${sameAsEn}`,
  );
  if (missingList.length) console.log("  missing:", missingList.join(", "));
  if (emptyList.length) console.log("  empty:", emptyList.join(", "));
}

console.log("\n=== Keys left in English across ALL non-CJK locales (de/es/fr/ja/ko/pt/ru) ===");
const nonCjk = ["de", "es", "fr", "ja", "ko", "pt", "ru"].filter((l) => data[l]);
const sameSets = nonCjk.map(
  (loc) => new Set(optionsKeys.filter((k) => data[loc][k] === en[k])),
);
const commonUntranslated = optionsKeys.filter((k) => sameSets.every((s) => s.has(k)));
console.log(`Total: ${commonUntranslated.length} / ${optionsKeys.length}`);
const byGroup = {};
for (const k of commonUntranslated) {
  const g = k.split(".").slice(0, 2).join(".");
  byGroup[g] = (byGroup[g] || 0) + 1;
}
for (const [g, c] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${g}: ${c}`);
}
