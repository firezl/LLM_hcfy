# LLM 划词翻译 (LLM Selection Translator)

一个轻量级、现代化的浏览器划词翻译扩展，支持多种翻译引擎，特别优化了对 OpenAI 及兼容大模型（如 DeepSeek, Moonshot）的流式输出支持，并具备“思考过程”显示功能。

## ✨ 主要功能

-   **划词即译**：在网页上选中文字，右下角浮现翻译按钮，点击即刻翻译。
-   **多引擎支持**：
    -   **OpenAI / 大模型 (推荐)**：支持流式输出 (Streaming)，打字机效果，响应迅速。
    -   **思考模型支持**：支持显示大模型（如 Jan-v1, DeepSeek-R1 等）的思维链 (Chain of Thought) 过程，可折叠查看。
    -   **传统引擎**：集成 Google、Bing、百度翻译 API。
-   **智能识别**：自动检测源语言，中英互译（中文->英文，其他->中文）。
-   **美观 UI**：现代化的卡片式设计，自适应高度，支持夜间模式（跟随系统或网页风格适配）。
-   **高度可配置**：自定义 API 地址、模型名称、字体、快捷键行为等。

## 🚀 安装指南

本扩展目前为开发者预览版，需通过“加载已解压的扩展”方式安装：

### 📦 安装指南 (GitHub Release)

由于本扩展尚未上架应用商店，您需要手动安装：

1.  在 [Releases](../../releases) 页面下载最新的 `.zip` 压缩包并解压。

### Chrome / Edge 安装

1.  打开扩展管理页面：
    -   **Chrome**: 输入 `chrome://extensions`
    -   **Edge**: 输入 `edge://extensions`
2.  开启右上角的 **"开发者模式" (Developer mode)**。
3.  点击 **"加载已解压的扩展程序" (Load unpacked)**。
4.  选择解压后的文件夹即可。

### Firefox 安装

1.  在 [Releases](../../releases) 页面下载最新的 `.xpi` 文件。
2.  在 Firefox 地址栏输入 `about:addons`。
3.  点击右上角的齿轮图标 ⚙️。
4.  选择 **"从文件安装附加组件" (Install Add-on From File)**。
5.  选择下载的 `.xpi` 文件。
    -   _注意：未签名的 XPI 文件只能在 Firefox 开发者版 (Developer Edition) 或 Nightly 版本中安装，或者通过 `about:debugging` 临时加载。普通版 Firefox 必须安装经过 Mozilla 签名的扩展。_

## ⚙️ 配置说明

点击浏览器右上角的插件图标，进入**设置页面**进行配置：

### 1. OpenAI / 大模型设置 (推荐)

-   **API 地址**: 填入 OpenAI 官方或兼容 API 的地址（例如 `https://api.openai.com/v1/chat/completions` 或您的代理地址）。
-   **API Key**: 填入您的 API 密钥 (`sk-...`)。
-   **翻译模型**: 用于常规翻译的模型，如 `gpt-4o-mini`。
-   **思考模型**: (可选) 启用“显示思考”时使用的模型，如 `gpt-5`。
-   **显示思考过程**: 开启后，如果模型返回思考内容（通过 `ground_truth` 标记或 `reasoning_content` 字段），弹窗中将显示可折叠的思考区域。

### 2. 其他引擎（还没有实现）

-   **百度翻译**: 需在 [百度翻译开放平台](https://api.fanyi.baidu.com/) 申请通用翻译 API，填入 AppID 和 Secret。
-   **Google / Bing**: 需填入对应的 API Key。

## 📖 使用方法

1.  **划词**：在任意网页上用鼠标选中一段文字。
2.  **点击按钮**：选中区域右下角会出现一个蓝色的“翻译”悬浮按钮，点击它。
3.  **查看结果**：翻译结果将以弹窗形式显示。
    -   如果是大模型翻译，结果会流式逐字显示。
    -   如果包含思考过程，点击“思考（展开）”即可查看模型的推理逻辑。
4.  **关闭**：点击弹窗右上角的 `×` 或点击页面空白处即可关闭弹窗。

## 🛠️ 常见问题

-   **Q: 为什么 OpenAI 翻译没反应？**
    -   A: 请检查 API Key 是否正确，以及 API 地址是否允许跨域 (CORS)。如果是自建代理，请确保 Header 中允许了 `Access-Control-Allow-Origin: *`。
-   **Q: 百度翻译报错？**
    -   A: 请检查 AppID 和 Secret 是否正确，以及是否开通了通用翻译 API 服务。
-   **Q: 思考内容没有显示？**
    -   A: 请确保在设置中开启了“显示思考过程”，并且使用的模型确实支持输出思考内容（或 Prompt 中包含了思考指令）。

## 📝 开发说明

-   `manifest.json`: MV3 配置文件。
-   `content_script.js`: 核心逻辑，处理 DOM 交互、API 请求流式解析。
-   `styles.css`: 样式文件，使用 CSS 变量管理主题。
-   `options.js`: 设置页逻辑，使用 `chrome.storage.sync` 保存配置。

---

_Created by GitHub Copilot_
