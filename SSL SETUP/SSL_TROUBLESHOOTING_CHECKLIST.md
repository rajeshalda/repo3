# Let's Encrypt SSL Troubleshooting Checklist

## 🚨 **Quick Diagnostic Commands**

### **Check Current SSL Status:**
```powershell
# 1. Check if Let's Encrypt certificate exists
Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { $_.Issuer -like "*Let's Encrypt*" } | Select-Object Subject, Issuer, Thumbprint, NotAfter

# 2. Check IIS bindings
Get-WebBinding -Name "YOUR-SITE-NAME" | Select-Object protocol, bindingInformation, certificateHash

# 3. Check domain accessibility
curl http://yourdomain.com
curl https://yourdomain.com
```

---

## ❌ **Common Error Messages & Solutions**

### **Error: "Authorization result: invalid" with 404**
```
[yourdomain.com] Authorization result: invalid
{"type":"urn:ietf:params:acme:error:unauthorized","detail":"Invalid response from http://yourdomain.com/.well-known/acme-challenge/...: 404"}
```

**Root Cause:** IIS forwards `.well-known` requests to Node.js app, which returns 404.

**Solution:** Use `--validation selfhosting` parameter:
```powershell
C:\win-acme\wacs.exe --target manual --host yourdomain.com --validation selfhosting --store certificatestore --accepttos --emailaddress your-email@domain.com
```

---

### **Error: "Installation plugin IIS not available"**
```
Installation plugin IIS not available: No supported version of IIS detected.
```

**Root Cause:** IIS service stopped or win-acme can't detect it.

**Solution:**
```powershell
# Start IIS
Start-Service W3SVC

# Use certificate-only installation, then manual binding
C:\win-acme\wacs.exe --target manual --host yourdomain.com --validation selfhosting --store certificatestore --accepttos --emailaddress your-email@domain.com

# Then manually bind to IIS (see main guide)
```

---

### **Error: Certificate installed but browser still shows "Not secure"**

**Diagnostics:**
```powershell
# Check which certificate IIS is using
Get-WebBinding -Name "YOUR-SITE-NAME" -Protocol https | Select-Object certificateHash

# Check if it matches Let's Encrypt certificate
$cert = Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { $_.Issuer -like "*Let's Encrypt*" }
$cert.Thumbprint
```

**Solution:** Update IIS binding:
```powershell
Remove-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com"
New-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com" -SslFlags 1
(Get-WebBinding -Name "YOUR-SITE-NAME" -Protocol https).AddSslCertificate($cert.Thumbprint, "WebHosting")
```

---

### **Error: "The value must be greater than or equal to zero" (PowerShell)**
```
System.ArgumentOutOfRangeException: The value must be greater than or equal to zero and less than the console's buffer size
```

**Root Cause:** PowerShell console buffer issue.

**Solution:** 
- Resize PowerShell window
- Or run individual commands instead of long ones
- Or restart PowerShell

---

## 🔍 **Step-by-Step Diagnostic Process**

### **1. Verify Prerequisites**
```powershell
# IIS running?
Get-Service W3SVC

# Website exists?
Get-Website | Select-Object Name, State

# Domain resolves?
nslookup yourdomain.com

# Port 80/443 accessible?
Test-NetConnection -ComputerName yourdomain.com -Port 80
Test-NetConnection -ComputerName yourdomain.com -Port 443
```

### **2. Check win-acme Installation**
```powershell
# win-acme exists?
Test-Path "C:\win-acme\wacs.exe"

# Can connect to Let's Encrypt?
C:\win-acme\wacs.exe --help
```

### **3. Verify Certificate Stores**
```powershell
# Check all certificate stores for your domain
Get-ChildItem -Path "Cert:\LocalMachine\*" -Recurse | Where-Object { $_.Subject -like "*yourdomain.com*" } | Select-Object PSParentPath, Subject, Issuer, Thumbprint
```

### **4. Test Domain Validation**
```powershell
# Manual test of .well-known path
Invoke-WebRequest -Uri "http://yourdomain.com/.well-known/acme-challenge/test" -UseBasicParsing
# Should return 404 or IIS error, not Node.js app error
```

---

## 🛠️ **Recovery Procedures**

### **Rollback to Self-Signed Certificate**
```powershell
# Find old self-signed certificate
$oldCert = Get-ChildItem -Path "Cert:\LocalMachine\My" | Where-Object { $_.Subject -like "*yourdomain.com*" -and $_.Issuer -like "*yourdomain.com*" }

# Update IIS binding
Remove-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com"
New-WebBinding -Name "YOUR-SITE-NAME" -Protocol https -Port 443 -HostHeader "yourdomain.com" -SslFlags 1
(Get-WebBinding -Name "YOUR-SITE-NAME" -Protocol https).AddSslCertificate($oldCert.Thumbprint, "my")
```

### **Clean Reinstall win-acme**
```powershell
# Remove old installation
Remove-Item "C:\win-acme" -Recurse -Force -ErrorAction SilentlyContinue

# Remove scheduled task
Get-ScheduledTask -TaskName "*win-acme*" | Unregister-ScheduledTask -Confirm:$false

# Reinstall (follow main guide Step 1)
```

### **Force Certificate Renewal**
```powershell
# Manual renewal
C:\win-acme\wacs.exe --renew --baseuri "https://acme-v02.api.letsencrypt.org/"

# Check renewal logs
Get-Content "C:\ProgramData\win-acme\log\*.log" | Select-Object -Last 50
```

---

## 📝 **Debugging Logs**

### **win-acme Logs:**
```powershell
# View recent logs
Get-Content "C:\ProgramData\win-acme\log\*.log" | Select-Object -Last 100

# Log location
ls "C:\ProgramData\win-acme\log\"
```

### **IIS Logs:**
```powershell
# IIS access logs
Get-Content "C:\inetpub\logs\LogFiles\W3SVC1\*.log" | Select-Object -Last 50

# Event Viewer - IIS errors
Get-WinEvent -LogName "System" | Where-Object { $_.ProviderName -eq "Microsoft-Windows-IIS-W3SVC" } | Select-Object -First 10
```

### **Windows Event Logs:**
```powershell
# Certificate-related events
Get-WinEvent -LogName "Application" | Where-Object { $_.Message -like "*certificate*" } | Select-Object -First 10

# ACME/Let's Encrypt events
Get-WinEvent -LogName "Application" | Where-Object { $_.Message -like "*acme*" -or $_.Message -like "*encrypt*" } | Select-Object -First 10
```

---

## 🎯 **Final Verification Checklist**

### **✅ Certificate Verification:**
- [ ] Let's Encrypt certificate exists in certificate store
- [ ] Certificate subject matches your domain
- [ ] Certificate is not expired
- [ ] Certificate issuer is "Let's Encrypt Authority"

### **✅ IIS Configuration:**
- [ ] HTTPS binding exists on port 443
- [ ] HTTPS binding uses correct certificate hash
- [ ] HTTP binding exists on port 80 (for renewals)
- [ ] Website is running and accessible

### **✅ Browser Test:**
- [ ] `https://yourdomain.com` loads without warnings
- [ ] Green padlock appears in address bar
- [ ] Certificate details show Let's Encrypt issuer
- [ ] No "Not secure" or mixed content warnings

### **✅ Application Test:**
- [ ] All pages load via HTTPS
- [ ] Authentication/login works properly
- [ ] API endpoints accessible via HTTPS
- [ ] No SSL/TLS related errors in logs

### **✅ Auto-Renewal:**
- [ ] Scheduled task exists and is enabled
- [ ] Next renewal date is reasonable (~60 days)
- [ ] win-acme renewal command works manually

---

## 📞 **When to Get Help**

**Contact support if:**
- Certificate validation fails repeatedly after following troubleshooting
- Let's Encrypt returns persistent errors not covered here
- IIS bindings cannot be updated despite correct commands
- Auto-renewal fails consistently

**Include this information:**
- Domain name
- Complete error messages
- win-acme log files
- IIS binding information
- Certificate store contents
- Windows Server version and IIS version 