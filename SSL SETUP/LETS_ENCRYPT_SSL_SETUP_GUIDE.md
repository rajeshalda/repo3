# Let's Encrypt SSL Certificate Setup Guide
## Windows Server + IIS + Node.js Application

### 📋 **Document Overview**
This guide provides step-by-step instructions for setting up a trusted Let's Encrypt SSL certificate on Windows Server with IIS reverse proxy for Node.js applications.

**Last Updated:** January 2025  
**Tested Environment:** Windows Server 2019/2022, IIS 10, Node.js 20+

---

## 🎯 **Prerequisites**

### **Required:**
- ✅ Windows Server with Administrator access
- ✅ IIS installed and configured
- ✅ Domain name pointing to your server (e.g., `yourdomain.cloudapp.azure.com`)
- ✅ Ports 80 and 443 open in firewall/NSG
- ✅ Node.js application running
- ✅ Valid email address for Let's Encrypt notifications

### **Pre-Setup Verification:**
```powershell
# Verify IIS is running
Get-Service W3SVC

# Verify your website exists
Get-Website | Select-Object Name, State, PhysicalPath

# Check current bindings
Get-WebBinding -Name "YOUR-SITE-NAME"

# Test domain accessibility
curl http://yourdomain.com
```

---

## 🚀 **Step-by-Step Setup Process**

### **Step 1: Download and Install win-acme**

```powershell
# Download win-acme (Windows ACME client)
$winAcmeUrl = "https://github.com/win-acme/win-acme/releases/latest/download/win-acme.v2.2.9.1701.x64.pluggable.zip"
$winAcmePath = "$env:TEMP\win-acme.zip"
$winAcmeExtractPath = "C:\win-acme"

# Download
Invoke-WebRequest -Uri $winAcmeUrl -OutFile $winAcmePath -UseBasicParsing

# Extract
if (Test-Path $winAcmeExtractPath) {
    Remove-Item $winAcmeExtractPath -Recurse -Force
}
Expand-Archive -Path $winAcmePath -DestinationPath $winAcmeExtractPath

# Verify installation
Test-Path "C:\win-acme\wacs.exe"  # Should return True
```

### **Step 2: Prepare for Certificate Request**

```powershell
# Record your current certificate (for rollback if needed)
Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { 
    $_.Subject -like "*yourdomain.com*" 
} | Select-Object Subject, Issuer, Thumbprint

# Record current IIS bindings
Get-WebBinding -Name "YOUR-SITE-NAME" | Select-Object protocol, bindingInformation, certificateHash
```

### **Step 3: Request Let's Encrypt Certificate**

**⚠️ CRITICAL:** Use the exact command format that worked:

```powershell
# Replace with your actual domain and email
C:\win-acme\wacs.exe --target manual --host yourdomain.cloudapp.azure.com --validation selfhosting --store certificatestore --accepttos --emailaddress your-email@domain.com
```

**Expected Output:**
```
✅ Connection OK!
✅ Authorization result: valid
✅ Downloading certificate
✅ Installing certificate in the certificate store
✅ Adding certificate in store WebHosting
✅ Adding Task Scheduler entry (auto-renewal)
✅ Certificate created
```

### **Step 4: Verify Certificate Installation**

```powershell
# Check if Let's Encrypt certificate was installed
Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { 
    $_.Subject -like "*yourdomain.com*" -and $_.Issuer -like "*Let's Encrypt*" 
} | Select-Object Subject, Issuer, Thumbprint, NotAfter

# Get the certificate thumbprint for IIS binding
$cert = Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { 
    $_.Subject -like "*yourdomain.com*" -and $_.Issuer -like "*Let's Encrypt*" 
}
$thumbprint = $cert.Thumbprint
Write-Host "Let's Encrypt Certificate Thumbprint: $thumbprint"
```

### **Step 5: Update IIS HTTPS Binding**

```powershell
# Import WebAdministration module
Import-Module WebAdministration

# Remove existing HTTPS binding
Remove-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com"

# Create new HTTPS binding
New-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com" -SslFlags 1

# Bind Let's Encrypt certificate
(Get-WebBinding -Name "YOUR-SITE-NAME" -Protocol https).AddSslCertificate($thumbprint, "WebHosting")
```

### **Step 6: Verify SSL Setup**

```powershell
# Check updated IIS bindings
Get-WebBinding -Name "YOUR-SITE-NAME" | Select-Object protocol, bindingInformation, certificateHash

# Verify the certificate hash matches Let's Encrypt certificate
Write-Host "IIS Certificate Hash: $(Get-WebBinding -Name 'YOUR-SITE-NAME' -Protocol https | Select-Object -ExpandProperty certificateHash)"
Write-Host "Let's Encrypt Thumbprint: $thumbprint"
```

---

## ✅ **Verification Checklist**

### **Browser Test:**
1. ✅ Visit `https://yourdomain.com`
2. ✅ Green padlock appears (no warnings)
3. ✅ Certificate details show "Let's Encrypt" issuer
4. ✅ No "Not secure" warnings

### **Certificate Details:**
```powershell
# Get certificate expiration
$cert.NotAfter  # Should be ~90 days from now

# Verify auto-renewal task
Get-ScheduledTask -TaskName "*win-acme*"
```

### **Application Test:**
1. ✅ HTTPS site loads properly
2. ✅ Authentication works (no NextAuth errors)
3. ✅ All API endpoints accessible via HTTPS

---

## 🔄 **Auto-Renewal Information**

Let's Encrypt certificates automatically renew every 60-90 days.

### **Renewal Task Details:**
- **Task Name:** `win-acme renew (acme-v02.api.letsencrypt.org)`
- **Location:** Task Scheduler → Task Scheduler Library
- **Runs:** Daily at 9:00 AM (with 4-hour random delay)
- **Command:** `C:\win-acme\wacs.exe --renew --baseuri "https://acme-v02.api.letsencrypt.org/"`

### **Check Renewal Status:**
```powershell
# Check scheduled task
Get-ScheduledTask -TaskName "*win-acme*" | Select-Object TaskName, State, LastRunTime, NextRunTime

# Manual renewal test (optional)
C:\win-acme\wacs.exe --renew --baseuri "https://acme-v02.api.letsencrypt.org/"
```

---

## 🚨 **Common Issues & Solutions**

### **Issue 1: "Authorization result: invalid" - 404 Error**

**Cause:** IIS forwards `.well-known` requests to Node.js app, which returns 404.

**Solution:** Use `--validation selfhosting` (as documented above)

**Alternative:** Add URL rewrite exception for `.well-known` paths in IIS

### **Issue 2: "Installation plugin IIS not available"**

**Cause:** IIS service stopped or not detected.

**Solution:** 
```powershell
# Ensure IIS is running
Start-Service W3SVC
# Use certificate-only installation, then manual IIS binding
```

### **Issue 3: Certificate in wrong store**

**Cause:** win-acme installs in `WebHosting` store, IIS expects `My` store.

**Solution:** Use `"WebHosting"` parameter in AddSslCertificate command (as documented)

### **Issue 4: Domain validation fails**

**Prerequisites Check:**
```powershell
# Verify DNS resolution
nslookup yourdomain.com

# Check port 80 accessibility
Test-NetConnection -ComputerName yourdomain.com -Port 80

# Verify firewall rules
Get-NetFirewallRule -DisplayName "*HTTP*" | Select-Object DisplayName, Enabled, Direction
```

### **Issue 5: Renewal failures**

**Check renewal logs:**
```powershell
# Check win-acme logs
Get-Content "C:\ProgramData\win-acme\log\*.log" | Select-Object -Last 50
```

---

## 🛠️ **Maintenance Commands**

### **Certificate Management:**
```powershell
# List all certificates for your domain
Get-ChildItem -Path "Cert:\LocalMachine\*" -Recurse | Where-Object { 
    $_.Subject -like "*yourdomain.com*" 
} | Select-Object PSParentPath, Subject, Issuer, Thumbprint

# Remove old self-signed certificates (after verifying Let's Encrypt works)
Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { 
    $_.Subject -like "*yourdomain.com*" -and $_.Issuer -like "*yourdomain.com*" 
} | Remove-Item

# Check certificate expiration
$cert = Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { 
    $_.Subject -like "*yourdomain.com*" -and $_.Issuer -like "*Let's Encrypt*" 
}
Write-Host "Certificate expires: $($cert.NotAfter)"
Write-Host "Days remaining: $((($cert.NotAfter) - (Get-Date)).Days)"
```

### **IIS Binding Management:**
```powershell
# List all website bindings
Get-Website | ForEach-Object { 
    Get-WebBinding -Name $_.Name | Select-Object @{Name="Site";Expression={$_.ItemXPath.Split('/')[-1].Split('[')[0]}}, protocol, bindingInformation, certificateHash 
}

# Reset IIS (if needed)
iisreset
```

---

## 📁 **Quick Reference Commands**

### **One-liner Certificate Check:**
```powershell
Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { $_.Issuer -like "*Let's Encrypt*" } | Select-Object Subject, Issuer, Thumbprint, NotAfter | Format-Table -AutoSize
```

### **One-liner IIS Binding Check:**
```powershell
Get-WebBinding | Where-Object { $_.protocol -eq "https" } | Select-Object @{Name="Site";Expression={$_.ItemXPath.Split('/')[-1].Split('[')[0]}}, bindingInformation, certificateHash
```

### **Emergency Rollback (if needed):**
```powershell
# If Let's Encrypt certificate causes issues, rollback to self-signed
$oldCert = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { $_.Subject -like "*yourdomain.com*" }
Remove-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com"
New-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com" -SslFlags 1
(Get-WebBinding -Name "YOUR-SITE-NAME" -Protocol https).AddSslCertificate($oldCert.Thumbprint, "my")
```

---

## 📞 **Support & Troubleshooting**

### **Log Locations:**
- **win-acme logs:** `C:\ProgramData\win-acme\log\`
- **IIS logs:** `C:\inetpub\logs\LogFiles\`
- **Windows Event Logs:** Event Viewer → Windows Logs → Application

### **Useful URLs:**
- **Let's Encrypt Status:** https://letsencrypt.status.io/
- **win-acme Documentation:** https://www.win-acme.com/
- **Certificate Checker:** https://www.ssllabs.com/ssltest/

### **Emergency Contacts:**
- Document the person responsible for SSL certificate management
- Keep renewal notification email accessible

---

## 🎯 **Success Criteria**

After completing this setup, you should have:

✅ **Trusted SSL Certificate**
- Green padlock in browser
- No security warnings
- Certificate issued by "Let's Encrypt Authority"

✅ **Automatic Renewal**
- Scheduled task created and enabled
- Next renewal scheduled for ~60 days

✅ **Proper IIS Configuration**
- HTTPS binding using Let's Encrypt certificate
- HTTP to HTTPS redirect (optional)

✅ **Application Functionality**
- All pages load via HTTPS
- Authentication working properly
- API endpoints accessible

**Total Setup Time:** 5-10 minutes  
**Certificate Validity:** 90 days (auto-renews every 60 days)  
**Cost:** Free

---

*This document should be reviewed and updated whenever the SSL setup process changes or new issues are discovered.* 