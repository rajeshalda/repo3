# IIS Configuration Check Script
# Run this as Administrator to check your deployment setup

Write-Host "=== IIS Configuration Check ===" -ForegroundColor Green
Write-Host ""

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ This script must be run as Administrator!" -ForegroundColor Red
    exit 1
}

# 1. Check IIS Service Status
Write-Host "1. Checking IIS Service Status..." -ForegroundColor Cyan
$iisService = Get-Service W3SVC
if ($iisService.Status -eq "Running") {
    Write-Host "✅ IIS is running" -ForegroundColor Green
} else {
    Write-Host "❌ IIS is not running. Status: $($iisService.Status)" -ForegroundColor Red
}
Write-Host ""

# 2. Check if Application Request Routing is installed
Write-Host "2. Checking Application Request Routing..." -ForegroundColor Cyan
try {
    Import-Module WebAdministration
    $arrModule = Get-WebGlobalModule -Name "ApplicationRequestRouting"
    if ($arrModule) {
        Write-Host "✅ Application Request Routing is installed" -ForegroundColor Green
    } else {
        Write-Host "❌ Application Request Routing is NOT installed" -ForegroundColor Red
        Write-Host "   Download from: https://www.iis.net/downloads/microsoft/application-request-routing" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error checking ARR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 3. Check if URL Rewrite is installed
Write-Host "3. Checking URL Rewrite Module..." -ForegroundColor Cyan
try {
    $urlRewriteModule = Get-WebGlobalModule -Name "RewriteModule"
    if ($urlRewriteModule) {
        Write-Host "✅ URL Rewrite Module is installed" -ForegroundColor Green
    } else {
        Write-Host "❌ URL Rewrite Module is NOT installed" -ForegroundColor Red
        Write-Host "   Download from: https://www.iis.net/downloads/microsoft/url-rewrite" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error checking URL Rewrite: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 4. Check Website Configuration
Write-Host "4. Checking Website Configuration..." -ForegroundColor Cyan
try {
    $websites = Get-Website
    $meetingTrackerSite = $websites | Where-Object { $_.Name -eq "MeetingTracker" }
    
    if ($meetingTrackerSite) {
        Write-Host "✅ MeetingTracker website exists" -ForegroundColor Green
        Write-Host "   State: $($meetingTrackerSite.State)" -ForegroundColor White
        Write-Host "   Physical Path: $($meetingTrackerSite.PhysicalPath)" -ForegroundColor White
        
        # Check bindings
        $bindings = Get-WebBinding -Name "MeetingTracker"
        Write-Host "   Bindings:" -ForegroundColor White
        foreach ($binding in $bindings) {
            Write-Host "     $($binding.Protocol) : $($binding.BindingInformation)" -ForegroundColor White
        }
    } else {
        Write-Host "❌ MeetingTracker website does not exist" -ForegroundColor Red
        Write-Host "   Available websites:" -ForegroundColor Yellow
        foreach ($site in $websites) {
            Write-Host "     - $($site.Name)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Error checking websites: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 5. Check SSL Certificate
Write-Host "5. Checking SSL Certificate..." -ForegroundColor Cyan
try {
    $certificates = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { 
        $_.Subject -like "*10.2.0.1*" -or $_.Subject -like "*192.168.1.100*" 
    }
    
    if ($certificates) {
        Write-Host "✅ SSL Certificate found:" -ForegroundColor Green
        foreach ($cert in $certificates) {
            Write-Host "   Subject: $($cert.Subject)" -ForegroundColor White
            Write-Host "   Thumbprint: $($cert.Thumbprint)" -ForegroundColor White
            Write-Host "   Valid Until: $($cert.NotAfter)" -ForegroundColor White
        }
    } else {
        Write-Host "❌ No SSL certificate found for your IP" -ForegroundColor Red
        Write-Host "   Run: New-SelfSignedCertificate -DnsName '10.2.0.1' -CertStoreLocation 'cert:\LocalMachine\My'" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error checking certificates: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 6. Check Application Request Routing Settings
Write-Host "6. Checking ARR Proxy Settings..." -ForegroundColor Cyan
try {
    $arrSettings = Get-WebConfigurationProperty -Filter "system.webServer/proxy" -Name "enabled"
    if ($arrSettings -eq $true) {
        Write-Host "✅ ARR Proxy is enabled" -ForegroundColor Green
    } else {
        Write-Host "❌ ARR Proxy is NOT enabled" -ForegroundColor Red
        Write-Host "   Enable in IIS Manager: Server → Application Request Routing Cache → Server Proxy Settings" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error checking ARR settings: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 7. Check URL Rewrite Rules
Write-Host "7. Checking URL Rewrite Rules..." -ForegroundColor Cyan
try {
    $rewriteRules = Get-WebConfigurationProperty -Filter "system.webServer/rewrite/rules/rule" -Name "name" -PSPath "IIS:\Sites\MeetingTracker"
    if ($rewriteRules) {
        Write-Host "✅ URL Rewrite rules found:" -ForegroundColor Green
        foreach ($rule in $rewriteRules) {
            Write-Host "   - $rule" -ForegroundColor White
        }
    } else {
        Write-Host "❌ No URL Rewrite rules found" -ForegroundColor Red
        Write-Host "   Create rule: Pattern (.*) → Rewrite URL http://localhost:8080/{R:1}" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error checking rewrite rules: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 8. Check if Node.js app is running
Write-Host "8. Checking Node.js Application..." -ForegroundColor Cyan
try {
    $nodeProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcess) {
        Write-Host "✅ Node.js process is running" -ForegroundColor Green
        Write-Host "   Process ID: $($nodeProcess.Id)" -ForegroundColor White
    } else {
        Write-Host "❌ Node.js process is NOT running" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error checking Node.js: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 9. Check if port 8080 is listening
Write-Host "9. Checking Port 8080..." -ForegroundColor Cyan
$port8080 = netstat -an | Select-String ":8080"
if ($port8080) {
    Write-Host "✅ Port 8080 is listening:" -ForegroundColor Green
    foreach ($line in $port8080) {
        Write-Host "   $line" -ForegroundColor White
    }
} else {
    Write-Host "❌ Port 8080 is NOT listening" -ForegroundColor Red
}
Write-Host ""

# 10. Check PM2 Status
Write-Host "10. Checking PM2 Status..." -ForegroundColor Cyan
try {
    $pm2Status = pm2 status 2>$null
    if ($pm2Status) {
        Write-Host "✅ PM2 is running:" -ForegroundColor Green
        Write-Host $pm2Status -ForegroundColor White
    } else {
        Write-Host "❌ PM2 is NOT running or no processes found" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error checking PM2: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 11. Test local access
Write-Host "11. Testing Local Access..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Local access to localhost:8080 successful" -ForegroundColor Green
        Write-Host "   Status Code: $($response.StatusCode)" -ForegroundColor White
    } else {
        Write-Host "⚠️ Local access returned status: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Local access failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 12. Check Windows Firewall
Write-Host "12. Checking Windows Firewall..." -ForegroundColor Cyan
$firewallRules = Get-NetFirewallRule -DisplayName "*HTTP*", "*HTTPS*", "*8080*" -ErrorAction SilentlyContinue
if ($firewallRules) {
    Write-Host "✅ Firewall rules found:" -ForegroundColor Green
    foreach ($rule in $firewallRules) {
        Write-Host "   - $($rule.DisplayName) ($($rule.Enabled))" -ForegroundColor White
    }
} else {
    Write-Host "⚠️ No specific firewall rules found for web traffic" -ForegroundColor Yellow
}
Write-Host ""

# 13. Check network connectivity
Write-Host "13. Checking Network Connectivity..." -ForegroundColor Cyan
$serverIP = "10.2.0.1"
try {
    $ping = Test-Connection -ComputerName $serverIP -Count 1 -Quiet
    if ($ping) {
        Write-Host "✅ Server IP $serverIP is reachable" -ForegroundColor Green
    } else {
        Write-Host "❌ Server IP $serverIP is NOT reachable" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error testing connectivity: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== Configuration Check Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "If you see ❌ errors above, fix them before testing external access." -ForegroundColor Yellow
Write-Host "If all checks pass ✅, try accessing https://10.2.0.1" -ForegroundColor Green 