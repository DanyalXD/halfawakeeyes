$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    npm.cmd --prefix functions ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

    firebase.cmd deploy --project half-awake-eyes --only "functions:getAdminStorePayments,functions:getAdminStorePayment,functions:refundAdminStorePayment"
    if ($LASTEXITCODE -ne 0) { throw 'SumUp Functions deployment failed.' }

    Write-Host 'SumUp Functions deployed. Publish website changes through GitHub Pages.'
} finally {
    Pop-Location
}
