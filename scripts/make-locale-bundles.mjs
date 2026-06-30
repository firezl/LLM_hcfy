/**
 * Builds scripts/locale-data/{en,ja,ko,fr,de,es,ru,pt}.json from zh-CN base.
 * Run: node scripts/make-locale-bundles.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve("scripts/locale-data");
mkdirSync(OUT_DIR, { recursive: true });

const src = readFileSync(resolve("scripts/generate-locales.mjs"), "utf8");
const zhBlock = src.match(/const zhCN = \{([\s\S]*?)\n\};/)[1];
/** @type {Record<string, string>} */
const zhCN = Object.fromEntries(
  [...zhBlock.matchAll(/"([^"]+)":\s*"((?:\\.|[^"\\])*)"/g)].map((m) => [
    m[1],
    m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
  ]),
);

function unescapeJson(s) {
  return s.replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

/** @type {Record<string, Record<string, string>>} */
const LOCALE_OVERRIDES = {
  en: {
    "common.yes": "Yes",
    "common.no": "No",
    "common.on": "On",
    "common.off": "Off",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.copy": "Copy",
    "common.close": "Close",
    "common.delete": "Delete",
    "common.add": "Add",
    "common.import": "Import",
    "common.export": "Export",
    "common.clear": "Clear",
    "common.refresh": "Refresh",
    "common.reset": "Reset to defaults",
    "common.skip": "Skip",
    "common.next": "Next",
    "common.back": "Back",
    "common.loading": "Loading...",
    "common.testing": "Testing...",
    "common.testConnection": "Test connection",
    "common.connectionSuccess": "Connection successful",
    "common.connectionFailed": "Connection failed",
    "common.connectionTimeout": "Connection test timed out (15s)",
    "common.unknownError": "Unknown error",
    "common.saved": "Settings saved",
    "common.copySuccess": "Copied",
    "common.copyFailed": "Copy failed",
    "common.noTranslation": "No translation",
    "common.enabled": "Enabled",
    "common.disabled": "Disabled",
    "common.auto": "Auto",
    "common.custom": "Custom",
    "common.confirm": "Confirm",
    "common.edit": "Edit",
    "common.remove": "Remove",
    "common.search": "Search",
    "common.all": "All",
    "common.favorite": "Favorite",
    "common.unfavorite": "Unfavorite",
    "common.startUsing": "Get started",
    "common.selectPreset": "Select a plan above",
    "common.saveAndFinish": "Save and finish",
    "common.openSettings": "Open settings",
    "uiLang.label": "UI language",
    "uiLang.auto": "Follow browser",
    "contextMenu.translateSelection": 'Translate "{selection}"',
    "options.page.title": "LLM Selection Translate - Settings",
    "options.page.heading": "LLM Selection Translate Settings",
    "options.page.helpLink": "Quick start",
    "options.page.saveAll": "Save all settings",
    "options.page.resetDefaults": "Reset to defaults",
    "options.page.openLocalPdf": "Open local PDF",
    "options.tab.general": "General",
    "options.tab.engine": "Engines",
    "options.tab.glossary": "Glossary",
    "options.tab.history": "History",
    "options.tab.sync": "Sync & data",
    "prompt.glossaryConstraint":
      "Terminology constraints (if matched in source, prefer these translations):",
    "prompt.glossaryLine": "{source} -> {target}",
    "prompt.default.system.simple":
      "Translate the following into {targetLang}. Output only the translation.",
    "prompt.default.system.lightweight":
      "Translate the [selected text] into {targetLang}. Use surrounding context only for disambiguation; do not translate context. Output only the translation.",
    "prompt.default.system.enhanced":
      "You are the translation engine of a browser selection-translate extension.\nTranslate the user's selected text into natural, concise {targetLang} using page context.\nRequirements:\n1. Translate only the selected text.\n2. Use before/after text and the current paragraph only for disambiguation.\n3. Do not explain.\n4. Do not translate the whole paragraph.\n5. Preserve code, variable names, formulas, and URLs.",
    "prompt.default.user.lightweight":
      "Before: {before}\nSelected: {selected}\nAfter: {after}",
    "prompt.default.user.enhanced":
      "Page title: {pageTitle}\nPage domain: {pageDomain}\nBefore: {before}\nSelected: {selected}\nAfter: {after}\nCurrent paragraph: {block}\n\n{targetLang} translation:",
    "prompt.legacy.fallback":
      "Translate the following into {targetLang} without extra output.\nInput:\n{text}",
    "prompt.custom.variablesHint":
      "Available variables: {targetLang} {text} {glossary} {glossaryConstraint} {context} {before} {after} {block} {pageTitle} {pageDomain} {pageLang}",
  },
};

// Fill remaining EN keys via pattern-based translation from zhCN
function buildEn() {
  const en = { ...LOCALE_OVERRIDES.en };
  const rules = [
    [/是否启用划词翻译/, "Enable selection translate"],
    [/关闭（使用快捷键）/, "Off (use shortcut)"],
    [/翻译快捷键/, "Translate shortcut"],
    [/例如: Alt\+T \/ Ctrl\+Shift\+Y/, "e.g. Alt+T / Ctrl+Shift+Y"],
    [/点击输入框后直接按键录制快捷键；留空表示不启用快捷键。/, "Click the field and press keys to record; leave empty to disable."],
    [/首选翻译引擎/, "Preferred engine"],
    [/自动（优先 OpenAI API）/, "Auto (prefer OpenAI API)"],
    [/大模型翻译/, "LLM translate"],
    [/谷歌翻译/, "Google Translate"],
    [/Bing翻译/, "Bing Translate"],
    [/DeepL 翻译/, "DeepL Translate"],
    [/DeepLX 翻译/, "DeepLX Translate"],
    [/浏览器 AI（实验，仅划词）/, "Browser AI (experimental, selection only)"],
    [/源语言/, "Source language"],
    [/目标语言/, "Target language"],
    [/自动检测/, "Auto detect"],
    [/自动选择/, "Auto select"],
    [/中文/, "Chinese"],
    [/英文/, "English"],
    [/日文/, "Japanese"],
    [/韩文/, "Korean"],
    [/法文/, "French"],
    [/德文/, "German"],
    [/西班牙文/, "Spanish"],
    [/俄文/, "Russian"],
    [/智能上下文翻译（仅大模型）/, "Smart context translate (LLM only)"],
    [/轻量（前后文消歧）/, "Lightweight (context disambiguation)"],
    [/增强（全上下文）/, "Enhanced (full context)"],
    [/仅对大模型引擎生效。关闭则回退纯划选翻译。/, "LLM engines only. When off, falls back to plain selection translate."],
    [/主题模式/, "Theme"],
    [/自动（跟随系统）/, "Auto (follow system)"],
    [/明亮/, "Light"],
    [/黑暗/, "Dark"],
    [/自定义字体/, "Custom font"],
    [/最大宽度占比 \(5-95%\)/, "Max width (5–95%)"],
    [/最大高度占比 \(5-95%\)/, "Max height (5–95%)"],
    [/基础设置/, "Basic"],
    [/外观设置/, "Appearance"],
    [/界面语言/, "UI language"],
    [/大模型提供方/, "LLM provider"],
    [/先在“通用”里选择“大模型翻译”，再在这里选择具体模型来源。/, 'Choose "LLM translate" under General, then pick a provider here.'],
    [/API 地址/, "API URL"],
    [/翻译模型/, "Model"],
    [/自定义模型名/, "Custom model name"],
    [/正在加载模型列表\.\.\./, "Loading models..."],
    [/（已保存）/, "(saved)"],
    [/是否开启思考模式/, "Enable thinking mode"],
    [/思考模型类型/, "Thinking model type"],
    [/自动检测/, "Auto detect"],
    [/OpenAI 推理模型 \(o系列\/gpt-5\)/, "OpenAI reasoning (o-series/gpt-5)"],
    [/DeepSeek 风格 \(DeepSeek\/GLM\/MiMo\/Kimi\)/, "DeepSeek style (DeepSeek/GLM/MiMo/Kimi)"],
    [/Qwen 风格 \(Qwen\/Gemma\)/, "Qwen style (Qwen/Gemma)"],
    [/非思考模型/, "Non-reasoning model"],
    [/自动检测会根据模型名判断；如果检测不准确，请手动选择。/, "Auto detect uses model name; pick manually if wrong."],
    [/推理强度/, "Reasoning effort"],
    [/OpenAI 推理强度/, "OpenAI reasoning effort"],
    [/最大输出 Token（0=自动）/, "Max output tokens (0=auto)"],
    [/最大输出 Token/, "Max output tokens"],
    [/自定义翻译 Prompt/, "Custom translate prompt"],
    [/自定义 Header/, "Custom header"],
    [/添加 Header/, "Add header"],
    [/自定义请求体 JSON/, "Custom request body JSON"],
    [/访问令牌（可选）/, "Access token (optional)"],
    [/Ollama 地址/, "Ollama URL"],
    [/术语管理/, "Glossary"],
    [/原文/, "Source text"],
    [/译文/, "Translation"],
    [/大小写敏感/, "Case sensitive"],
    [/整词匹配/, "Whole word"],
    [/启用术语表/, "Enable glossary"],
    [/翻译历史/, "Translation history"],
    [/搜索原文、译文、标题或网址/, "Search source, translation, title, or URL"],
    [/仅收藏/, "Favorites only"],
    [/清空历史/, "Clear history"],
    [/暂无历史记录。完成一次翻译后会自动保存。/, "No history yet. It is saved after each translation."],
    [/复制译文/, "Copy translation"],
    [/WebDAV 同步/, "WebDAV sync"],
    [/账号/, "Username"],
    [/密码/, "Password"],
    [/目录 \(如 \/jyt-sync\)/, "Directory (e.g. /jyt-sync)"],
    [/保存凭证/, "Save credentials"],
    [/上传到云端/, "Upload to cloud"],
    [/从云端下载/, "Download from cloud"],
    [/双向同步/, "Two-way sync"],
    [/本地配置备份/, "Local config backup"],
    [/导入配置/, "Import config"],
    [/导出配置/, "Export config"],
    [/未授予 WebDAV 访问权限，远端同步可能失败。/, "WebDAV permission not granted; remote sync may fail."],
    [/已检测到当前 PDF：\{fileName\}/, "Detected PDF: {fileName}"],
    [/Firefox 无法让扩展直接读取 file:\/\/，点击后会打开文件选择器，请选择该文件。/, "Firefox cannot read file:// directly; a file picker will open—select the file."],
    [/打开内置 PDF 页面失败，请重试/, "Failed to open built-in PDF viewer; try again"],
    [/欢迎使用 LLM 划词翻译/, "Welcome to LLM Selection Translate"],
    [/首次安装，请选择一个使用方案。我们会自动填入推荐的引擎与模型，你只需补全 API Key（如需要）并保存。/, "Pick a setup plan. We prefill engine and model; add an API key if needed, then save."],
    [/云端高质量/, "Cloud quality"],
    [/OpenAI 兼容模型，适合稳定高质量翻译。/, "OpenAI-compatible models for stable, high-quality translation."],
    [/本地隐私/, "Local privacy"],
    [/Ollama 本地服务，文本不离开本机。/, "Ollama local service; text never leaves your machine."],
    [/免费保底/, "Free fallback"],
    [/OpenRouter 免费路由，适合轻量试用。/, "OpenRouter free routing for light trial use."],
    [/填写 API Key 后即可测试连接并保存。密钥仅保存在本机，不会同步到云端。/, "Enter API key, test connection, then save. Keys stay on this device only."],
    [/建议先测试连接，确认配置无误后再保存。本地 Ollama 方案请确保服务已在运行。/, "Test connection before saving. For Ollama, ensure the service is running."],
    [/配置完成/, "Setup complete"],
    [/去任意网页选中文字，点击翻译按钮即可体验。更多选项可在设置页各标签中调整。/, "Select text on any page and click translate. More options are in settings tabs."],
    [/已配置「\{preset\}」方案/, 'Configured plan "{preset}"'],
    [/✅ 连接成功\{modelSuffix\}/, "✅ Connected{modelSuffix}"],
    [/❌ 连接失败: \{error\}/, "❌ Connection failed: {error}"],
    [/❌ 发生错误: \{error\}/, "❌ Error: {error}"],
    [/设置已保存/, "Settings saved"],
    [/译文已复制/, "Translation copied"],
    [/读取同步配置失败: \{error\}/, "Failed to read sync config: {error}"],
    [/读取本地密钥失败: \{error\}/, "Failed to read local keys: {error}"],
    [/迁移本地密钥失败: \{error\}/, "Failed to migrate local keys: {error}"],
    [/警告：自定义 API 地址使用 HTTP，API Key 将以明文传输。/, "Warning: custom API URL uses HTTP; API key is sent in plaintext."],
    [/请填写 API Key/, "API key is required"],
    [/请填写 API 地址/, "API URL is required"],
    [/请选择或填写模型/, "Select or enter a model"],
    [/Header 名称无效/, "Invalid header name"],
    [/不允许修改此 Header/, "This header cannot be modified"],
    [/JSON 格式无效/, "Invalid JSON"],
    [/配置导入失败: 文件过大，请控制在 5MB 以内/, "Import failed: file too large (max 5MB)"],
    [/未支持的翻译引擎: \{engine\}/, "Unsupported engine: {engine}"],
    [/翻译初始化失败: \{error\}/, "Translate init failed: {error}"],
    [/未支持的测试引擎: \{engine\}/, "Unsupported test engine: {engine}"],
    [/历史记录加载失败: \{error\}/, "Failed to load history: {error}"],
    [/历史记录读取失败/, "Failed to read history"],
    [/历史记录删除失败/, "Failed to delete history entry"],
    [/历史记录清空失败/, "Failed to clear history"],
    [/收藏状态更新失败/, "Failed to update favorite"],
    [/操作失败: \{error\}/, "Operation failed: {error}"],
    [/双向同步失败: \{error\}/, "Two-way sync failed: {error}"],
    [/配置导出失败: \{error\}/, "Config export failed: {error}"],
    [/配置导入失败: \{error\}/, "Config import failed: {error}"],
    [/保存失败: \{error\}/, "Save failed: {error}"],
    [/测试失败: \{error\}/, "Test failed: {error}"],
    [/上传失败: \{error\}/, "Upload failed: {error}"],
    [/下载失败: \{error\}/, "Download failed: {error}"],
    [/术语保存失败/, "Failed to save term"],
    [/后台消息发送失败/, "Background message failed"],
    [/（免费）/, "(free)"],
    [/模型列表加载失败/, "Failed to load model list"],
    [/未检测到可用模型/, "No models found"],
    [/LLM划词翻译 - 快速上手/, "LLM Selection Translate - Quick start"],
    [/快速上手/, "Quick start"],
    [/按设置页里的真实引擎完成配置/, "Configure using real engines from Settings"],
    [/先选哪一个/, "Which to choose"],
    [/想最快试用/, "Fastest trial"],
    [/想要本地隐私/, "Local privacy"],
    [/想要稳定质量/, "Stable quality"],
    [/通用引擎/, "General engines"],
    [/自动/, "Auto"],
    [/大模型引擎逐项配置/, "LLM engines step by step"],
    [/引擎/, "Engine"],
    [/申请入口/, "Sign up"],
    [/默认\/示例模型/, "Default / example model"],
    [/填写要点/, "Notes"],
    [/翻译/, "Translate"],
    [/复制译文/, "Copy translation"],
    [/添加术语/, "Add term"],
    [/固定窗口/, "Pin window"],
    [/思考（展开）/, "Thinking (expand)"],
    [/思考（收起）/, "Thinking (collapse)"],
    [/确认保存/, "Save"],
    [/术语已保存/, "Term saved"],
    [/术语添加失败：请先完成一次有效翻译。/, "Add term failed: complete a valid translation first."],
    [/术语添加失败：原文和译文都不能为空。/, "Add term failed: source and translation cannot be empty."],
    [/术语保存失败: \{error\}/, "Failed to save term: {error}"],
    [/检测到可能是 PDF/, "Possible PDF detected"],
    [/是否使用插件内置查看器打开？/, "Open with the extension viewer?"],
    [/\{seconds\} 秒后将自动使用浏览器打开/, "Opening in browser in {seconds}s"],
    [/用划词翻译插件打开/, "Open with extension"],
    [/保持浏览器打开/, "Keep in browser"],
    [/正在打开插件内置 PDF 查看器\.\.\./, "Opening built-in PDF viewer..."],
    [/打开失败：\{error\}/, "Open failed: {error}"],
    [/连接测试超时 \(15s\)/, "Connection test timed out (15s)"],
    [/术/, "Term"],
    [/同步与数据/, "Sync & data"],
    [/取消编辑/, "Cancel edit"],
    [/取消/, "Cancel"],
    [/例如: gpt-4o-mini/, "e.g. gpt-4o-mini"],
    [/例如: 'Microsoft YaHei', 'Segoe UI'/, "e.g. 'Segoe UI', 'Microsoft YaHei'"],
    [/自定义 OpenAI 兼容/, "Custom OpenAI-compatible"],
    [/硅基流动 SiliconFlow/, "SiliconFlow"],
    [/Ollama 本地服务/, "Ollama local"],
    [/Xiaomi Mimo/, "Xiaomi MiMo"],
    [/xAI Grok/, "xAI Grok"],
    [/NVIDIA NIM/, "NVIDIA NIM"],
    [/openrouter\/free（自动免费模型）/, "openrouter/free (auto free models)"],
  ];
  for (const [key, zh] of Object.entries(zhCN)) {
    if (en[key]) continue;
    let v = zh;
    for (const [re, rep] of rules) v = v.replace(re, rep);
    if (v === zh && /[\u4e00-\u9fff]/.test(v)) {
      // keep technical strings / URLs; rough fallback for remaining Chinese
      v = v
        .replace(/配置/g, "config")
        .replace(/设置/g, "settings")
        .replace(/翻译/g, "translate")
        .replace(/引擎/g, "engine")
        .replace(/模型/g, "model")
        .replace(/插件/g, "extension")
        .replace(/网页/g, "page")
        .replace(/划词/g, "selection")
        .replace(/术语/g, "term")
        .replace(/历史/g, "history")
        .replace(/通用/g, "General")
        .replace(/免费/g, "free")
        .replace(/本地/g, "local")
        .replace(/服务/g, "service")
        .replace(/地址/g, "URL")
        .replace(/填写/g, "Enter")
        .replace(/适合/g, "Good for")
        .replace(/选择/g, "Choose")
        .replace(/需要/g, "requires")
        .replace(/申请/g, "apply for")
        .replace(/官方/g, "official")
        .replace(/实验/g, "experimental")
        .replace(/不支持/g, "not supported")
        .replace(/请改用/g, "use")
        .replace(/以上链接与默认地址可能随服务商更新而变化，请以各平台文档为准。/, "Links and defaults may change; see each provider's docs.");
    }
    en[key] = v;
  }
  return en;
}

// Locale-specific manual overrides for non-English (key subsets + prompts)
const JA_OVERRIDES = {
  "common.yes": "はい", "common.no": "いいえ", "common.save": "保存", "common.cancel": "キャンセル",
  "common.loading": "読み込み中...", "common.testConnection": "接続テスト",
  "options.page.title": "LLM划词翻訳 - 設定", "options.tab.general": "一般",
  "bubble.title": "翻訳", "pdfPrompt.title": "PDFの可能性を検出",
  "prompt.default.system.simple": "{targetLang}に翻訳してください。訳文のみ出力してください。",
  "prompt.glossaryConstraint": "用語制約（原文に一致する場合は次の訳語を優先）:",
};
const KO_OVERRIDES = {
  "common.yes": "예", "common.no": "아니오", "common.save": "저장", "common.cancel": "취소",
  "common.loading": "로딩 중...", "bubble.title": "번역",
  "prompt.default.system.simple": "다음 내용을 {targetLang}로 번역하세요. 번역문만 출력하세요.",
  "prompt.glossaryConstraint": "용어 제약(원문과 일치하면 다음 번역을 우선):",
};
const FR_OVERRIDES = {
  "common.yes": "Oui", "common.no": "Non", "common.save": "Enregistrer", "common.cancel": "Annuler",
  "bubble.title": "Traduire",
  "prompt.default.system.simple": "Traduisez le texte suivant en {targetLang}. Ne produisez que la traduction.",
  "prompt.glossaryConstraint": "Contraintes terminologiques (si correspondance dans la source, préférer ces traductions) :",
};
const DE_OVERRIDES = {
  "common.yes": "Ja", "common.no": "Nein", "common.save": "Speichern", "common.cancel": "Abbrechen",
  "bubble.title": "Übersetzen",
  "prompt.default.system.simple": "Übersetzen Sie den folgenden Text ins {targetLang}. Geben Sie nur die Übersetzung aus.",
  "prompt.glossaryConstraint": "Terminologie-Vorgaben (bei Treffer im Original diese Übersetzungen bevorzugen):",
};
const ES_OVERRIDES = {
  "common.yes": "Sí", "common.no": "No", "common.save": "Guardar", "common.cancel": "Cancelar",
  "bubble.title": "Traducir",
  "prompt.default.system.simple": "Traduce lo siguiente al {targetLang}. Solo muestra la traducción.",
  "prompt.glossaryConstraint": "Restricciones terminológicas (si coinciden en el original, preferir estas traducciones):",
};
const RU_OVERRIDES = {
  "common.yes": "Да", "common.no": "Нет", "common.save": "Сохранить", "common.cancel": "Отмена",
  "bubble.title": "Перевод",
  "prompt.default.system.simple": "Переведите следующее на {targetLang}. Выводите только перевод.",
  "prompt.glossaryConstraint": "Терминологические ограничения (при совпадении в исходнике предпочитайте эти переводы):",
};
const PT_OVERRIDES = {
  "common.yes": "Sim", "common.no": "Não", "common.save": "Salvar", "common.cancel": "Cancelar",
  "bubble.title": "Traduzir",
  "prompt.default.system.simple": "Traduza o seguinte para {targetLang}. Produza apenas a tradução.",
  "prompt.glossaryConstraint": "Restrições terminológicas (se houver correspondência na fonte, prefira estas traduções):",
};

const LANG_RULES = {
  ja: [
    [/Settings/, "設定"], [/Save/, "保存"], [/Cancel/, "キャンセル"], [/Translate/, "翻訳"],
    [/Engine/, "エンジン"], [/General/, "一般"], [/History/, "履歴"], [/Glossary/, "用語集"],
    [/Loading/, "読み込み中"], [/connection/, "接続"], [/API key/, "APIキー"], [/Model/, "モデル"],
  ],
  ko: [
    [/Settings/, "설정"], [/Save/, "저장"], [/Cancel/, "취소"], [/Translate/, "번역"],
    [/Engine/, "엔진"], [/General/, "일반"], [/History/, "기록"], [/Glossary/, "용어집"],
  ],
  fr: [
    [/Settings/, "Paramètres"], [/Save/, "Enregistrer"], [/Cancel/, "Annuler"], [/Translate/, "Traduire"],
    [/Engine/, "Moteur"], [/General/, "Général"], [/History/, "Historique"], [/Glossary/, "Glossaire"],
  ],
  de: [
    [/Settings/, "Einstellungen"], [/Save/, "Speichern"], [/Cancel/, "Abbrechen"], [/Translate/, "Übersetzen"],
    [/Engine/, "Engine"], [/General/, "Allgemein"], [/History/, "Verlauf"], [/Glossary/, "Glossar"],
  ],
  es: [
    [/Settings/, "Ajustes"], [/Save/, "Guardar"], [/Cancel/, "Cancelar"], [/Translate/, "Traducir"],
    [/Engine/, "Motor"], [/General/, "General"], [/History/, "Historial"], [/Glossary/, "Glosario"],
  ],
  ru: [
    [/Settings/, "Настройки"], [/Save/, "Сохранить"], [/Cancel/, "Отмена"], [/Translate/, "Перевод"],
    [/Engine/, "Движок"], [/General/, "Общие"], [/History/, "История"], [/Glossary/, "Глоссарий"],
  ],
  pt: [
    [/Settings/, "Configurações"], [/Save/, "Salvar"], [/Cancel/, "Cancelar"], [/Translate/, "Traduzir"],
    [/Engine/, "Motor"], [/General/, "Geral"], [/History/, "Histórico"], [/Glossary/, "Glossário"],
  ],
};

const OVERRIDE_MAP = {
  ja: JA_OVERRIDES,
  ko: KO_OVERRIDES,
  fr: FR_OVERRIDES,
  de: DE_OVERRIDES,
  es: ES_OVERRIDES,
  ru: RU_OVERRIDES,
  pt: PT_OVERRIDES,
};

function buildFromEn(code) {
  const en = buildEn();
  const overrides = OVERRIDE_MAP[code] || {};
  const rules = LANG_RULES[code] || [];
  const out = {};
  for (const [key, value] of Object.entries(en)) {
    if (overrides[key]) {
      out[key] = overrides[key];
      continue;
    }
    if (key.startsWith("lang.") || key.startsWith("uiLang.option.")) {
      out[key] = value;
      continue;
    }
    let v = value;
    for (const [re, rep] of rules) v = v.replace(re, rep);
    out[key] = v;
  }
  return out;
}

const en = buildEn();
const locales = { en, ja: buildFromEn("ja"), ko: buildFromEn("ko"), fr: buildFromEn("fr"), de: buildFromEn("de"), es: buildFromEn("es"), ru: buildFromEn("ru"), pt: buildFromEn("pt") };

for (const [code, data] of Object.entries(locales)) {
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  const missing = Object.keys(zhCN).filter((k) => !(k in sorted));
  const extra = Object.keys(sorted).filter((k) => !(k in zhCN));
  if (missing.length) console.error(code, "missing", missing.length, missing.slice(0, 5));
  if (extra.length) console.error(code, "extra", extra.length);
  writeFileSync(resolve(OUT_DIR, `${code}.json`), `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`Wrote ${code}.json (${Object.keys(sorted).length} keys)`);
}
