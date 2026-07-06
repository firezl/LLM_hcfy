import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const localeDir = path.join(root, "i18n/locales");
const locales = fs.readdirSync(localeDir).filter((f) => f.endsWith(".json"));

const chineseRe = /[\u4e00-\u9fff]/;

for (const f of locales) {
  const loc = f.replace(".json", "");
  const data = JSON.parse(fs.readFileSync(path.join(localeDir, f), "utf8"));
  const bad = Object.entries(data)
    .filter(([k, v]) => k.startsWith("options.") && chineseRe.test(String(v)))
    .map(([k]) => k);
  if (bad.length) {
    console.log(`\n${loc}: ${bad.length} options.* keys with Chinese`);
    bad.forEach((k) => console.log(`  ${k}: ${data[k].slice(0, 80)}...`));
  } else {
    console.log(`\n${loc}: OK (no Chinese in options.*)`);
  }
}
