# Privacy Policy / 隐私权政策

**Extension:** LLM划词翻译 (LLM Selection Translator)  
**Last updated / 最后更新:** June 10, 2026  
**Project / 项目主页:** https://github.com/firezl/LLM_hcfy

---

## 中文

### 概述

LLM划词翻译（以下简称「本扩展」）是一款浏览器扩展，用于在网页中划词翻译。本隐私权政策说明本扩展如何处理与用户相关的信息。

**本扩展的开发者不会运营用于收集用户数据的后端服务器。** 除您主动配置的第三方翻译服务或 WebDAV 同步目标外，您的数据不会经过开发者服务器。

### 我们处理哪些信息

| 信息类型 | 处理方式 |
| -------- | -------- |
| **您选中的网页文字** | 仅在您触发翻译时使用，用于生成译文 |
| **当前页面 URL 或上下文** | 仅在翻译流程需要时本地使用（例如 PDF 检测、iframe 页面识别） |
| **扩展设置** | 保存在浏览器本地存储（`chrome.storage` / `browser.storage`）中，例如首选引擎、快捷键、界面选项 |
| **API Key 与接口地址** | 仅保存在浏览器本地存储中，**不会**通过 WebDAV 配置同步上传 |
| **术语库与翻译历史** | 默认保存在浏览器本地；若您启用 WebDAV 同步，会同步到您自行配置的服务器 |
| **自定义请求头与模型参数** | 保存在本地，并随翻译请求发送到您选择的 API 端点 |

### 信息如何被使用

- 提供划词翻译、PDF 阅读翻译、术语替换、历史记录等核心功能
- 在您启用时，通过 WebDAV 在您自己的设备或服务器之间同步配置与术语库
- 将选中文本及翻译所需参数发送到**您自行选择**的翻译服务（见下文「第三方服务」）

### 第三方服务

当您使用翻译功能时，本扩展会将选中的文本（以及您配置的模型、Prompt、请求头等参数）发送到您选择的第三方服务，例如：

- 大模型 API：OpenAI、OpenRouter、DeepSeek、通义千问、智谱、Claude、Gemini、xAI、NVIDIA NIM、Ollama（本地或远程）等
- 机器翻译：Google 翻译、Bing 翻译、DeepL 等
- 浏览器内置 Translation / LanguageDetector API（若可用）

这些服务由各自运营方独立提供，受其隐私政策与服务条款约束。**开发者无法控制第三方如何处理您的数据。** 请在使用前查阅相应服务商的隐私政策，并仅向可信端点提交 API Key。

若您启用 **WebDAV 同步**，配置与术语库等数据会传输到**您自行指定**的 WebDAV 服务器，而非开发者服务器。

### 本地存储与权限

本扩展申请以下浏览器权限，用途如下：

- **`storage`**：保存设置、术语库、历史记录及 API Key
- **`activeTab`**：在当前标签页读取您选中的文字
- **`contextMenus`**：提供右键菜单翻译入口
- **`host_permissions` / 可选主机权限**：向您配置的翻译 API、PDF 资源或 WebDAV 服务器发起网络请求

本扩展**不会**：

- 向开发者发送分析、遥测或广告数据
- 出售、出租或以其他方式 monetize 您的个人信息
- 在后台批量采集网页内容（仅处理您主动选中的文字）

### 数据保留与删除

- 本地数据保留在您的浏览器中，直至您卸载扩展、清除扩展数据，或在设置页中删除历史/导出后覆盖
- WebDAV 上的数据保留策略由您自己的服务器与配置决定
- 第三方 API 服务商的数据保留政策请查阅其官方说明

### 儿童隐私

本扩展不面向 13 周岁以下儿童，也不会故意收集儿童个人信息。

### 政策变更

我们可能会更新本政策以反映功能或法律要求的变化。更新后的版本将发布在本页面，并修改文首「最后更新」日期。重大变更时，我们可能在项目 Release 或仓库说明中另行提示。

### 联系我们

如有隐私相关问题，请通过 GitHub Issues 联系：

https://github.com/firezl/LLM_hcfy/issues

---

## English

### Overview

LLM Selection Translator (「LLM划词翻译」, the 「Extension」) is a browser extension that translates text you select on web pages. This Privacy Policy explains how the Extension handles information related to you.

**The developer does not operate backend servers to collect user data.** Except for third-party translation services or WebDAV endpoints you configure, your data does not pass through developer-controlled servers.

### Information We Process

| Type | Handling |
| ---- | -------- |
| **Text you select on a page** | Used only when you trigger translation |
| **Page URL or context** | Used locally when needed (e.g. PDF detection, iframe handling) |
| **Extension settings** | Stored locally in browser storage (`chrome.storage` / `browser.storage`), such as preferred engine, shortcuts, and UI options |
| **API keys and endpoint URLs** | Stored locally only; **not** uploaded via WebDAV config sync |
| **Glossary and translation history** | Stored locally by default; synced to your WebDAV server if you enable sync |
| **Custom headers and model parameters** | Stored locally and sent with requests to APIs you choose |

### How Information Is Used

- To provide core features: selection translation, in-PDF translation, glossary substitution, and history
- To sync settings and glossary across your devices via WebDAV, when you enable it
- To send selected text and request parameters to **translation providers you choose** (see Third-Party Services)

### Third-Party Services

When you translate, the Extension sends selected text (and parameters such as model, prompts, and headers you configure) to third-party services you select, including for example:

- LLM APIs: OpenAI, OpenRouter, DeepSeek, Qwen, GLM, Claude, Gemini, xAI, NVIDIA NIM, Ollama (local or remote), and compatible endpoints
- Machine translation: Google Translate, Bing Translator, DeepL, and similar services
- Browser built-in Translation / LanguageDetector APIs, when available

These services are operated independently and governed by their own privacy policies and terms. **The developer does not control how third parties handle your data.** Review each provider’s policy before use, and only submit API keys to endpoints you trust.

If you enable **WebDAV sync**, settings and glossary data are transferred to the **WebDAV server you specify**, not to developer servers.

### Local Storage and Permissions

The Extension requests browser permissions for the following purposes:

- **`storage`**: save settings, glossary, history, and API keys
- **`activeTab`**: read text you select in the active tab
- **`contextMenus`**: provide a context-menu translation entry
- **`host_permissions` / optional host permissions**: connect to translation APIs, PDF resources, or WebDAV servers you configure

The Extension **does not**:

- Send analytics, telemetry, or advertising data to the developer
- Sell, rent, or otherwise monetize your personal information
- Bulk-collect page content in the background (only text you actively select is processed)

### Retention and Deletion

- Local data remains in your browser until you uninstall the Extension, clear extension data, or delete history/export data from the options page
- Data on WebDAV is governed by your server and retention settings
- Third-party API retention is governed by each provider’s policies

### Children’s Privacy

The Extension is not directed at children under 13, and we do not knowingly collect personal information from children.

### Changes to This Policy

We may update this policy to reflect feature or legal changes. The revised version will be posted on this page with an updated “Last updated” date. Material changes may also be noted in project releases or repository announcements.

### Contact Us

For privacy-related questions, please open a GitHub Issue:

https://github.com/firezl/LLM_hcfy/issues
