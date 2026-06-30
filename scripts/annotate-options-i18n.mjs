/**
 * Adds data-i18n attributes to options.html static text nodes.
 * Run: node scripts/annotate-options-i18n.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const HTML_PATH = resolve("options.html");

/** @type {Array<[string, string]>} */
const REPLACEMENTS = [
    ['<title>LLM划词翻译 - 设置</title>', '<title data-i18n="options.page.title"></title>'],
    ['<h2>LLM划词翻译 设置</h2>', '<h2 data-i18n="options.page.heading"></h2>'],
    ['>快速上手</a', ' data-i18n="options.page.helpLink"></a'],
    ['data-tab="tab_general">通用</div>', 'data-tab="tab_general" data-i18n="options.tab.general"></div>'],
    ['data-tab="tab_engine">引擎</div>', 'data-tab="tab_engine" data-i18n="options.tab.engine"></div>'],
    ['data-tab="tab_glossary">术语</div>', 'data-tab="tab_glossary" data-i18n="options.tab.glossary"></div>'],
    ['data-tab="tab_history">历史</div>', 'data-tab="tab_history" data-i18n="options.tab.history"></div>'],
    ['data-tab="tab_sync">同步与数据</div>', 'data-tab="tab_sync" data-i18n="options.tab.sync"></div>'],
    ['<div class="jyt-section-title">基础设置</div>', '<div class="jyt-section-title" data-i18n="options.general.section.basic"></div>'],
    ['<label>是否启用划词翻译</label>', '<label data-i18n="options.general.enableSelect.label"></label>'],
    ['<option value="on">开启</option>', '<option value="on" data-i18n="options.general.enableSelect.on"></option>'],
    ['<option value="off">关闭（使用快捷键）</option>', '<option value="off" data-i18n="options.general.enableSelect.off"></option>'],
    ['<label>翻译快捷键</label>', '<label data-i18n="options.general.translateShortcut.label"></label>'],
    ['placeholder="例如: Alt+T / Ctrl+Shift+Y"', 'data-i18n-ph="options.general.translateShortcut.placeholder" placeholder="例如: Alt+T / Ctrl+Shift+Y"'],
    ['点击输入框后直接按键录制快捷键；留空表示不启用快捷键。', 'data-i18n="options.general.translateShortcut.hint"'],
    ['<label>首选翻译引擎</label>', '<label data-i18n="options.general.engineSelect.label"></label>'],
    ['<option value="auto">自动（优先 OpenAI API）</option>', '<option value="auto" data-i18n="options.general.engineSelect.auto"></option>'],
    ['<option value="llm">大模型翻译</option>', '<option value="llm" data-i18n="options.general.engineSelect.llm"></option>'],
    ['<option value="google">谷歌翻译</option>', '<option value="google" data-i18n="options.general.engineSelect.google"></option>'],
    ['<option value="bing">Bing翻译</option>', '<option value="bing" data-i18n="options.general.engineSelect.bing"></option>'],
    ['<option value="deepl">DeepL 翻译</option>', '<option value="deepl" data-i18n="options.general.engineSelect.deepl"></option>'],
    ['<option value="deeplx">DeepLX 翻译</option>', '<option value="deeplx" data-i18n="options.general.engineSelect.deeplx"></option>'],
    ['浏览器 AI（实验，仅划词）', 'data-i18n="options.general.engineSelect.browser"'],
    ['id="browser_engine_hint"', 'id="browser_engine_hint" data-i18n="options.general.browserEngine.hint"'],
    ['<label>源语言</label>', '<label data-i18n="options.general.sourceLang.label"></label>'],
    ['<option value="auto">自动检测</option>', '<option value="auto" data-i18n="options.general.sourceLang.auto"></option>'],
    ['<label>目标语言</label>', '<label data-i18n="options.general.targetLang.label"></label>'],
    ['<option value="auto">自动选择</option>', '<option value="auto" data-i18n="options.general.targetLang.auto"></option>'],
    ['<label>智能上下文翻译（仅大模型）</label>', '<label data-i18n="options.general.contextMode.label"></label>'],
    ['<option value="off">关闭</option>', '<option value="off" data-i18n="options.general.contextMode.off"></option>'],
    ['<option value="lightweight">轻量（前后文消歧）</option>', '<option value="lightweight" data-i18n="options.general.contextMode.lightweight"></option>'],
    ['<option value="enhanced">增强（全上下文）</option>', '<option value="enhanced" data-i18n="options.general.contextMode.enhanced"></option>'],
    ['仅对大模型引擎生效。关闭则回退纯划选翻译。', 'data-i18n="options.general.contextMode.hint"'],
    ['<div class="jyt-section-title">外观设置</div>', '<div class="jyt-section-title" data-i18n="options.general.section.appearance"></div>'],
    ['<label>主题模式</label>', '<label data-i18n="options.general.themeMode.label"></label>'],
    ['<option value="auto">自动（跟随系统）</option>', '<option value="auto" data-i18n="options.general.themeMode.auto"></option>'],
    ['<option value="light">明亮</option>', '<option value="light" data-i18n="options.general.themeMode.light"></option>'],
    ['<option value="dark">黑暗</option>', '<option value="dark" data-i18n="options.general.themeMode.dark"></option>'],
    ['<label>自定义字体</label>', '<label data-i18n="options.general.fontFamily.label"></label>'],
    ['<label>最大宽度占比 (5-95%)</label>', '<label data-i18n="options.general.bubbleWidth.label"></label>'],
    ['<label>最大高度占比 (5-95%)</label>', '<label data-i18n="options.general.bubbleHeight.label"></label>'],
    ['<option value="zh">中文</option>', '<option value="zh" data-i18n="options.general.lang.zh"></option>'],
    ['<option value="en">英文</option>', '<option value="en" data-i18n="options.general.lang.en"></option>'],
    ['<option value="ja">日文</option>', '<option value="ja" data-i18n="options.general.lang.ja"></option>'],
    ['<option value="ko">韩文</option>', '<option value="ko" data-i18n="options.general.lang.ko"></option>'],
    ['<option value="fr">法文</option>', '<option value="fr" data-i18n="options.general.lang.fr"></option>'],
    ['<option value="de">德文</option>', '<option value="de" data-i18n="options.general.lang.de"></option>'],
    ['<option value="es">西班牙文</option>', '<option value="es" data-i18n="options.general.lang.es"></option>'],
    ['<option value="ru">俄文</option>', '<option value="ru" data-i18n="options.general.lang.ru"></option>'],
    ['<button id="save">保存所有设置</button>', '<button id="save" data-i18n="options.actions.saveAll"></button>'],
    ['<button id="reset">恢复默认</button>', '<button id="reset" data-i18n="options.actions.reset"></button>'],
    ['<button id="open_local_pdf" type="button">打开本地 PDF</button>', '<button id="open_local_pdf" type="button" data-i18n="options.pdf.openLocal"></button>'],
    ['<h3 id="onboarding_title">欢迎使用 LLM 划词翻译</h3>', '<h3 id="onboarding_title" data-i18n="options.onboarding.title"></h3>'],
    ['id="onboarding_skip"', 'id="onboarding_skip" data-i18n="common.skip"'],
    ['id="onboarding_back"', 'id="onboarding_back" data-i18n="common.back"'],
];

const UI_LANG_BLOCK = `
                    <label data-i18n="uiLang.label"></label>
                    <select id="ui_lang" data-jyt-setting="ui_lang">
                        <option value="auto" data-i18n="uiLang.auto"></option>
                        <option value="zh-CN" data-i18n="uiLang.option.zh-CN"></option>
                        <option value="zh-TW" data-i18n="uiLang.option.zh-TW"></option>
                        <option value="en" data-i18n="uiLang.option.en"></option>
                        <option value="ja" data-i18n="uiLang.option.ja"></option>
                        <option value="ko" data-i18n="uiLang.option.ko"></option>
                        <option value="fr" data-i18n="uiLang.option.fr"></option>
                        <option value="de" data-i18n="uiLang.option.de"></option>
                        <option value="es" data-i18n="uiLang.option.es"></option>
                        <option value="ru" data-i18n="uiLang.option.ru"></option>
                        <option value="pt" data-i18n="uiLang.option.pt"></option>
                    </select>
`;

async function main() {
    let html = await readFile(HTML_PATH, "utf8");

    if (!html.includes('id="ui_lang"')) {
        html = html.replace(
            '<label data-i18n="options.general.themeMode.label"></label>',
            `${UI_LANG_BLOCK}\n\n                    <label data-i18n="options.general.themeMode.label"></label>`,
        );
        if (!html.includes('id="ui_lang"')) {
            html = html.replace(
                "<label>主题模式</label>",
                `${UI_LANG_BLOCK}\n\n                    <label>主题模式</label>`,
            );
        }
    }

    if (!html.includes("libs/i18n-messages.js")) {
        html = html.replace(
            '<script src="libs/shared-config.js"></script>',
            '<script src="libs/i18n-messages.js"></script>\n        <script src="libs/i18n.js"></script>\n        <script src="libs/shared-config.js"></script>',
        );
    }

    for (const [from, to] of REPLACEMENTS) {
        html = html.split(from).join(to);
    }

    await writeFile(HTML_PATH, html, "utf8");
    console.log("Annotated options.html for i18n");
}

await main();
