/**
 * Add missing i18n keys and sync across all locale files.
 * Run: node scripts/patch-locale-keys.mjs && node scripts/build-i18n.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const LOCALES_DIR = resolve("i18n/locales");

/** @type {Record<string, Record<string, string>>} */
const PATCHES = {
    "zh-CN": {
        "options.engine.shared.modelShort": "模型",
        "options.engine.shared.openaiMaxTokens": "OpenAI 最大输出 Token（0=自动）",
        "options.advanced.systemPrompt": "系统提示词",
        "options.advanced.systemPromptPlaceholder":
            "可用变量: {targetLang} {text} {glossary} {glossaryConstraint}",
        "options.advanced.userPrompt": "用户提示词",
        "options.advanced.userPromptPlaceholder":
            "留空则使用默认翻译输入。可用变量: {targetLang} {text} {glossary} {glossaryConstraint}",
        "options.advanced.customPayload": "额外请求体参数（JSON 对象）",
        "options.advanced.customPayloadPlaceholder":
            '例如: {"temperature":0.2,"top_p":0.9}。Qwen 可用 {"parameters":{"temperature":0.2}}，Ollama 可用 {"options":{"temperature":0.2,"top_k":40}}。',
        "options.advanced.customHeaders": "自定义 Header",
        "options.advanced.headerEnabled": "启用",
        "options.advanced.headerNamePlaceholder": "Header 名称",
        "options.advanced.headerValuePlaceholder": "Header 值",
        "options.advanced.headerRemove": "删除",
        "options.advanced.headerAdd": "添加 Header",
        "options.advanced.headerHint":
            "不会同步到云端；Authorization、Content-Type、x-api-key、anthropic-version、Accept 不允许覆盖。",
        "options.advanced.invalidPayloadObject": "额外请求体参数必须是 JSON 对象。",
        "options.advanced.invalidPayloadJson": "额外请求体 JSON 格式不正确: {error}",
        "options.validation.openaiApiKey": "请先填写 OpenAI API Key。",
        "options.validation.genericApiKey": "请先填写 API Key。",
        "options.validation.modelName": "请先填写/选择模型名称。",
        "options.validation.openrouterApiKey": "请先填写 OpenRouter API Key。",
        "options.validation.openrouterModel": "请先选择 OpenRouter 模型。",
        "options.validation.openrouterModelOrCustom":
            "请先选择 OpenRouter 模型或填写自定义模型名。",
        "options.validation.customOpenaiApiKey": "请先填写自定义 OpenAI 兼容 API Key。",
        "options.validation.customOpenaiModel": "请先填写自定义 OpenAI 兼容模型。",
        "options.validation.siliconflowApiKey": "请先填写硅基流动 API Key。",
        "options.validation.siliconflowModelOrCustom":
            "请先选择硅基流动模型或填写自定义模型名。",
        "options.validation.ollamaModel": "请先选择 Ollama 模型或填写自定义模型名。",
        "options.validation.deeplApiKey": "请先填写 DeepL API Key。",
        "options.validation.headersBlocked":
            "已禁用 {count} 个重复或受保护的自定义 Header。",
        "options.validation.httpWarning":
            "检测到 HTTP 接口（{sample}），API Key 将明文传输，建议改用 HTTPS。",
        "options.validation.hostPermissionWarning":
            "未授予部分自定义接口访问权限，若服务端不支持 CORS，翻译可能失败。",
        "options.toast.saved": "已保存",
        "options.toast.resetDone": "已恢复默认",
        "options.toast.saveFailed": "保存失败: {error}",
        "options.toast.restoreFailed": "恢复失败: {error}",
        "options.connection.testing": "⏳ 测试中...",
        "options.connection.success": "✅ 连接成功{modelSuffix}",
        "options.connection.failed": "❌ 连接失败: {error}",
        "options.connection.error": "❌ 发生错误: {error}",
        "options.error.testRequestFailed": "发送测试请求失败",
        "help.engine.deepl.freeLabel": "免费版：",
        "help.engine.deepl.proLabel": "Pro 版：",
        "help.engine.deeplx.defaultLabel": "默认地址：",
        "help.table.note.openrouterLong":
            "最适合快速试用免费模型。插件会加载 OpenRouter 模型列表，并优先显示免费模型。免费路由可能因为额度、地区或模型状态失败。",
        "help.table.note.gemini":
            "API 地址填写 models 基础路径即可，插件会自动拼接 :streamGenerateContent。Gemma 系列不使用思考配置。",
        "help.table.note.claude":
            "Key 必填。最大输出 Token 默认 4096。开启思考时，思考预算必须小于最大输出 Token。",
        "help.table.note.qwen":
            "当前插件已升级至 DashScope compatible-mode 接口。开启思考后可设置 thinking budget，并选择是否保留思考内容。",
        "help.table.note.deepseek":
            "Key 必填。需要推理内容时打开「是否开启思考模式」；插件会发送 thinking enabled/disabled 配置。",
        "help.table.note.glm":
            "Key 必填。默认会清理思考内容，想在弹窗展示思考时打开「是否开启思考模式」并按需要关闭「清理思考」。",
        "help.table.note.xiaomi":
            "Key 必填。该入口走 OpenAI 风格的 chat completions。最大输出 Token 可填 0 让服务端自动决定。",
        "help.table.note.siliconflow":
            "Key 必填。OpenAI 兼容 chat completions；海外可用 api.siliconflow.com。模型名通常带组织前缀，如 Qwen/Qwen3-8B。",
        "help.table.note.nim":
            "Key 必填（nvapi- 前缀）。OpenAI 兼容接口；自托管 NIM 可改 API 地址。部分模型需设置 max_tokens。",
        "help.table.note.grok":
            "Key 必填。该入口是 xAI Grok，不是 Groq。不要把 Groq 的 API 地址填到这里。",
        "help.table.note.ollamaLong":
            "不需要 API Key。先启动 Ollama 并拉取模型，设置页会从 /api/tags 自动检测模型。",
        "help.table.row.customOpenai.engine": "自定义 OpenAI 兼容",
        "help.table.row.customOpenai.signup": "按服务商提供",
        "help.table.row.customOpenai.model": "或服务商模型名",
        "help.table.row.ollama.engine": "Ollama 本地服务",
        "help.table.signup.downloadOllama": "下载 Ollama",
        "help.section.localCommands.title": "本地模型常用命令",
        "help.local.ollamaPull.title": "Ollama 拉取通用模型",
        "help.local.ollamaPull.badge": "推荐",
        "help.local.translategemma.title": "Translationgemma",
        "help.local.translategemma.badge": "专用翻译",
        "help.local.translategemma.desc":
            "如果 Ollama 中的模型名是 translategemma 或 translategemma:*，插件会自动使用专用翻译模板。请在「大模型翻译 → Ollama」中选择该模型。",
        "help.section.localOpenai.title": "本地 OpenAI 兼容服务",
        "help.section.localOpenai.intro":
            "这些工具通常可以通过「大模型翻译 → 自定义 OpenAI 兼容」接入。因为当前设置页会要求 API Key，本地服务没有 Key 时可先填 local 作为占位。",
        "help.table.local.tool": "工具",
        "help.table.local.apiUrl": "常见 API 地址",
        "help.table.local.notes": "备注",
        "help.table.local.lmStudio": "在 LM Studio 中启动 Local Server 后使用。",
        "help.table.local.llamaCpp": "llama.cpp server 默认兼容 OpenAI chat completions。",
        "help.table.local.liteLLM": "LiteLLM 代理多模型时填写其 OpenAI 兼容端点。",
        "help.table.local.oneApi": "One API / New API 网关的 OpenAI 兼容路径。",
        "help.copyFailedManual": "复制失败，请手动选择文本",
        "bubble.translate.timeout": "翻译请求超时，请重试",
        "bubble.translate.disconnected": "翻译连接已断开，请重试",
        "bubble.translate.fallbackBrowser": "OpenAI 不可用，正在回退浏览器 AI...",
        "bubble.translate.bothFailed":
            "翻译失败: OpenAI 与浏览器 AI 均不可用（OpenAI: {openaiError}；浏览器: {browserError}）",
        "bubble.translate.backgroundUnreachable":
            "翻译失败: 无法连接扩展后台（请刷新页面或重载扩展）",
        "browser.translate.unsupported":
            "当前浏览器不支持 Translation API（需 Chrome 138+ 实验功能）",
        "browser.translate.unsupportedPair": "Translation API 不支持语言对: {from} -> {to}",
        "browser.translate.downloading": "正在下载 Translation 模型: {percent}%",
        "langDetect.downloading": "正在下载 LanguageDetector 模型: {percent}%",
        "runtime.messagingUnavailable": "运行时消息接口不可用",
        "runtime.termMessageFailed": "术语消息发送失败",
        "prompt.context.pageTitle": "Page title",
        "prompt.context.before": "Before",
        "prompt.context.after": "After",
        "prompt.context.selectedText": "Selected text",
    },
    en: {
        "options.engine.shared.modelShort": "Model",
        "options.engine.shared.openaiMaxTokens": "OpenAI max output tokens (0 = auto)",
        "options.advanced.systemPrompt": "System prompt",
        "options.advanced.systemPromptPlaceholder":
            "Variables: {targetLang} {text} {glossary} {glossaryConstraint}",
        "options.advanced.userPrompt": "User prompt",
        "options.advanced.userPromptPlaceholder":
            "Leave empty for default input. Variables: {targetLang} {text} {glossary} {glossaryConstraint}",
        "options.advanced.customPayload": "Extra request body (JSON object)",
        "options.advanced.customPayloadPlaceholder":
            'e.g. {"temperature":0.2,"top_p":0.9}. Qwen: {"parameters":{"temperature":0.2}}. Ollama: {"options":{"temperature":0.2,"top_k":40}}.',
        "options.advanced.customHeaders": "Custom headers",
        "options.advanced.headerEnabled": "Enabled",
        "options.advanced.headerNamePlaceholder": "Header name",
        "options.advanced.headerValuePlaceholder": "Header value",
        "options.advanced.headerRemove": "Remove",
        "options.advanced.headerAdd": "Add header",
        "options.advanced.headerHint":
            "Not synced to cloud. Authorization, Content-Type, x-api-key, anthropic-version, and Accept cannot be overridden.",
        "options.advanced.invalidPayloadObject": "Extra request body must be a JSON object.",
        "options.advanced.invalidPayloadJson": "Invalid extra request body JSON: {error}",
        "options.validation.openaiApiKey": "Please enter your OpenAI API Key.",
        "options.validation.genericApiKey": "Please enter your API Key.",
        "options.validation.modelName": "Please enter or select a model name.",
        "options.validation.openrouterApiKey": "Please enter your OpenRouter API Key.",
        "options.validation.openrouterModel": "Please select an OpenRouter model.",
        "options.validation.openrouterModelOrCustom":
            "Please select an OpenRouter model or enter a custom model name.",
        "options.validation.customOpenaiApiKey":
            "Please enter your custom OpenAI-compatible API Key.",
        "options.validation.customOpenaiModel":
            "Please enter your custom OpenAI-compatible model.",
        "options.validation.siliconflowApiKey": "Please enter your SiliconFlow API Key.",
        "options.validation.siliconflowModelOrCustom":
            "Please select a SiliconFlow model or enter a custom model name.",
        "options.validation.ollamaModel":
            "Please select an Ollama model or enter a custom model name.",
        "options.validation.deeplApiKey": "Please enter your DeepL API Key.",
        "options.validation.headersBlocked":
            "Disabled {count} duplicate or protected custom header(s).",
        "options.validation.httpWarning":
            "HTTP endpoint detected ({sample}). API Key will be sent in plaintext. Use HTTPS instead.",
        "options.validation.hostPermissionWarning":
            "Optional host permissions were not granted. Translation may fail if the server does not support CORS.",
        "options.toast.saved": "Saved",
        "options.toast.resetDone": "Defaults restored",
        "options.toast.saveFailed": "Save failed: {error}",
        "options.toast.restoreFailed": "Restore failed: {error}",
        "options.connection.testing": "⏳ Testing...",
        "options.connection.success": "✅ Connected{modelSuffix}",
        "options.connection.failed": "❌ Connection failed: {error}",
        "options.connection.error": "❌ Error: {error}",
        "options.error.testRequestFailed": "Failed to send test request",
        "help.engine.deepl.freeLabel": "Free:",
        "help.engine.deepl.proLabel": "Pro:",
        "help.engine.deeplx.defaultLabel": "Default URL:",
        "help.table.note.openrouterLong":
            "Best for quickly trying free models. The extension loads OpenRouter models and prioritizes free ones. Free routing may fail due to quota, region, or model status.",
        "help.table.note.gemini":
            "Enter the models base path; the extension appends :streamGenerateContent. Gemma models do not use thinking settings.",
        "help.table.note.claude":
            "API Key required. Default max output tokens is 4096. When thinking is enabled, thinking budget must be less than max output tokens.",
        "help.table.note.qwen":
            "Uses DashScope compatible-mode. When thinking is enabled, set thinking budget and choose whether to preserve thinking content.",
        "help.table.note.deepseek":
            "API Key required. Enable thinking mode when you need reasoning output; the extension sends thinking enabled/disabled config.",
        "help.table.note.glm":
            "API Key required. Thinking content is cleared by default; enable thinking mode and disable clear-thinking to show it in the bubble.",
        "help.table.note.xiaomi":
            "API Key required. Uses OpenAI-style chat completions. Set max output tokens to 0 for server auto.",
        "help.table.note.siliconflow":
            "API Key required. OpenAI-compatible chat completions; use api.siliconflow.com overseas. Model names often include an org prefix, e.g. Qwen/Qwen3-8B.",
        "help.table.note.nim":
            "API Key required (nvapi- prefix). OpenAI-compatible; change API URL for self-hosted NIM. Some models require max_tokens.",
        "help.table.note.grok":
            "API Key required. This is xAI Grok, not Groq. Do not use Groq API URLs here.",
        "help.table.note.ollamaLong":
            "No API Key needed. Start Ollama and pull models; settings page auto-detects models from /api/tags.",
        "help.table.row.customOpenai.engine": "Custom OpenAI compatible",
        "help.table.row.customOpenai.signup": "Per provider",
        "help.table.row.customOpenai.model": "or provider model name",
        "help.table.row.ollama.engine": "Ollama (local)",
        "help.table.signup.downloadOllama": "Download Ollama",
        "help.section.localCommands.title": "Common local model commands",
        "help.local.ollamaPull.title": "Pull general Ollama models",
        "help.local.ollamaPull.badge": "Recommended",
        "help.local.translategemma.title": "Translationgemma",
        "help.local.translategemma.badge": "Translation-only",
        "help.local.translategemma.desc":
            "If the Ollama model is translategemma or translategemma:*, the extension uses a dedicated translation template. Select it under LLM → Ollama.",
        "help.section.localOpenai.title": "Local OpenAI-compatible services",
        "help.section.localOpenai.intro":
            "These tools can be connected via LLM → Custom OpenAI compatible. Settings require an API Key; use local as a placeholder if the local server has no key.",
        "help.table.local.tool": "Tool",
        "help.table.local.apiUrl": "Typical API URL",
        "help.table.local.notes": "Notes",
        "help.table.local.lmStudio": "Start Local Server in LM Studio first.",
        "help.table.local.llamaCpp": "llama.cpp server is OpenAI chat completions compatible by default.",
        "help.table.local.liteLLM": "Use the OpenAI-compatible endpoint when proxying multiple models with LiteLLM.",
        "help.table.local.oneApi": "OpenAI-compatible path for One API / New API gateways.",
        "help.copyFailedManual": "Copy failed — select the text manually",
        "bubble.translate.timeout": "Translation timed out. Please try again.",
        "bubble.translate.disconnected": "Translation connection lost. Please try again.",
        "bubble.translate.fallbackBrowser": "OpenAI unavailable. Falling back to browser AI...",
        "bubble.translate.bothFailed":
            "Translation failed: both OpenAI and browser AI are unavailable (OpenAI: {openaiError}; browser: {browserError})",
        "bubble.translate.backgroundUnreachable":
            "Translation failed: cannot reach extension background (refresh the page or reload the extension)",
        "browser.translate.unsupported":
            "Translation API is not supported in this browser (Chrome 138+ experimental required)",
        "browser.translate.unsupportedPair":
            "Translation API does not support language pair: {from} -> {to}",
        "browser.translate.downloading": "Downloading Translation model: {percent}%",
        "langDetect.downloading": "Downloading LanguageDetector model: {percent}%",
        "runtime.messagingUnavailable": "Runtime messaging is unavailable",
        "runtime.termMessageFailed": "Failed to send glossary message",
        "prompt.context.pageTitle": "Page title",
        "prompt.context.before": "Before",
        "prompt.context.after": "After",
        "prompt.context.selectedText": "Selected text",
    },
};

async function main() {
    const enPatch = PATCHES.en;
    for (const file of await import("node:fs/promises").then((m) =>
        m.readdir(LOCALES_DIR),
    )) {
        if (!file.endsWith(".json")) continue;
        const code = file.replace(/\.json$/, "");
        const path = resolve(LOCALES_DIR, file);
        const data = JSON.parse(await readFile(path, "utf8"));
        const patch = PATCHES[code] || {};
        for (const [key, value] of Object.entries(enPatch)) {
            if (!(key in data)) {
                data[key] = patch[key] ?? enPatch[key];
            }
        }
        for (const [key, value] of Object.entries(patch)) {
            data[key] = value;
        }
        const sorted = Object.fromEntries(
            Object.keys(data)
                .sort()
                .map((k) => [k, data[k]]),
        );
        await writeFile(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
    }
    console.log("Patched locale files");
}

await main();
