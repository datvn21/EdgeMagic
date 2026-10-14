$ErrorActionPreference = "Stop"

$project = Join-Path $PSScriptRoot "EdgeMagic.App\EdgeMagic.App.csproj"
$buildArgs = @(
    "build", $project,
    "-c", "Release",
    "-p:Platform=x64",
    "-p:WindowsPackageType=MSIX",
    "-p:EnableMsixTooling=true",
    "-p:GenerateAppxPackageOnBuild=true",
    "-p:AppxPackageSigningEnabled=false",
    "-p:AppxSymbolPackageEnabled=false",
    "-p:AppxLogTelemetryFromSideloadingScript=false"
)
& dotnet @buildArgs
if ($LASTEXITCODE -ne 0) { throw "MSIX build failed with exit code $LASTEXITCODE." }

$package = Get-ChildItem (Join-Path $PSScriptRoot "EdgeMagic.App\AppPackages") -Filter "EdgeMagic.App_0.1.0.0_x64.msix" -File -Recurse |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $package) { throw "MSIX build completed but no x64 package was found." }

$publisher = "CN=EdgeMagic Local"
$certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $publisher -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) } |
    Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $certificate) {
    $certificate = New-SelfSignedCertificate -Type CodeSigningCert -Subject $publisher `
        -CertStoreLocation Cert:\CurrentUser\My -KeyAlgorithm RSA -KeyLength 2048 `
        -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(2)
}

$sdkBin = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
$signTool = Get-ChildItem $sdkBin -Filter SignTool.exe -File -Recurse |
    Where-Object { $_.Directory.Name -eq "x64" } |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
    Select-Object -First 1
if (-not $signTool) { throw "SignTool.exe was not found in the Windows 10 SDK." }

& $signTool.FullName sign /fd SHA256 /s My /sha1 $certificate.Thumbprint $package.FullName
if ($LASTEXITCODE -ne 0) { throw "MSIX signing failed with exit code $LASTEXITCODE." }
Export-Certificate -Cert $certificate -FilePath (Join-Path $package.DirectoryName "EdgeMagic_Local.cer") -Force | Out-Null

Write-Host "Package: $($package.FullName)"
Write-Host "Certificate: $(Join-Path $package.DirectoryName 'EdgeMagic_Local.cer')"
Write-Host "Run the generated Install.ps1 beside the package to install. It will ask before trusting the local development certificate."
