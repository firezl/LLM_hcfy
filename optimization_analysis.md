# 🔮 LLM划词翻译 — 全面优化分析报告

基于对项目所有核心源码的深度审查，从**产品**、**用户体验**和**工程**三个维度给出优化建议。

---

## 📊 现状总览

| 维度 | 当前评级 | 核心优势 | 主要短板 |
|---|---|---|---|
| 产品功能 | ⭐⭐⭐⭐ | 多引擎覆盖全、PDF/术语库/WebDAV 差异化强 | 缺少连接测试、历史管理粗糙 |
| 用户体验 | ⭐⭐⭐ | 视觉设计精美、暗黑模式智能 | 无加载态、无动画、无键盘导航 |
| 工程质量 | ⭐⭐⭐ | 模块化清晰、迁移系统成熟 | 无构建工具、无类型检查、测试未入 CI |
| 无障碍 | ⭐ | Shadow DOM 隔离做得好 | 几乎零 ARIA 支持 |
| 安全 | ⭐⭐⭐ | API Key 不走 WebDAV、CSP 合理 | Markdown XSS 风险、输入无校验 |

---

## 🎯 一、产品层面优化

### 1. API 连接测试 — 「一键验证」 `[优先级: 🔴 高]`

**现状**: 用户在 [options.js](file:///e:/repos/hcfy/options.js) 中填写 API Key 和地址后，完全没有验证机制。用户需要回到网页划词才能发现配置错误。

**方案**:
- 在每个 provider 设置区域增加「测试连接」按钮
- 后台发送一个极短的测试 prompt（如 "Hi"），检查返回状态码
- 成功显示绿色 ✅ + 模型名称，失败显示红色 ❌ + 具体错误原因（Key 无效 / 地址不通 / CORS 拒绝）

**预期收益**: 大幅降低新用户配置失败后的流失率

---

### 2. 翻译历史增强 `[优先级: 🟡 中]`

**现状**: [history-manager.js](file:///e:/repos/hcfy/background/history-manager.js) 支持基本的 CRUD，但前端无分页、无搜索、无大小限制。

**方案**:
- 增加分页加载（每页 50 条），避免历史过多时卡顿
- 增加搜索/筛选（按来源语言、翻译引擎、日期范围）
- 增加自动清理策略（设置最大保留条数/天数，超出时 FIFO 淘汰）
- 支持批量删除和导出选中记录

---

### 3. 快捷键系统 `[优先级: 🟡 中]`

**现状**: 仅有鼠标划词+点击按钮的触发方式，无键盘快捷键。

**方案**:
- 划词后 `Ctrl+Shift+T`（可自定义）直接触发翻译，跳过浮动按钮
- `Escape` 关闭弹窗
- `Ctrl+C` 复制翻译结果（当弹窗聚焦时）
- 通过 `chrome.commands` API 注册全局快捷键

---

### 4. i18n 国际化 `[优先级: 🟢 低]`

**现状**: 所有用户可见字符串硬编码为中文，包括 [ui.js](file:///e:/repos/hcfy/content/modules/ui.js) 中的 `'▶ 思考过程'`、错误提示等。

**方案**:
- 使用 Chrome Extension 原生 `chrome.i18n` 基础设施
- 创建 `_locales/zh_CN/messages.json` 和 `_locales/en/messages.json`
- 初期只做中英双语，后续可社区贡献翻译

**预期收益**: 扩大国际用户群，对上架 Chrome Web Store 的审核也有帮助

---

## 🎨 二、用户体验优化

### 5. 加载骨架屏 / Shimmer 效果 `[优先级: 🔴 高]`

**现状**: 点击翻译按钮后，弹窗出现但内容区空白，直到 API 开始返回流式数据。慢速网络下用户不确定是否在工作。

**方案**:
```
┌─────────────────────────────┐
│  LLM 翻译                ×  │
├─────────────────────────────┤
│  ░░░░░░░░░░░░░░░           │  ← 骨架屏闪烁动画
│  ░░░░░░░░░░                │
│  ░░░░░░░░░░░░░             │
│                             │
│  ⏳ 正在连接 DeepSeek...    │  ← 状态提示文字
└─────────────────────────────┘
```
- 弹窗打开即显示骨架屏 + 引擎名称
- 收到第一个 token 后平滑过渡到实际内容

---

### 6. 弹窗入场/退场动画 `[优先级: 🟡 中]`

**现状**: 弹窗直接 `display: block` 出现，无过渡。

**方案**:
- 入场：`opacity 0→1` + `translateY(8px→0)` 的 150ms ease-out 动画
- 退场：`opacity 1→0` + `scale(1→0.98)` 的 100ms ease-in 动画
- 思考过程展开/折叠：`max-height` + `opacity` 过渡动画

---

### 7. 键盘可访问性 + ARIA `[优先级: 🔴 高]`

**现状**: [ui.js](file:///e:/repos/hcfy/content/modules/ui.js) 中弹窗和翻译按钮**没有任何 ARIA 属性**，无 `role`、无 `aria-label`、无焦点管理。

**方案**:
```javascript
// 弹窗容器
popup.setAttribute('role', 'dialog');
popup.setAttribute('aria-label', '翻译结果');
popup.setAttribute('aria-modal', 'false');

// 关闭按钮
closeBtn.setAttribute('role', 'button');
closeBtn.setAttribute('aria-label', '关闭翻译弹窗');
closeBtn.tabIndex = 0;

// 流式内容区
resultArea.setAttribute('aria-live', 'polite');
resultArea.setAttribute('aria-atomic', 'false');

// 翻译触发按钮
triggerBtn.setAttribute('role', 'button');
triggerBtn.setAttribute('aria-label', '翻译选中文字');
```
- 弹窗打开时捕获焦点，关闭时归还焦点
- 支持 `Tab` 在弹窗内元素间导航
- `Escape` 关闭弹窗

---

### 8. 设置页分步/分区重构 `[优先级: 🟡 中]`

**现状**: [options.html](file:///e:/repos/hcfy/options.html) 是一个 54KB 的巨型单页面，所有 provider 配置堆在一起。

**方案**:
- **方案 A（轻量）**: 将当前 Tab 页面内部再按 provider 做可折叠手风琴分组，默认只展开用户启用的 provider
- **方案 B（中量）**: 左侧固定导航栏 + 右侧滚动内容，类似 VS Code 设置页
- **方案 C（重量）**: 首次使用引导向导（Wizard），一步步配置：选 provider → 填 Key → 测试 → 选模型 → 完成

> [!TIP]
> 推荐先做**方案 A + 首次引导向导**，投入产出比最高。

---

### 9. 首次使用引导 (Onboarding) `[优先级: 🟡 中]`

**现状**: 安装后直接进入复杂的设置页，新用户容易迷失。

**方案**:
- 检测到首次安装（无配置数据），自动弹出引导流
- Step 1: 选择主要翻译引擎（LLM / Google / Bing）
- Step 2: 填写 API Key（附带链接到各服务商申请页）
- Step 3: 一键测试连接
- Step 4: 完成 🎉 + 提示「去任意网页划词试试吧」
- 引导完成后，正常进入完整设置页

---

## 🔧 三、工程层面优化

### 10. 引入轻量构建工具链 `[优先级: 🔴 高]`

**现状**: 无 bundler，12 个 content script 文件通过 `manifest.json` 逐个注入每个页面和 iframe。无 minification。

**方案**:
- 引入 [esbuild](https://esbuild.github.io/) 或 [Rollup](https://rollupjs.org/)（轻量，不改变项目「无框架」哲学）
- 将 `content/modules/*.js` 打包为单个 `content-bundle.js`
- 将 `background/*.js` 打包为单个 `background-bundle.js`
- 生产构建启用 minification

**预期收益**:
- 减少注入脚本数从 12 → 1（content）+ 1（background）
- 总体积减少 30-50%（minification + tree-shaking）
- 支持 ES modules 的 `import/export` 语法，替代 `window.__hcfyState` 全局变量

---

### 11. TypeScript 渐进迁移 `[优先级: 🟢 低]`

**现状**: 纯 JavaScript，无类型检查。项目有 ~50+ 文件，复杂的消息传递协议容易出错。

**方案**:
- 第一步：添加 `jsconfig.json` + JSDoc 类型注释，零成本获得 VS Code 类型提示
- 第二步：核心模块（`llm-stream.js`、`shared-config.js`、消息协议）迁移为 `.ts`
- 配合 esbuild 构建步骤，可以直接编译 TS

---

### 12. 安全加固 — Markdown XSS 防护 `[优先级: 🔴 高]`

**现状**: [ui.js](file:///e:/repos/hcfy/content/modules/ui.js) 中的内置 markdown 渲染器将 API 返回的文本通过 `innerHTML` 注入 Shadow DOM。如果 API 返回恶意 HTML/JS 代码，可能在扩展上下文中执行。

**方案**:
```javascript
// 方案 1: 使用 DOMPurify (推荐, ~7KB gzipped)
import DOMPurify from 'dompurify';
resultArea.innerHTML = DOMPurify.sanitize(renderedMarkdown);

// 方案 2: 使用 Trusted Types API (Chrome 原生)
const policy = trustedTypes.createPolicy('hcfy-markdown', {
  createHTML: (input) => sanitize(input)
});
resultArea.innerHTML = policy.createHTML(renderedMarkdown);

// 方案 3: 最小化 — 在现有渲染器中 escape 所有 HTML 标签
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
```

> [!WARNING]
> 这是一个**真实的安全风险**。恶意或被劫持的 API 端点可以注入脚本到扩展的 Shadow DOM 中，理论上可以访问 `chrome.runtime` API 和扩展存储中的 API Key。建议优先修复。

---

### 13. 性能优化 — 减少 iframe 影响 `[优先级: 🟡 中]`

**现状**: `manifest.json` 中 `"all_frames": true` 导致 content script 注入到**每个 iframe**，包括广告 iframe、社交嵌入等。

**方案**:
- 评估是否真的需要 `all_frames: true`。大部分划词场景发生在主文档
- 如果需要保留 iframe 支持，考虑在 iframe 中只注入一个轻量的"代理脚本"，通过 `postMessage` 与主框架通信
- 或使用 `match_about_blank: false` + 显式 iframe 白名单

---

### 14. CI 集成测试 `[优先级: 🟡 中]`

**现状**: 已有 `tests/` 目录和 `npm test` 命令，但 `.github/workflows/release.yml` 中**没有运行测试步骤**。

**方案**:
- 在 release workflow 的 pack 步骤前添加 `npm test`
- 增加一个独立的 CI workflow（push/PR 触发）只跑测试 + lint
- 添加 ESLint 配置 + `npm run lint` 步骤
- 考虑添加 `manifest.json` schema 校验

---

### 15. 存储容量治理 `[优先级: 🟡 中]`

**现状**:
- `chrome.storage.sync` 有 100KB 总限制、8KB/item 限制，代码中**未检查**
- 翻译历史和术语库**无大小上限**，长期使用可能膨胀

**方案**:
```javascript
// 存储使用量监控
async function checkStorageUsage() {
  const bytesInUse = await chrome.storage.local.getBytesInUse();
  const quota = chrome.storage.local.QUOTA_BYTES; // ~5MB for local
  if (bytesInUse / quota > 0.8) {
    // 提示用户清理或自动裁剪旧历史
  }
}

// 历史自动裁剪
const MAX_HISTORY_ENTRIES = 5000;
async function pruneHistory() {
  const history = await getHistory();
  if (history.length > MAX_HISTORY_ENTRIES) {
    const pruned = history.slice(-MAX_HISTORY_ENTRIES);
    await saveHistory(pruned);
  }
}
```

---

### 16. 网络请求健壮性 `[优先级: 🟡 中]`

**现状**: [llm-stream.js](file:///e:/repos/hcfy/background/llm-stream.js) 中的流式请求无超时、无重试、无并发控制。

**方案**:
- **请求超时**: 使用 `AbortController` + `setTimeout`，默认 30s 超时，可在设置中调整
- **重试**: 非流式请求（Google/Bing 翻译）失败后自动重试 1-2 次，指数退避
- **并发控制**: 同时只允许 1 个翻译请求在进行，新请求取消上一个
- **连接状态提示**: 弹窗中显示 "连接中..." / "翻译中..." / "完成" 状态

---

## 📋 优先级排序总结

| 优先级 | 优化项 | 类型 | 预计工作量 |
|---|---|---|---|
| 🔴 P0 | Markdown XSS 安全修复 (#12) | 安全 | 0.5 天 |
| 🔴 P0 | API 连接测试按钮 (#1) | 产品 | 1 天 |
| 🔴 P0 | 加载骨架屏 (#5) | 体验 | 0.5 天 |
| 🔴 P0 | 键盘可访问性 + ARIA (#7) | 体验 | 1-2 天 |
| 🟡 P1 | 引入构建工具链 (#10) | 工程 | 1-2 天 |
| 🟡 P1 | 弹窗动画 (#6) | 体验 | 0.5 天 |
| 🟡 P1 | 网络请求健壮性 (#16) | 工程 | 1 天 |
| 🟡 P1 | 设置页分区重构 (#8) | 体验 | 2-3 天 |
| 🟡 P1 | CI 集成测试 (#14) | 工程 | 0.5 天 |
| 🟡 P1 | 存储容量治理 (#15) | 工程 | 0.5 天 |
| 🟡 P1 | 快捷键系统 (#3) | 产品 | 1 天 |
| 🟡 P1 | 翻译历史增强 (#2) | 产品 | 1-2 天 |
| 🟡 P1 | 减少 iframe 影响 (#13) | 工程 | 1 天 |
| 🟡 P1 | 首次使用引导 (#9) | 体验 | 1-2 天 |
| 🟢 P2 | i18n 国际化 (#4) | 产品 | 2-3 天 |
| 🟢 P2 | TypeScript 渐进迁移 (#11) | 工程 | 持续 |

---

## 🏆 快赢建议（一周内可完成的高影响力改动）

如果时间有限，建议优先处理以下 5 项，它们能以最小的改动带来最大的体验提升：

1. **Markdown XSS 修复** — 加一个 `escapeHtml` 函数，半天搞定，消除安全隐患
2. **API 连接测试** — 设置页加一个按钮+后台测试逻辑，一天搞定，新用户体验质变
3. **加载骨架屏** — CSS 动画 + 一小段 JS，半天搞定，解决「点了没反应」的焦虑
4. **弹窗入场动画** — 纯 CSS transition，半天搞定，质感立刻提升
5. **CI 跑测试** — workflow 加一行 `npm test`，10 分钟搞定，防止回归
