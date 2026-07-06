/**
 * Adds missing options-page i18n keys and fixes options.* entries that still contain Chinese in non-zh locales.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const LOCALES_DIR = resolve("i18n/locales");
const chineseRe = /[\u4e00-\u9fff]/;

const NEW_EN = {
    "options.general.browserEngine.hintFirefox":
        "Firefox does not support the browser Translation API. Use LLM translation or another engine instead.",
    "options.glossary.addTerm": "Add term",
    "options.glossary.updateTerm": "Update term",
    "options.glossary.empty": "No terms yet. Add one to get started.",
    "options.glossary.table.langPair": "Language pair",
    "options.glossary.table.source": "Source",
    "options.glossary.table.target": "Target",
    "options.glossary.table.match": "Match",
    "options.glossary.table.actions": "Actions",
    "options.glossary.match.caseSensitive": "Case",
    "options.glossary.match.wholeWordAuto": "Whole word (auto)",
    "options.glossary.match.wholeWord": "Whole word",
    "options.glossary.match.contains": "Contains",
    "options.glossary.exportDone": "Export complete ({count} terms)",
    "options.glossary.importOpenedInNewTab":
        "Import page opened in a new tab (Firefox popup mode)",
    "options.glossary.importDone":
        "Import complete: {created} added, {replaced} replaced, {total} total",
    "options.glossary.saveIncomplete":
        "Save failed: fill in all term fields",
    "options.glossary.saved": "Term saved",
    "options.glossary.clearConfirm":
        "Clear the entire glossary? This cannot be undone.",
    "options.glossary.cleared": "Glossary cleared",
    "options.glossary.loadedForEdit":
        "Term loaded; edit and click Update",
    "options.glossary.deleted": "Term deleted",
    "options.glossary.openImportFailed": "Cannot open import page",
    "options.history.count": "{count} entries",
    "options.history.clearConfirm":
        "Clear all translation history? Favorites will be cleared too.",
    "options.pdf.openLocalFirefox": "Choose local PDF (Firefox)",
    "options.pdf.openCurrentPdf": "Open current PDF with translator",
    "options.pdf.openLocalCompat": "Open local PDF (Firefox compatible)",
    "options.pdf.noPdfDetected":
        "No PDF detected on this tab. Click to open the built-in PDF viewer and pick a file.",
    "options.pdf.noTabInfo":
        "Could not read the active tab. Click to open the built-in PDF viewer and pick a file.",
    "options.pdf.firefoxFilePickerHint":
        "Firefox security policy blocks direct file:// access. A file picker will open—select the current PDF.",
    "options.modelList.timeout.ollama": "Ollama model list request timed out",
    "options.modelList.timeout.openaiCompat":
        "OpenAI-compatible model list request timed out",
    "options.modelList.timeout.openrouter":
        "OpenRouter model list request timed out",
    "options.modelList.timeout.claude": "Claude model list request timed out",
    "options.modelList.timeout.gemini": "Gemini model list request timed out",
    "options.onboarding.openaiApiKeyLabel": "OpenAI API Key",
    "options.onboarding.openrouterApiKeyLabel": "OpenRouter API Key",
    "options.sync.insecureHttpWarning":
        "WebDAV URL uses HTTP; password will be sent in plain text. Use HTTPS instead.",
    "options.sync.webdavSaveFailed": "Failed to save WebDAV config",
    "options.sync.webdavLoadFailed": "Failed to read WebDAV config",
    "options.sync.conflict.title":
        "Both cloud and local data were updated. Choose how to resolve:",
    "options.sync.conflict.configFields": "Conflicting config fields: {count}",
    "options.sync.conflict.localTerms": "Local terms: {count}",
    "options.sync.conflict.remoteTerms": "Remote terms: {count}",
    "options.sync.conflict.optionRemote": "Enter 1 to overwrite local with cloud",
    "options.sync.conflict.optionLocal": "Enter 2 to overwrite cloud with local",
    "options.sync.conflict.optionMerge":
        "Enter 3 to merge and keep newest timestamps",
    "options.sync.cancelled": "Sync cancelled",
    "options.sync.conflictRetriesExceeded":
        "Too many sync conflict retries; try again",
    "options.sync.configExportDone": "Config exported",
    "options.sync.configImportDone": "Config imported",
    "options.sync.localKeysImportFailed": "Failed to import local API keys",
    "options.sync.webdavSavedLocally": "WebDAV credentials saved locally",
    "options.sync.testing": "Testing WebDAV connection...",
    "options.sync.testSuccess":
        "Connected: config({configStatus}) glossary({glossaryStatus})",
    "options.sync.uploading": "Uploading config and glossary to WebDAV...",
    "options.sync.uploadDone": "Upload complete: {count} glossary terms",
    "options.sync.downloading": "Downloading config and glossary from WebDAV...",
    "options.sync.downloadDone": "Download complete: {count} glossary terms",
    "options.sync.bidirectionalRunning": "Running two-way sync...",
    "options.sync.bidirectionalDone":
        "Two-way sync complete: {count} glossary terms",
};

const NEW_ZH_CN = {
    "options.general.browserEngine.hintFirefox":
        "Firefox 不支持浏览器内置 Translation API，请改用「大模型翻译」或其他引擎。",
    "options.glossary.addTerm": "新增术语",
    "options.glossary.updateTerm": "更新术语",
    "options.glossary.empty": "暂无术语，先添加一条吧。",
    "options.glossary.table.langPair": "语言对",
    "options.glossary.table.source": "原文",
    "options.glossary.table.target": "目标",
    "options.glossary.table.match": "匹配",
    "options.glossary.table.actions": "操作",
    "options.glossary.match.caseSensitive": "大小写",
    "options.glossary.match.wholeWordAuto": "整词自动",
    "options.glossary.match.wholeWord": "整词",
    "options.glossary.match.contains": "包含",
    "options.glossary.exportDone": "导出完成，共 {count} 条术语",
    "options.glossary.importOpenedInNewTab":
        "Firefox 弹窗模式下已在新标签页打开导入页面",
    "options.glossary.importDone":
        "导入完成: 新增 {created}，覆盖 {replaced}，总计 {total}",
    "options.glossary.saveIncomplete": "保存失败: 请完整填写术语字段",
    "options.glossary.saved": "术语已保存",
    "options.glossary.clearConfirm": "确定清空术语库吗？该操作不可撤销。",
    "options.glossary.cleared": "术语库已清空",
    "options.glossary.loadedForEdit": "已载入术语，编辑后点击更新",
    "options.glossary.deleted": "术语已删除",
    "options.glossary.openImportFailed": "无法打开导入页面",
    "options.history.count": "共 {count} 条记录",
    "options.history.clearConfirm": "确定清空翻译历史吗？收藏也会被清空。",
    "options.pdf.openLocalFirefox": "选择本地 PDF（Firefox）",
    "options.pdf.openCurrentPdf": "用 LLM 翻译器打开当前 PDF",
    "options.pdf.openLocalCompat": "打开本地 PDF（Firefox 兼容）",
    "options.pdf.noPdfDetected":
        "当前标签页未检测到 PDF 链接。点击后将进入内置 PDF.js 页面并弹出文件选择器。",
    "options.pdf.noTabInfo":
        "未获取到当前标签页信息。点击后将进入内置 PDF.js 页面并弹出文件选择器。",
    "options.pdf.firefoxFilePickerHint":
        "Firefox 安全策略不允许扩展直接读取 file:// 文件。将打开文件选择器，请选择当前 PDF。",
    "options.modelList.timeout.ollama": "请求 Ollama 模型列表超时",
    "options.modelList.timeout.openaiCompat": "请求 OpenAI 兼容模型列表超时",
    "options.modelList.timeout.openrouter": "请求 OpenRouter 模型列表超时",
    "options.modelList.timeout.claude": "请求 Claude 模型列表超时",
    "options.modelList.timeout.gemini": "请求 Gemini 模型列表超时",
    "options.onboarding.openaiApiKeyLabel": "OpenAI API Key",
    "options.onboarding.openrouterApiKeyLabel": "OpenRouter API Key",
    "options.sync.insecureHttpWarning":
        "WebDAV 地址为 HTTP，密码将明文传输，建议改用 HTTPS。",
    "options.sync.webdavSaveFailed": "WebDAV 配置保存失败",
    "options.sync.webdavLoadFailed": "WebDAV 配置读取失败",
    "options.sync.conflict.title": "检测到云端和本地都有更新，请选择处理方式：",
    "options.sync.conflict.configFields": "配置冲突字段: {count}",
    "options.sync.conflict.localTerms": "本地术语: {count} 条",
    "options.sync.conflict.remoteTerms": "云端术语: {count} 条",
    "options.sync.conflict.optionRemote": "输入 1 使用云端覆盖本地",
    "options.sync.conflict.optionLocal": "输入 2 使用本地覆盖云端",
    "options.sync.conflict.optionMerge": "输入 3 合并并保留最新更新时间",
    "options.sync.cancelled": "已取消同步",
    "options.sync.conflictRetriesExceeded": "同步冲突处理次数过多，请重试",
    "options.sync.configExportDone": "配置导出完成",
    "options.sync.configImportDone": "配置导入完成",
    "options.sync.localKeysImportFailed": "导入本地密钥失败",
    "options.sync.webdavSavedLocally": "WebDAV 配置已保存到本地",
    "options.sync.testing": "正在测试 WebDAV 连接...",
    "options.sync.testSuccess":
        "连接成功: config({configStatus}) glossary({glossaryStatus})",
    "options.sync.uploading": "正在上传配置与术语到 WebDAV...",
    "options.sync.uploadDone": "上传完成: 术语 {count} 条",
    "options.sync.downloading": "正在从 WebDAV 下载配置与术语...",
    "options.sync.downloadDone": "下载完成: 术语 {count} 条",
    "options.sync.bidirectionalRunning": "正在执行双向同步...",
    "options.sync.bidirectionalDone": "双向同步完成: 术语 {count} 条",
};

const NON_ZH_LOCALES = ["de", "es", "fr", "ja", "ko", "pt", "ru"];

const files = (await readdir(LOCALES_DIR)).filter((f) => f.endsWith(".json"));
const en = JSON.parse(
    await readFile(resolve(LOCALES_DIR, "en.json"), "utf8"),
);

for (const file of files) {
    const loc = file.replace(".json", "");
    const path = resolve(LOCALES_DIR, file);
    const data = JSON.parse(await readFile(path, "utf8"));

    const patch =
        loc === "zh-CN"
            ? NEW_ZH_CN
            : loc === "zh-TW"
              ? NEW_ZH_CN
              : NEW_EN;

    Object.assign(data, patch);

    if (NON_ZH_LOCALES.includes(loc)) {
        for (const key of Object.keys(data)) {
            if (
                key.startsWith("options.") &&
                chineseRe.test(String(data[key]))
            ) {
                if (en[key] && !chineseRe.test(String(en[key]))) {
                    data[key] = en[key];
                }
            }
        }
    }

    const sorted = Object.fromEntries(
        Object.keys(data)
            .sort()
            .map((k) => [k, data[k]]),
    );
    await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
    console.log(`Patched ${file}`);
}
