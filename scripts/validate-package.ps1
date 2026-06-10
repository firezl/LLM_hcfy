param(
    [string] $PackagePath = "",
    [switch] $IncludeFirefox
)

$ErrorActionPreference = "Stop"

function Assert-True($condition, $message) {
    if (-not $condition) {
        throw $message
    }
}

function Add-UniquePath(
    [System.Collections.Generic.List[string]] $paths,
    [string] $path
) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        return
    }

    $normalized = [string]$path
    if (-not $paths.Contains($normalized)) {
        [void]$paths.Add($normalized)
    }
}

function Get-PackagePathsFromManifest($manifest) {
    $paths = [System.Collections.Generic.List[string]]::new()

    Add-UniquePath $paths "manifest.json"

    if ($manifest.background.service_worker) {
        Add-UniquePath $paths $manifest.background.service_worker
    }

    foreach ($script in @($manifest.background.scripts)) {
        Add-UniquePath $paths $script
    }

    if ($manifest.action.default_popup) {
        Add-UniquePath $paths $manifest.action.default_popup
    }

    if ($manifest.options_ui.page) {
        Add-UniquePath $paths $manifest.options_ui.page
    }

    foreach ($iconPath in @($manifest.icons.PSObject.Properties.Value)) {
        Add-UniquePath $paths $iconPath
    }

    foreach ($entry in @($manifest.content_scripts)) {
        foreach ($script in @($entry.js)) {
            Add-UniquePath $paths $script
        }
        foreach ($style in @($entry.css)) {
            Add-UniquePath $paths $style
        }
    }

    return $paths
}

function Add-HtmlScriptPaths(
    [string] $htmlPath,
    [System.Collections.Generic.List[string]] $paths
) {
    if (-not (Test-Path $htmlPath)) {
        return
    }

    $html = Get-Content $htmlPath -Raw
    $matches = [regex]::Matches($html, '<script\s+src="([^"]+)"')
    foreach ($match in $matches) {
        Add-UniquePath $paths $match.Groups[1].Value
    }
}

function Test-PackageArchive($archivePath, $label) {
    Assert-True (Test-Path $archivePath) "缺少发布包: $archivePath"

    $length = (Get-Item $archivePath).Length
    Assert-True ($length -gt 0) "发布包为空: $archivePath"

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("jyt-pack-check-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    try {
        $zipCopy = Join-Path $tempDir "package.zip"
        Copy-Item -Path $archivePath -Destination $zipCopy -Force
        Expand-Archive -Path $zipCopy -DestinationPath $tempDir -Force

        $manifestPath = Join-Path $tempDir "manifest.json"
        Assert-True (Test-Path $manifestPath) "$label 包缺少 manifest.json"

        $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        $requiredPaths = Get-PackagePathsFromManifest $manifest
        Add-HtmlScriptPaths (Join-Path $tempDir "options.html") $requiredPaths
        Add-HtmlScriptPaths (Join-Path $tempDir "help.html") $requiredPaths

        foreach ($relativePath in ($requiredPaths | Sort-Object)) {
            $fullPath = Join-Path $tempDir ($relativePath -replace "/", [IO.Path]::DirectorySeparatorChar)
            Assert-True (Test-Path $fullPath) "$label 包缺少 manifest/HTML 引用的文件: $relativePath"
        }

        Write-Host "$label 包校验通过: $archivePath"
    }
    finally {
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$repoManifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
$version = [string]$repoManifest.version
Assert-True (-not [string]::IsNullOrWhiteSpace($version)) "manifest.version 不能为空"

if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $PackagePath = "LLM-Translator-v$version.zip"
}

Test-PackageArchive $PackagePath "Chrome/Edge"

if ($IncludeFirefox) {
    $xpiPath = "LLM-Translator-v$version.xpi"
    Test-PackageArchive $xpiPath "Firefox"
}

Write-Host "发布包校验完成，版本: $version"
