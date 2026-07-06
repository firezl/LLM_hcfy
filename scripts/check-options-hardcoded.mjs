import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");

function collectChineseStrings(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const results = [];
  const re = /["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g;
  let m;
  while ((m = re.exec(content))) {
    if (m[1].length > 1) results.push(m[1]);
  }
  // Also check HTML text nodes with Chinese (simplified)
  if (filePath.endsWith(".html")) {
    const textRe = />([^<]*[\u4e00-\u9fff][^<]*)</g;
    while ((m = textRe.exec(content))) {
      const t = m[1].trim();
      if (t.length > 2) results.push(t);
    }
  }
  return results;
}

const targets = [
  "options.html",
  "options.js",
  ...fs.readdirSync(path.join(root, "options/modules")).map(
    (f) => `options/modules/${f}`,
  ),
];

console.log("=== HARDCODED CHINESE IN OPTIONS (not via t()) ===\n");
for (const rel of targets) {
  const fp = path.join(root, rel);
  const strings = collectChineseStrings(fp);
  if (strings.length) {
    console.log(`\n## ${rel}`);
    [...new Set(strings)].forEach((s) => console.log(`  - ${s.slice(0, 120)}${s.length > 120 ? "..." : ""}`));
  }
}
