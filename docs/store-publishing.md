# 浏览器商店自动发布配置

本项目已经有 `.github/workflows/release.yml` 和 `pack.ps1`。打 tag 时会构建：

- `LLM-Translator-v<version>.zip`：用于 Chrome Web Store 和 Microsoft Edge Add-ons。
- `LLM-Translator-v<version>.xpi`：用于 Firefox AMO。

## 前置条件

三家商店的第一次上架都建议先在后台手动完成：

- 创建商品或扩展条目。
- 填写商店详情、隐私说明、截图、分类和发布范围。
- 确认 `manifest.json` 里的 `version` 和 Git tag 一致，例如 `version: 0.1.10` 对应 tag `v0.1.10`。

完成第一次上架后，把下面的 GitHub Secrets 填好，之后推送新 tag 就会自动上传新包并提交审核。

## Chrome Web Store

需要的 Secrets：

- `CHROME_PUBLISHER_ID`
- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

获取方式：

1. 在 Google Cloud 启用 Chrome Web Store API。
2. 创建 OAuth Client，授权 scope 使用 `https://www.googleapis.com/auth/chromewebstore`。
3. 通过 OAuth Playground 或自己的 OAuth 流程拿到 refresh token。
4. 在 Chrome Web Store Developer Dashboard 找到 Publisher ID 和 Extension ID。

可选 Secret：

- `CHROME_PUBLISH_TYPE`：默认 `DEFAULT_PUBLISH`，也可以设为 `STAGED_PUBLISH`。

## Microsoft Edge Add-ons

需要的 Secrets：

- `EDGE_PRODUCT_ID`
- `EDGE_CLIENT_ID`
- `EDGE_API_KEY`

获取方式：

1. 在 Microsoft Partner Center 里先创建并发布一次 Edge 扩展。
2. 进入 Microsoft Edge 项目的 Publish API 页面，启用 API 并创建凭据。
3. 记录 Client ID、API key 和商品 Product ID。

可选 Secret：

- `EDGE_PUBLISH_NOTES`：提交审核说明，默认会使用自动发布说明。

## Firefox AMO

需要的 Secrets：

- `AMO_JWT_ISSUER`
- `AMO_JWT_SECRET`

可选 Secret：

- `AMO_CHANNEL`：默认 `listed`。如果只想签名并自分发，可设为 `unlisted`。

第一次创建 AMO listed 商品时，通常需要提交元数据。可以复制 `store/firefox-amo-metadata.example.json` 为 `store/firefox-amo-metadata.json`，按你的仓库地址、邮箱、许可证和分类改好后提交。后续版本更新可以不改这个文件。

## 发布流程

1. 修改 `manifest.json` 的版本号。
2. 提交代码。
3. 创建并推送匹配 tag：

   ```powershell
   git tag v0.1.11
   git push origin v0.1.11
   ```

4. GitHub Actions 会执行校验、打包、创建 GitHub Release，并在对应 Secrets 完整时发布到商店。

没有配置某个平台的 Secrets 时，该平台会自动跳过，不影响其他平台和 GitHub Release。
