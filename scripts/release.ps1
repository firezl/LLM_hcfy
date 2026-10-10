# 一键发布：升级 manifest.json 版本号 -> 跑测试 -> 提交 -> 打 tag -> 推送。
# 推送 tag 后由 .github/workflows/release.yml 负责打包、创建 GitHub Release 并上传各商店。
#
# 用法：
#   ./scripts/release.ps1            # 补丁版本 0.2.6 -> 0.2.7
#   ./scripts/release.ps1 minor      # 0.2.6 -> 0.3.0
#   ./scripts/release.ps1 0.3.1      # 指定版本
#   ./scripts/release.ps1 -DryRun    # 只做检查并打印将要执行的操作
param(
    [Parameter(Position = 0)]
    [string] $Version = "patch",
    [string] $Branch = "master",
    [switch] $SkipTests,
    [switch] $DryRun
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $GitArgs)
    $output = & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') 失败"
    }
    return $output
}

$currentBranch = (Invoke-Git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne $Branch) {
    throw "当前在分支 $currentBranch，请切换到 $Branch 再发布"
}

$dirty = Invoke-Git status --porcelain
if ($dirty) {
    throw "工作区有未提交的改动，请先提交或暂存后再发布：`n$($dirty -join "`n")"
}

Invoke-Git fetch origin $Branch --tags | Out-Null
$behind = [int](Invoke-Git rev-list --count "HEAD..origin/$Branch").Trim()
if ($behind -gt 0) {
    throw "本地 $Branch 落后 origin/$Branch $behind 个提交，请先 git pull"
}

$manifestPath = Join-Path (Get-Location) "manifest.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$manifestText = [System.IO.File]::ReadAllText($manifestPath, $utf8NoBom)
$versionPattern = '"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"'
$match = [regex]::Match($manifestText, $versionPattern)
if (-not $match.Success) {
    throw "无法从 manifest.json 读取 x.y.z 格式的 version"
}

$major = [int]$match.Groups[1].Value
$minor = [int]$match.Groups[2].Value
$patch = [int]$match.Groups[3].Value
$currentVersion = "$major.$minor.$patch"

switch ($Version) {
    "patch" { $nextVersion = "$major.$minor.$($patch + 1)" }
    "minor" { $nextVersion = "$major.$($minor + 1).0" }
    "major" { $nextVersion = "$($major + 1).0.0" }
    default {
        if ($Version -notmatch '^\d+\.\d+\.\d+$') {
            throw "版本参数应为 patch / minor / major 或 x.y.z，收到: $Version"
        }
        if ([version]$Version -le [version]$currentVersion) {
            throw "新版本 $Version 必须大于当前版本 $currentVersion"
        }
        $nextVersion = $Version
    }
}

$tag = "v$nextVersion"
if (Invoke-Git tag --list $tag) {
    throw "本地已存在 tag $tag"
}
if (Invoke-Git ls-remote --tags origin "refs/tags/$tag") {
    throw "远端已存在 tag $tag"
}

Write-Host "版本: $currentVersion -> $nextVersion（tag $tag，分支 $Branch）"

if (-not $SkipTests) {
    npm test
    if ($LASTEXITCODE -ne 0) {
        throw "测试失败，已中止发布"
    }
}

if ($DryRun) {
    Write-Host "[DryRun] 将更新 manifest.json、提交 'chore: release $tag'、创建 tag 并推送到 origin。"
    return
}

$updatedText = ([regex]$versionPattern).Replace(
    $manifestText,
    "`"version`": `"$nextVersion`"",
    1
)
[System.IO.File]::WriteAllText($manifestPath, $updatedText, $utf8NoBom)

Invoke-Git add manifest.json | Out-Null
Invoke-Git commit -m "chore: release $tag" | Out-Null
Invoke-Git tag -a $tag -m "Release $tag" | Out-Null
Invoke-Git push --atomic origin $Branch $tag | Out-Null

$remoteUrl = (Invoke-Git remote get-url origin).Trim() -replace '\.git$', ''
Write-Host "已推送 $tag。发布进度: $remoteUrl/actions/workflows/release.yml"
