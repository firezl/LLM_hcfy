$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$excludedSegments = @(
    ".git",
    "node_modules",
    "temp_pack_chrome",
    "temp_pack_firefox",
    "vendor"
)

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
    throw "缺少 node，无法执行 JavaScript 语法检查"
}

Push-Location $repoRoot
try {
    $checkedCount = 0
    Get-ChildItem -Recurse -File -Include *.js,*.mjs |
        Where-Object {
            $relativePath = Resolve-Path -Relative $_.FullName
            $segments = $relativePath -split '[\\/]'
            foreach ($segment in $excludedSegments) {
                if ($segments -contains $segment) {
                    return $false
                }
            }
            return $true
        } |
        ForEach-Object {
            node --check $_.FullName
            $checkedCount += 1
        }

    Write-Host "JavaScript 语法检查通过，文件数: $checkedCount"
}
finally {
    Pop-Location
}
