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
    "help.html",
    "help.js",
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

function Optimize-PackageDir($dir) {
    $pdfjsDir = Join-Path $dir "vendor\pdfjs"
    if (-not (Test-Path $pdfjsDir)) {
        return
    }

    Get-ChildItem -Path $pdfjsDir -Recurse -File -Include "*.map" |
        Remove-Item -Force

    $samplePdf = Join-Path $pdfjsDir "web\compressed.tracemonkey-pldi-09.pdf"
    if (Test-Path $samplePdf) {
        Remove-Item $samplePdf -Force
    }
}

function Build-Archive($sourceDir, $archivePath) {
    if (Test-Path $archivePath) {
        Remove-Item $archivePath -Force
    }
    Compress-Archive -Path "$sourceDir\*" -DestinationPath $archivePath -CompressionLevel Optimal
}

try {
    Reset-Dir $chromeTempDir
    Reset-Dir $firefoxTempDir

    Copy-IncludesTo $chromeTempDir
    Copy-IncludesTo $firefoxTempDir
    Optimize-PackageDir $chromeTempDir
    Optimize-PackageDir $firefoxTempDir

    # Chrome/Edge 包
    Build-Archive $chromeTempDir $zipName

    # Firefox XPI（Firefox 兼容：background.scripts）
    $firefoxManifestPath = Join-Path $firefoxTempDir "manifest.json"
    $firefoxManifest = Get-Content $firefoxManifestPath -Raw | ConvertFrom-Json
    $firefoxManifest.background = [ordered]@{
        scripts = @("background.js")
    }

    $firefoxManifest | ConvertTo-Json -Depth 100 | Set-Content -Path $firefoxManifestPath -Encoding UTF8

    Build-Archive $firefoxTempDir $xpiName
} finally {
    if (Test-Path $chromeTempDir) {
        Remove-Item $chromeTempDir -Recurse -Force
    }
    if (Test-Path $firefoxTempDir) {
        Remove-Item $firefoxTempDir -Recurse -Force
    }
}

Write-Host "✅ 打包完成:"
Write-Host "  - 通用包 (Chrome/Edge): $zipName"
Write-Host "  - Firefox 包: $xpiName"
Write-Host "已包含内置 PDF.js 资源目录: vendor/"
Write-Host "Firefox 包已使用 background.scripts（background.js）。"
