$ErrorActionPreference = "Stop"

param(
    [Parameter(Mandatory = $true)]
    [string] $PackagePath,

    [Parameter(Mandatory = $true)]
    [string] $ProductId,

    [Parameter(Mandatory = $true)]
    [string] $ClientId,

    [Parameter(Mandatory = $true)]
    [string] $ApiKey,

    [string] $Notes = "Automated package update from GitHub Actions.",

    [int] $RetryLimit = 30,

    [int] $RetryAfterSeconds = 20
)

if (-not (Test-Path $PackagePath)) {
    throw "Package not found: $PackagePath"
}

$root = "https://api.addons.microsoftedge.microsoft.com/v1/products/$ProductId"
$headers = @{
    Authorization = "ApiKey $ApiKey"
    "X-ClientID" = $ClientId
}

function Get-OperationIdFromLocation($location) {
    if ([string]::IsNullOrWhiteSpace($location)) {
        throw "Response did not include a Location header with an operation ID."
    }

    return (($location -split "/")[-1])
}

function Wait-EdgeOperation($uri, $operationName) {
    for ($attempt = 1; $attempt -le $RetryLimit; $attempt++) {
        $response = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
        $status = $response.status
        if ([string]::IsNullOrWhiteSpace($status)) {
            $status = $response.operationStatus
        }

        Write-Host "$operationName status ($attempt/$RetryLimit): $status"

        if ($status -match "^(Succeeded|Success|Completed)$") {
            return $response
        }

        if ($status -match "^(Failed|Failure|Error)$") {
            $details = $response | ConvertTo-Json -Depth 20
            throw "$operationName failed: $details"
        }

        Start-Sleep -Seconds $RetryAfterSeconds
    }

    throw "$operationName did not complete after $RetryLimit attempts."
}

Write-Host "Uploading $PackagePath to Microsoft Edge Add-ons product $ProductId..."
$uploadResponse = Invoke-WebRequest `
    -Uri "$root/submissions/draft/package" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/zip" `
    -InFile $PackagePath

$uploadOperationId = Get-OperationIdFromLocation $uploadResponse.Headers.Location
Wait-EdgeOperation "$root/submissions/draft/package/operations/$uploadOperationId" "Edge package upload" | Out-Null

Write-Host "Publishing Microsoft Edge Add-ons draft submission..."
$publishResponse = Invoke-WebRequest `
    -Uri "$root/submissions" `
    -Method Post `
    -Headers $headers `
    -ContentType "text/plain" `
    -Body $Notes

$publishOperationId = Get-OperationIdFromLocation $publishResponse.Headers.Location
Wait-EdgeOperation "$root/submissions/operations/$publishOperationId" "Edge publishing" | Out-Null

Write-Host "Microsoft Edge Add-ons submission has been sent for review."
