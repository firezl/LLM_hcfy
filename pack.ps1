$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$version = $manifest.version
$zipName = "LLM-Translator-v$version.zip"

# Files/Folders to include
$includes = @(
    "manifest.json",
    "content_script.js",
    "options.html",
    "options.js",
    "styles.css",
    "icons",
    "README.md"
)

# Create a temporary folder for packing
$tempDir = "temp_pack"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy files
foreach ($item in $includes) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination $tempDir -Recurse
    }
}

# Create Zip
if (Test-Path $zipName) { Remove-Item $zipName -Force }
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipName

# Create XPI for Firefox (XPI is just a renamed ZIP)
$xpiName = "LLM-Translator-v$version.xpi"
if (Test-Path $xpiName) { Remove-Item $xpiName -Force }
Copy-Item -Path $zipName -Destination $xpiName

# Cleanup
Remove-Item $tempDir -Recurse -Force

Write-Host "✅ 打包完成:"
Write-Host "  - 通用包 (Chrome/Edge): $zipName"
Write-Host "  - Firefox 包: $xpiName"
Write-Host "您可以将这些文件上传到 GitHub Releases。"
