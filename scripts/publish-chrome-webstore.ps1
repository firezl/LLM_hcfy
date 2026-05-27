$ErrorActionPreference = "Stop"

param(
    [Parameter(Mandatory = $true)]
    [string] $PackagePath,

    [Parameter(Mandatory = $true)]
    [string] $PublisherId,

    [Parameter(Mandatory = $true)]
    [string] $ExtensionId,

    [Parameter(Mandatory = $true)]
    [string] $ClientId,

    [Parameter(Mandatory = $true)]
    [string] $ClientSecret,

    [Parameter(Mandatory = $true)]
    [string] $RefreshToken,

    [ValidateSet("DEFAULT_PUBLISH", "STAGED_PUBLISH")]
    [string] $PublishType = "DEFAULT_PUBLISH"
)

if (-not (Test-Path $PackagePath)) {
    throw "Package not found: $PackagePath"
}

$tokenResponse = Invoke-RestMethod `
    -Uri "https://oauth2.googleapis.com/token" `
    -Method Post `
    -ContentType "application/x-www-form-urlencoded" `
    -Body @{
        client_id = $ClientId
        client_secret = $ClientSecret
        refresh_token = $RefreshToken
        grant_type = "refresh_token"
    }

if ([string]::IsNullOrWhiteSpace($tokenResponse.access_token)) {
    throw "Google OAuth token response did not include access_token."
}

$headers = @{
    Authorization = "Bearer $($tokenResponse.access_token)"
}

$itemName = "publishers/$PublisherId/items/$ExtensionId"
$uploadUri = "https://chromewebstore.googleapis.com/upload/v2/$($itemName):upload"
$statusUri = "https://chromewebstore.googleapis.com/v2/$($itemName):fetchStatus"
$publishUri = "https://chromewebstore.googleapis.com/v2/$($itemName):publish"

Write-Host "Uploading $PackagePath to Chrome Web Store item $ExtensionId..."
$uploadResponse = Invoke-RestMethod `
    -Uri $uploadUri `
    -Method Post `
    -Headers $headers `
    -ContentType "application/zip" `
    -InFile $PackagePath

$uploadState = $uploadResponse.uploadState
if ([string]::IsNullOrWhiteSpace($uploadState)) {
    $statusResponse = Invoke-RestMethod -Uri $statusUri -Method Get -Headers $headers
    $uploadState = $statusResponse.uploadState
}

for ($attempt = 1; $uploadState -eq "UPLOAD_IN_PROGRESS" -and $attempt -le 20; $attempt++) {
    Write-Host "Chrome upload is still processing; polling status ($attempt/20)..."
    Start-Sleep -Seconds 15
    $statusResponse = Invoke-RestMethod -Uri $statusUri -Method Get -Headers $headers
    $uploadState = $statusResponse.uploadState
}

if ($uploadState -and $uploadState -notin @("SUCCESS", "UPLOAD_SUCCESS")) {
    $details = $uploadResponse | ConvertTo-Json -Depth 20
    throw "Chrome Web Store upload did not succeed. State: $uploadState. Response: $details"
}

Write-Host "Submitting Chrome Web Store item $ExtensionId for publishing..."
$publishBody = @{
    publishType = $PublishType
} | ConvertTo-Json -Depth 5

$publishResponse = Invoke-RestMethod `
    -Uri $publishUri `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $publishBody

Write-Host "Chrome Web Store publish response:"
$publishResponse | ConvertTo-Json -Depth 20
