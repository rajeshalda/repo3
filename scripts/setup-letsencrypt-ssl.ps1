# Let's Encrypt SSL Setup for Windows Server
# This will replace the self-signed certificate with a trusted one

param(
    [string]$Domain = "interval.eastus.cloudapp.azure.com",
    [string]$Email = "your-email@domain.com"
)

Write-Host "Setting up Let's Encrypt SSL Certificate for $Domain" -ForegroundColor Green

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator!"
    exit 1
}

# Step 1: Download win-acme (Windows ACME client)
Write-Host "Downloading win-acme..." -ForegroundColor Cyan
$winAcmeUrl = "https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.2.9.1701.x64.pluggable.zip"
$winAcmePath = "$env:TEMP\win-acme.zip"
$winAcmeExtractPath = "C:\win-acme"

try {
    Invoke-WebRequest -Uri $winAcmeUrl -OutFile $winAcmePath -UseBasicParsing
    
    # Extract win-acme
    if (Test-Path $winAcmeExtractPath) {
        Remove-Item $winAcmeExtractPath -Recurse -Force
    }
    Expand-Archive -Path $winAcmePath -DestinationPath $winAcmeExtractPath
    Write-Host "win-acme downloaded and extracted" -ForegroundColor Green
} catch {
    Write-Host "Failed to download win-acme. Please download manually from:" -ForegroundColor Red
    Write-Host "https://github.com/win-acme/win-acme/releases" -ForegroundColor Yellow
    exit 1
}

# Step 2: Stop IIS temporarily for domain validation
Write-Host "Stopping IIS for certificate validation..." -ForegroundColor Cyan
Stop-Service W3SVC -Force

# Step 3: Run win-acme to get certificate
Write-Host "Requesting Let's Encrypt certificate..." -ForegroundColor Cyan
$wacme = "$winAcmeExtractPath\wacs.exe"

# Create certificate request
$certArgs = @(
    "--target", "manual",
    "--host", $Domain,
    "--validation", "http-01",
    "--validationport", "80",
    "--store", "certificatestore",
    "--installation", "iis",
    "--siteid", "1",
    "--accepttos",
    "--emailaddress", $Email
)

try {
    & $wacme $certArgs
    Write-Host "Certificate requested successfully!" -ForegroundColor Green
} catch {
    Write-Host "Certificate request failed. Manual setup required." -ForegroundColor Red
    Write-Host "Run manually: $wacme --target manual --host $Domain" -ForegroundColor Yellow
}

# Step 4: Start IIS again
Write-Host "Starting IIS..." -ForegroundColor Cyan
Start-Service W3SVC

# Step 5: Update IIS binding with new certificate
Write-Host "Updating IIS SSL binding..." -ForegroundColor Cyan
try {
    Import-Module WebAdministration
    
    # Get the new certificate
    $cert = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { $_.Subject -like "*$Domain*" -and $_.Issuer -like "*Let's Encrypt*" } | Sort-Object NotAfter -Descending | Select-Object -First 1
    
    if ($cert) {
        # Remove old HTTPS binding
        Remove-WebBinding -Name "NodeJS-App" -Protocol https -Port 443 -HostHeader $Domain -ErrorAction SilentlyContinue
        
        # Add new HTTPS binding with Let's Encrypt certificate
        New-WebBinding -Name "NodeJS-App" -Protocol https -Port 443 -HostHeader $Domain -SslFlags 1
        (Get-WebBinding -Name "NodeJS-App" -Protocol https).AddSslCertificate($cert.Thumbprint, "my")
        
        Write-Host "SSL binding updated with Let's Encrypt certificate!" -ForegroundColor Green
        Write-Host "Certificate Thumbprint: $($cert.Thumbprint)" -ForegroundColor Cyan
    } else {
        Write-Host "Let's Encrypt certificate not found. Check win-acme logs." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to update IIS binding. Manual configuration required." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Let's Encrypt Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Test your site: https://$Domain" -ForegroundColor White
Write-Host "2. Certificate will auto-renew every 60 days" -ForegroundColor White
Write-Host "3. No more browser security warnings!" -ForegroundColor White 