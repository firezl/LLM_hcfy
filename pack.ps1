$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$zipName = "LLM-Translator-v$version.zip"
$xpiName = "LLM-Translator-v$version.xpi"

# Files/Folders to include
$includes = @(
    "manifest.json",
    "background.js",
    "content_script.js",
    "options.html",
    "options.js",
    "styles.css",
    "icons",
    "README.md"
)

# Create a temporary folder for packing
$chromeTempDir = "temp_pack_chrome"
$firefoxTempDir = "temp_pack_firefox"
foreach ($dir in @($chromeTempDir, $firefoxTempDir)) {
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    New-Item -ItemType Directory -Path $dir | Out-Null
}

function Copy-IncludesTo($destDir) {
    foreach ($item in $includes) {
        if (Test-Path $item) {
            Copy-Item -Path $item -Destination $destDir -Recurse
        }
    }
}

Copy-IncludesTo $chromeTempDir
Copy-IncludesTo $firefoxTempDir

# Create Chrome/Edge Zip (keeps original manifest with service_worker)
if (Test-Path $zipName) { Remove-Item $zipName -Force }
Compress-Archive -Path "$chromeTempDir\*" -DestinationPath $zipName

# Build Firefox-specific manifest (Firefox currently requires background.scripts)
$firefoxManifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$firefoxManifest.background = [ordered]@{
    scripts = @("background.js")
}
$firefoxManifest | ConvertTo-Json -Depth 100 | Set-Content -Path "$firefoxTempDir\manifest.json" -Encoding UTF8

# Create XPI for Firefox
if (Test-Path $xpiName) { Remove-Item $xpiName -Force }
Compress-Archive -Path "$firefoxTempDir\*" -DestinationPath $xpiName

# Cleanup
Remove-Item $chromeTempDir -Recurse -Force
Remove-Item $firefoxTempDir -Recurse -Force

Write-Host "✅ 打包完成:"
Write-Host "  - 通用包 (Chrome/Edge): $zipName"
Write-Host "  - Firefox 包: $xpiName"
Write-Host "您可以将这些文件上传到 GitHub Releases。"
