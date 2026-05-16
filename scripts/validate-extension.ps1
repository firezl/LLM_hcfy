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
    "content_script.js",
    "libs/shared-config.js",
    "options.html",
    "options.js",
    "styles.css",
    "icons/icon-128.png",
    "vendor/pdfjs/web/viewer.html",
    "vendor/pdfjs/build/pdf.mjs",
    "vendor/webllm/index.js"
)

foreach ($path in $requiredPaths) {
    Assert-PathExists $path
}

$contentScript = @($manifest.content_scripts)[0]
Assert-True ($contentScript.matches -contains "<all_urls>") "content_scripts 需要覆盖 <all_urls>"
Assert-True ($contentScript.js[0] -eq "libs/shared-config.js") "libs/shared-config.js 必须先于 content_script.js 加载"

$permissions = @($manifest.permissions)
Assert-True ($permissions -contains "storage") "缺少 storage 权限"
Assert-True ($permissions -contains "activeTab") "缺少 activeTab 权限"
Assert-True ($permissions -notcontains "tabs") "不应再默认请求 tabs 权限"

$optionalHosts = @($manifest.optional_host_permissions)
Assert-True ($optionalHosts -contains "https://*/*") "缺少 https optional_host_permissions"
Assert-True ($optionalHosts -contains "http://*/*") "缺少 http optional_host_permissions"

Write-Host "扩展清单校验通过，版本: $($manifest.version)"
