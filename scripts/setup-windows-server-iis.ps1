# Windows Server IIS Setup Script for Node.js Application
# Run as Administrator

param(
    [string]$Domain = "interval.eastus.cloudapp.azure.com",
    [string]$AppPath = "C:\Users\rajeshalda\Documents\GitHub\repo3",
    [int]$NodePort = 8080
)

Write-Host "🚀 Setting up IIS Reverse Proxy for Node.js Application" -ForegroundColor Green
Write-Host "Domain: $Domain" -ForegroundColor Yellow
Write-Host "App Path: $AppPath" -ForegroundColor Yellow
Write-Host "Node Port: $NodePort" -ForegroundColor Yellow

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator!"
    exit 1
}

# Step 1: Install IIS and required features
Write-Host "📦 Installing IIS and required features..." -ForegroundColor Cyan
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpErrors -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpLogging -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-RequestMonitor -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-NetFxExtensibility45 -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-NetFxExtensibility -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HealthAndDiagnostics -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpCompressionStatic -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-Security -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-RequestFiltering -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-StaticContent -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-DefaultDocument -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-DirectoryBrowsing -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-ASPNET45 -All

Write-Host "✅ IIS installation completed" -ForegroundColor Green

# Step 2: Download and install URL Rewrite Module
Write-Host "📥 Downloading URL Rewrite Module..." -ForegroundColor Cyan
$urlRewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi"
$urlRewritePath = "$env:TEMP\rewrite_amd64_en-US.msi"

try {
    Invoke-WebRequest -Uri $urlRewriteUrl -OutFile $urlRewritePath -UseBasicParsing
    Write-Host "Installing URL Rewrite Module..." -ForegroundColor Cyan
    Start-Process msiexec -ArgumentList "/i", $urlRewritePath, "/quiet" -Wait
    Write-Host "✅ URL Rewrite Module installed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Please manually install URL Rewrite Module from https://www.iis.net/downloads/microsoft/url-rewrite" -ForegroundColor Yellow
}

# Step 3: Download and install Application Request Routing
Write-Host "📥 Downloading Application Request Routing..." -ForegroundColor Cyan
$arrUrl = "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi"
$arrPath = "$env:TEMP\requestRouter_amd64.msi"

try {
    Invoke-WebRequest -Uri $arrUrl -OutFile $arrPath -UseBasicParsing
    Write-Host "Installing Application Request Routing..." -ForegroundColor Cyan
    Start-Process msiexec -ArgumentList "/i", $arrPath, "/quiet" -Wait
    Write-Host "✅ Application Request Routing installed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Please manually install ARR from https://www.iis.net/downloads/microsoft/application-request-routing" -ForegroundColor Yellow
}

# Step 4: Create SSL Certificate
Write-Host "🔒 Creating SSL Certificate for $Domain..." -ForegroundColor Cyan
try {
    $cert = New-SelfSignedCertificate -DnsName $Domain -CertStoreLocation "cert:\LocalMachine\My" -FriendlyName "Azure-Domain-SSL"
    Write-Host "✅ SSL Certificate created with thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
    $certThumbprint = $cert.Thumbprint
} catch {
    Write-Error "Failed to create SSL certificate: $($_.Exception.Message)"
    exit 1
}

# Step 5: Configure Windows Firewall
Write-Host "🔥 Configuring Windows Firewall..." -ForegroundColor Cyan
New-NetFirewallRule -DisplayName "Allow HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Allow HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Allow Node.js" -Direction Inbound -Protocol TCP -LocalPort $NodePort -Action Allow -ErrorAction SilentlyContinue
Write-Host "✅ Firewall rules configured" -ForegroundColor Green

# Step 6: Import WebAdministration module and create website
Write-Host "🌐 Creating IIS Website..." -ForegroundColor Cyan
Import-Module WebAdministration

# Remove default website if exists
try {
    Remove-Website -Name "Default Web Site" -ErrorAction SilentlyContinue
} catch {
    Write-Host "Default website already removed or doesn't exist" -ForegroundColor Yellow
}

# Create physical directory
$websitePath = "C:\inetpub\wwwroot\nodeapp"
if (!(Test-Path $websitePath)) {
    New-Item -Path $websitePath -ItemType Directory -Force
}

# Create a simple index.html for testing
@"
<!DOCTYPE html>
<html>
<head><title>Node.js App Proxy</title></head>
<body><h1>IIS Reverse Proxy Active</h1><p>This will redirect to your Node.js app.</p></body>
</html>
"@ | Out-File -FilePath "$websitePath\index.html" -Encoding UTF8

# Create website with HTTP binding
New-Website -Name "NodeJS-App" -PhysicalPath $websitePath -Port 80
Write-Host "✅ Website created with HTTP binding" -ForegroundColor Green

# Add HTTPS binding with SSL certificate
New-WebBinding -Name "NodeJS-App" -Protocol https -Port 443 -HostHeader $Domain -SslFlags 1
try {
    (Get-WebBinding -Name "NodeJS-App" -Protocol https).AddSslCertificate($certThumbprint, "my")
    Write-Host "✅ HTTPS binding created with SSL certificate" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Manual SSL binding required in IIS Manager" -ForegroundColor Yellow
}

# Step 7: Configure Application Request Routing at server level
Write-Host "⚙️  Configuring Application Request Routing..." -ForegroundColor Cyan

# Enable proxy at server level
Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "enabled" -Value $true
Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "reverseRewriteHostInResponseHeaders" -Value $true
Set-WebConfigurationProperty -PSPath "MACHINE/WEBROOT/APPHOST" -Filter "system.webServer/proxy" -Name "timeout" -Value "00:02:00"

Write-Host "✅ ARR server-level configuration completed" -ForegroundColor Green

# Step 8: Create URL Rewrite rule for reverse proxy
Write-Host "🔄 Creating URL Rewrite rule..." -ForegroundColor Cyan

$webConfigPath = "$websitePath\web.config"
$webConfigContent = @"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <system.webServer>
        <rewrite>
            <rules>
                <rule name="ReverseProxyInboundRule1" stopProcessing="true">
                    <match url="(.*)" />
                    <action type="Rewrite" url="http://localhost:$NodePort/{R:1}" appendQueryString="true" />
                </rule>
            </rules>
        </rewrite>
    </system.webServer>
</configuration>
"@

$webConfigContent | Out-File -FilePath $webConfigPath -Encoding UTF8
Write-Host "✅ URL Rewrite rule created" -ForegroundColor Green

# Step 9: Test Node.js application
Write-Host "🧪 Testing Node.js application..." -ForegroundColor Cyan
Push-Location $AppPath
try {
    # Install dependencies if needed
    if (!(Test-Path "node_modules")) {
        Write-Host "Installing Node.js dependencies..." -ForegroundColor Cyan
        npm install
    }
    
    Write-Host "✅ Node.js application is ready" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Please run 'npm install' in $AppPath manually" -ForegroundColor Yellow
} finally {
    Pop-Location
}

# Step 10: Setup PM2 as Windows Service
Write-Host "🔧 Setting up PM2 as Windows Service..." -ForegroundColor Cyan
Push-Location $AppPath
try {
    # Install pm2-windows-startup globally if not present
    npm list -g pm2-windows-startup | Out-Null
    if ($LASTEXITCODE -ne 0) {
        npm install -g pm2-windows-startup
    }
    
    # Setup PM2 startup
    pm2-startup install
    Write-Host "✅ PM2 configured as Windows Service" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Please run 'npm install -g pm2-windows-startup' and 'pm2-startup install' manually" -ForegroundColor Yellow
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Start your Node.js application:"
Write-Host "   cd $AppPath"
Write-Host "   npm run start"
Write-Host ""
Write-Host "2. Update Azure AD redirect URI to:"
Write-Host "   https://$Domain/api/auth/callback/azure-ad"
Write-Host ""
Write-Host "3. Test your application:"
Write-Host "   HTTP:  http://$Domain"
Write-Host "   HTTPS: https://$Domain"
Write-Host ""
Write-Host "4. Check IIS Manager for final configuration verification"
Write-Host ""
Write-Host "SSL Certificate Thumbprint: $certThumbprint" -ForegroundColor Cyan