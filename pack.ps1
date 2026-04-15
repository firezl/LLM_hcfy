$ErrorActionPreference = "Stop"

$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$zipName = "LLM-Translator-v$version.zip"
$xpiName = "LLM-Translator-v$version.xpi"

# Files/Folders to include
$includes = @(
    "manifest.json",
    "background.js",
    "background",
    "content_script.js",
    "pdf_local_open_helper.js",
    "libs",
    "options.html",
    "options.js",
    "styles.css",
    "icons",
    "vendor",
    "options",
    "README.md"
)

$chromeTempDir = "temp_pack_chrome"
$firefoxTempDir = "temp_pack_firefox"

function Reset-Dir($dir) {
    if (Test-Path $dir) {
        Remove-Item $dir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $dir | Out-Null
}

function Copy-IncludesTo($destDir) {
    foreach ($item in $includes) {
        if (-not (Test-Path $item)) {
            Write-Warning "跳过不存在的路径: $item"
            continue
        }
        Copy-Item -Path $item -Destination $destDir -Recurse -Force
    }
}

function Build-Archive($sourceDir, $archivePath) {
    if (Test-Path $archivePath) {
        Remove-Item $archivePath -Force
    }
    Compress-Archive -Path "$sourceDir\*" -DestinationPath $archivePath -CompressionLevel Optimal
}

Reset-Dir $chromeTempDir
Reset-Dir $firefoxTempDir

Copy-IncludesTo $chromeTempDir
Copy-IncludesTo $firefoxTempDir

# Firefox 提交会对 JS 做解析，单文件超过 5MB 会被拒；
# 用轻量 stub 覆盖 WebLLM 入口，避免 background 静态 import 解析失败。
$firefoxWebLLMEntry = Join-Path $firefoxTempDir "vendor\webllm\index.js"
if (Test-Path $firefoxWebLLMEntry) {
    @'
export const prebuiltAppConfig = { model_list: [] };

export async function CreateMLCEngine() {
    throw new Error("WebLLM is disabled in Firefox package");
}

export async function deleteModelAllInfoInCache() {
    return;
}
'@ | Set-Content -Path $firefoxWebLLMEntry -Encoding UTF8
}

# Chrome/Edge 包
Build-Archive $chromeTempDir $zipName

# Firefox XPI（Firefox 兼容：background.scripts）
$firefoxManifestPath = Join-Path $firefoxTempDir "manifest.json"
$firefoxManifest = Get-Content $firefoxManifestPath -Raw | ConvertFrom-Json
$firefoxManifest.background = [ordered]@{
    scripts = @("background.js")
}

if ($firefoxManifest.web_accessible_resources) {
    $filteredWar = @()
    foreach ($entry in $firefoxManifest.web_accessible_resources) {
        $resources = @($entry.resources | Where-Object { $_ -ne "vendor/webllm/index.js" })
        if ($resources.Count -gt 0) {
            $entry.resources = $resources
            $filteredWar += $entry
        }
    }
    if ($filteredWar.Count -gt 0) {
        $firefoxManifest.web_accessible_resources = $filteredWar
    } else {
        $firefoxManifest.PSObject.Properties.Remove("web_accessible_resources")
    }
}

$firefoxManifest | ConvertTo-Json -Depth 100 | Set-Content -Path $firefoxManifestPath -Encoding UTF8

Build-Archive $firefoxTempDir $xpiName

Remove-Item $chromeTempDir -Recurse -Force
Remove-Item $firefoxTempDir -Recurse -Force

Write-Host "✅ 打包完成:"
Write-Host "  - 通用包 (Chrome/Edge): $zipName"
Write-Host "  - Firefox 包: $xpiName"
Write-Host "已包含内置 PDF.js 资源目录: vendor/"
Write-Host "Firefox 包已使用 background.scripts（background.js）。"
