$ErrorActionPreference = "Stop"

function Assert-True($condition, $message) {
    if (-not $condition) {
        throw $message
    }
}

function Assert-PathExists($path) {
    Assert-True (Test-Path $path) "缺少必需路径: $path"
}

$manifestPath = "manifest.json"
Assert-PathExists $manifestPath

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
Assert-True ($manifest.manifest_version -eq 3) "manifest_version 必须为 3"
Assert-True ([string]::IsNullOrWhiteSpace($manifest.version) -eq $false) "manifest.version 不能为空"
Assert-True ($manifest.background.service_worker -eq "background/index.js") "Chrome 包应使用 background/index.js service worker"

$requiredPaths = @(
    "background.js",
    "background/index.js",
    "content/entry.js",
    "content/modules/state.js",
    "content/modules/bootstrap.js",
    "libs/shared-config.js",
    "options/modules/dom-refs.js",
    "options/modules/ui-shell.js",
    "options/modules/messaging.js",
    "options/modules/model-lists.js",
    "options/modules/settings-form.js",
    "options/modules/engines.js",
    "options/modules/glossary.js",
    "options/modules/sync-data.js",
    "options.html",
    "options.js",
    "styles.css",
    "styles/content-ui.css",
    "styles/content-light.css",
    "icons/icon-128.png",
    "vendor/pdfjs/web/viewer.html",
    "vendor/pdfjs/build/pdf.mjs"
)

foreach ($path in $requiredPaths) {
    Assert-PathExists $path
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
Assert-True ($null -ne $nodeCommand) "缺少 node，无法执行共享配置校验"
npm run build:content
if ($LASTEXITCODE -ne 0) {
    throw "content script bundle 构建失败"
}
Assert-PathExists "dist/content.bundle.js"
npm run check:options
if ($LASTEXITCODE -ne 0) {
    throw "options.html 缺少 data-jyt-* 标注，请运行 npm run annotate:options"
}
node scripts/sync-shared-config.mjs --check
node scripts/validate-shared-config.mjs
node --test tests/*.test.mjs

$contentScript = @($manifest.content_scripts)[0]
Assert-True ($contentScript.matches -contains "<all_urls>") "content_scripts 需要覆盖 <all_urls>"
Assert-True ($contentScript.js[0] -eq "libs/shared-config.js") "libs/shared-config.js 必须先于 content bundle 加载"
Assert-True ($contentScript.js[-1] -eq "dist/content.bundle.js") "dist/content.bundle.js 必须为 content_scripts 最后一项"
Assert-True ($contentScript.js.Count -eq 2) "content_scripts 应只加载 shared-config 与 content bundle"
Assert-True ($contentScript.css.Count -eq 1) "content_scripts 应只注入一份 CSS"
Assert-True ($contentScript.css[0] -eq "styles/content-light.css") "content_scripts 应注入 styles/content-light.css，而非完整 styles.css"

$optionsHtml = Get-Content "options.html" -Raw
$optionsScriptMatches = [regex]::Matches($optionsHtml, '<script\s+src="([^"]+)"')
$optionsScripts = @($optionsScriptMatches | ForEach-Object { $_.Groups[1].Value })
$sharedConfigIndex = [array]::IndexOf($optionsScripts, "libs/shared-config.js")
$enginesIndex = [array]::IndexOf($optionsScripts, "options/modules/engines.js")
$optionsIndex = [array]::IndexOf($optionsScripts, "options.js")
Assert-True ($sharedConfigIndex -ge 0) "options.html 必须加载 libs/shared-config.js"
Assert-True ($enginesIndex -ge 0) "options.html 必须加载 options/modules/engines.js"
Assert-True ($optionsIndex -ge 0) "options.html 必须加载 options.js"
Assert-True ($sharedConfigIndex -lt $enginesIndex) "libs/shared-config.js 必须先于 options/modules/engines.js 加载"
Assert-True ($enginesIndex -lt $optionsIndex) "options/modules/engines.js 必须先于 options.js 加载"

$permissions = @($manifest.permissions)
Assert-True ($permissions -contains "storage") "缺少 storage 权限"
Assert-True ($permissions -contains "activeTab") "缺少 activeTab 权限"
Assert-True ($permissions -notcontains "tabs") "不应再默认请求 tabs 权限"

$optionalHosts = @($manifest.optional_host_permissions)
Assert-True ($optionalHosts -contains "https://*/*") "缺少 https optional_host_permissions"
Assert-True ($optionalHosts -contains "http://*/*") "缺少 http optional_host_permissions"

Write-Host "扩展清单校验通过，版本: $($manifest.version)"
