$ErrorActionPreference = "Stop"

$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$zipName = "LLM-Translator-v$version.zip"
$xpiName = "LLM-Translator-v$version.xpi"
$srcZipName = "LLM-Translator-v$version-src.zip"


# Files/Folders to include
$includes = @(
    "manifest.json",
    "background.js",
    "background",
    "content",
    "content/modules",
    "dist",
    "styles",
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
$srcTempDir = "temp_pack_src"


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

        $destPath = Join-Path $destDir $item
        $destParent = Split-Path $destPath -Parent
        if ($destParent -and -not (Test-Path $destParent)) {
            New-Item -ItemType Directory -Path $destParent -Force | Out-Null
        }

        Copy-Item -Path $item -Destination $destPath -Recurse -Force
    }
}

$sourceIncludes = @(
    "manifest.json",
    "background.js",
    "background",
    "content",
    "libs",
    "options.html",
    "options.js",
    "help.html",
    "help.js",
    "styles.css",
    "icons",
    "vendor",
    "options",
    "README.md",
    "package.json",
    "package-lock.json",
    "scripts",
    "tests",
    "pack.ps1"
)

function Copy-SourceTo($destDir) {
    foreach ($item in $sourceIncludes) {
        if (-not (Test-Path $item)) {
            continue
        }

        $destPath = Join-Path $destDir $item
        $destParent = Split-Path $destPath -Parent
        if ($destParent -and -not (Test-Path $destParent)) {
            New-Item -ItemType Directory -Path $destParent -Force | Out-Null
        }

        Copy-Item -Path $item -Destination $destPath -Recurse -Force
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
    Write-Host "Building content script bundle..."
    npm run build:content
    if ($LASTEXITCODE -ne 0) {
        throw "Content script bundle build failed"
    }

    Reset-Dir $chromeTempDir
    Reset-Dir $firefoxTempDir
    Reset-Dir $srcTempDir

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

    # Firefox Source Code Package
    Write-Host "Building Firefox source code package..."
    Copy-SourceTo $srcTempDir
    Build-Archive $srcTempDir $srcZipName
} finally {
    if (Test-Path $chromeTempDir) {
        Remove-Item $chromeTempDir -Recurse -Force
    }
    if (Test-Path $firefoxTempDir) {
        Remove-Item $firefoxTempDir -Recurse -Force
    }
    if (Test-Path $srcTempDir) {
        Remove-Item $srcTempDir -Recurse -Force
    }
}

Write-Host "Pack completed successfully:"
Write-Host "  - Chrome/Edge: $zipName"
Write-Host "  - Firefox: $xpiName"
Write-Host "  - Firefox Source Code: $srcZipName"
Write-Host "PDF.js assets included in vendor/ directory."
Write-Host "Firefox package uses background.scripts (background.js)."

