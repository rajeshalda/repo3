# Let's Encrypt SSL Setup - Automated Script
# Based on successful setup for interval.eastus.cloudapp.azure.com
# Run as Administrator

param(
    [Parameter(Mandatory=$true)]
    [string]$Domain,
    
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [Parameter(Mandatory=$true)]
    [string]$SiteName,
    
    [switch]$SkipPreChecks
)

Write-Host "🔒 Let's Encrypt SSL Setup - Automated Script" -ForegroundColor Green
Write-Host "Domain: $Domain" -ForegroundColor Yellow
Write-Host "Email: $Email" -ForegroundColor Yellow
Write-Host "IIS Site: $SiteName" -ForegroundColor Yellow

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "❌ This script must be run as Administrator!"
    exit 1
}

# Pre-checks (unless skipped)
if (-not $SkipPreChecks) {
    Write-Host "🔍 Running pre-checks..." -ForegroundColor Cyan
    
    # Check IIS service
    $iisService = Get-Service W3SVC -ErrorAction SilentlyContinue
    if (-not $iisService -or $iisService.Status -ne "Running") {
        Write-Error "❌ IIS (W3SVC) service is not running. Please start IIS first."
        exit 1
    }
    Write-Host "✅ IIS service is running" -ForegroundColor Green
    
    # Check if website exists
    $website = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
    if (-not $website) {
        Write-Error "❌ Website '$SiteName' not found in IIS."
        exit 1
    }
    Write-Host "✅ Website '$SiteName' found" -ForegroundColor Green
    
    # Check domain connectivity
    try {
        $response = Invoke-WebRequest -Uri "http://$Domain" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Host "✅ Domain '$Domain' is accessible" -ForegroundColor Green
    } catch {
        Write-Warning "⚠️ Could not connect to http://$Domain - continuing anyway"
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Step 1: Install win-acme
Write-Host "📥 Installing win-acme..." -ForegroundColor Cyan
$winAcmeUrl = "https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.2.9.1701.x64.pluggable.zip"
$winAcmePath = "$env:TEMP\win-acme.zip"
$winAcmeExtractPath = "C:\win-acme"

if (-not (Test-Path "$winAcmeExtractPath\wacs.exe")) {
    try {
        Invoke-WebRequest -Uri $winAcmeUrl -OutFile $winAcmePath -UseBasicParsing
        if (Test-Path $winAcmeExtractPath) {
            Remove-Item $winAcmeExtractPath -Recurse -Force
        }
        Expand-Archive -Path $winAcmePath -DestinationPath $winAcmeExtractPath
        Write-Host "✅ win-acme installed successfully" -ForegroundColor Green
    } catch {
        Write-Error "❌ Failed to download/install win-acme: $($_.Exception.Message)"
        exit 1
    }
} else {
    Write-Host "✅ win-acme already installed" -ForegroundColor Green
}

# Step 2: Record current certificate (for backup)
Write-Host "📋 Recording current certificate configuration..." -ForegroundColor Cyan
$currentCerts = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { $_.Subject -like "*$Domain*" }
$currentBindings = Get-WebBinding -Name $SiteName | Select-Object protocol, bindingInformation, certificateHash

Write-Host "Current certificates:" -ForegroundColor White
$currentCerts | Select-Object Subject, Issuer, Thumbprint | Format-Table -AutoSize
Write-Host "Current bindings:" -ForegroundColor White
$currentBindings | Format-Table -AutoSize

# Step 3: Request Let's Encrypt certificate
Write-Host "🔒 Requesting Let's Encrypt certificate..." -ForegroundColor Cyan
$certCommand = "C:\win-acme\wacs.exe --target manual --host $Domain --validation selfhosting --store certificatestore --accepttos --emailaddress $Email"
Write-Host "Executing: $certCommand" -ForegroundColor White

try {
    & "C:\win-acme\wacs.exe" --target manual --host $Domain --validation selfhosting --store certificatestore --accepttos --emailaddress $Email
    if ($LASTEXITCODE -ne 0) {
        throw "win-acme exited with code $LASTEXITCODE"
    }
    Write-Host "✅ Certificate request completed" -ForegroundColor Green
} catch {
    Write-Error "❌ Certificate request failed: $($_.Exception.Message)"
    Write-Host "💡 Try running the command manually:" -ForegroundColor Yellow
    Write-Host "   $certCommand" -ForegroundColor White
    exit 1
}

# Step 4: Verify certificate installation
Write-Host "🔍 Verifying certificate installation..." -ForegroundColor Cyan
Start-Sleep -Seconds 5  # Give certificate time to be processed

$letsEncryptCert = Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { 
    $_.Subject -like "*$Domain*" -and $_.Issuer -like "*Let's Encrypt*" 
}

if (-not $letsEncryptCert) {
    Write-Error "❌ Let's Encrypt certificate not found in WebHosting store"
    Write-Host "Checking other certificate stores..." -ForegroundColor Yellow
    
    # Check if it went to My store instead
    $letsEncryptCert = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { 
        $_.Subject -like "*$Domain*" -and $_.Issuer -like "*Let's Encrypt*" 
    }
    
    if ($letsEncryptCert) {
        Write-Host "✅ Found Let's Encrypt certificate in My store" -ForegroundColor Green
        $certStore = "my"
    } else {
        Write-Error "❌ Let's Encrypt certificate not found in any store"
        exit 1
    }
} else {
    Write-Host "✅ Let's Encrypt certificate found in WebHosting store" -ForegroundColor Green
    $certStore = "WebHosting"
}

$thumbprint = $letsEncryptCert.Thumbprint
Write-Host "Certificate Details:" -ForegroundColor White
Write-Host "  Subject: $($letsEncryptCert.Subject)" -ForegroundColor White
Write-Host "  Issuer: $($letsEncryptCert.Issuer)" -ForegroundColor White
Write-Host "  Thumbprint: $thumbprint" -ForegroundColor White
Write-Host "  Expires: $($letsEncryptCert.NotAfter)" -ForegroundColor White
Write-Host "  Store: $certStore" -ForegroundColor White

# Step 5: Update IIS binding
Write-Host "🔧 Updating IIS HTTPS binding..." -ForegroundColor Cyan
Import-Module WebAdministration

try {
    # Remove existing HTTPS binding
    Write-Host "Removing existing HTTPS binding..." -ForegroundColor White
    Remove-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $Domain -ErrorAction SilentlyContinue
    
    # Create new HTTPS binding
    Write-Host "Creating new HTTPS binding..." -ForegroundColor White
    New-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $Domain -SslFlags 1
    
    # Bind Let's Encrypt certificate
    Write-Host "Binding Let's Encrypt certificate..." -ForegroundColor White
    (Get-WebBinding -Name $SiteName -Protocol https).AddSslCertificate($thumbprint, $certStore)
    
    Write-Host "✅ IIS binding updated successfully" -ForegroundColor Green
} catch {
    Write-Error "❌ Failed to update IIS binding: $($_.Exception.Message)"
    Write-Host "💡 Manual binding commands:" -ForegroundColor Yellow
    Write-Host "   Remove-WebBinding -Name '$SiteName' -Protocol https -Port 443 -HostHeader '$Domain'" -ForegroundColor White
    Write-Host "   New-WebBinding -Name '$SiteName' -Protocol https -Port 443 -HostHeader '$Domain' -SslFlags 1" -ForegroundColor White
    Write-Host "   (Get-WebBinding -Name '$SiteName' -Protocol https).AddSslCertificate('$thumbprint', '$certStore')" -ForegroundColor White
    exit 1
}

# Step 6: Verify final configuration
Write-Host "✅ Verifying final configuration..." -ForegroundColor Cyan
$finalBindings = Get-WebBinding -Name $SiteName | Select-Object protocol, bindingInformation, certificateHash
Write-Host "Updated bindings:" -ForegroundColor White
$finalBindings | Format-Table -AutoSize

# Check if HTTPS binding has the correct certificate
$httpsBinding = $finalBindings | Where-Object { $_.protocol -eq "https" }
if ($httpsBinding -and $httpsBinding.certificateHash -eq $thumbprint) {
    Write-Host "✅ HTTPS binding correctly configured with Let's Encrypt certificate" -ForegroundColor Green
} else {
    Write-Warning "⚠️ HTTPS binding certificate hash doesn't match. Expected: $thumbprint, Got: $($httpsBinding.certificateHash)"
}

# Step 7: Check auto-renewal task
Write-Host "🔄 Checking auto-renewal task..." -ForegroundColor Cyan
$renewalTask = Get-ScheduledTask -TaskName "*win-acme*" -ErrorAction SilentlyContinue
if ($renewalTask) {
    Write-Host "✅ Auto-renewal task found: $($renewalTask.TaskName)" -ForegroundColor Green
    Write-Host "   State: $($renewalTask.State)" -ForegroundColor White
    Write-Host "   Next Run: $($renewalTask.NextRunTime)" -ForegroundColor White
} else {
    Write-Warning "⚠️ Auto-renewal task not found"
}

# Final summary
Write-Host ""
Write-Host "🎉 Let's Encrypt SSL Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Yellow
Write-Host "  Domain: $Domain" -ForegroundColor White
Write-Host "  Certificate Issuer: $($letsEncryptCert.Issuer)" -ForegroundColor White
Write-Host "  Certificate Expires: $($letsEncryptCert.NotAfter)" -ForegroundColor White
Write-Host "  IIS Site: $SiteName" -ForegroundColor White
Write-Host "  Certificate Store: $certStore" -ForegroundColor White
Write-Host ""
Write-Host "🧪 Testing:" -ForegroundColor Yellow
Write-Host "  Visit: https://$Domain" -ForegroundColor White
Write-Host "  Expected: Green padlock, no security warnings" -ForegroundColor White
Write-Host ""
Write-Host "🔄 Auto-renewal:" -ForegroundColor Yellow
Write-Host "  Next renewal: ~60 days from now" -ForegroundColor White
Write-Host "  Check renewal status: Get-ScheduledTask -TaskName '*win-acme*'" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentation: docs/LETS_ENCRYPT_SSL_SETUP_GUIDE.md" -ForegroundColor Cyan 