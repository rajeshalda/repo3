# SSL Documentation Overview

This directory contains comprehensive documentation for setting up and maintaining Let's Encrypt SSL certificates on Windows Server with IIS.

## 📚 **Documentation Files**

### **1. Main Setup Guide**
**File:** `LETS_ENCRYPT_SSL_SETUP_GUIDE.md`
- Complete step-by-step setup instructions
- Prerequisites and verification steps
- Auto-renewal configuration
- Maintenance commands
- **Use this for:** First-time SSL setup or reference

### **2. Troubleshooting Guide**
**File:** `SSL_TROUBLESHOOTING_CHECKLIST.md`
- Common error messages and solutions
- Quick diagnostic commands
- Recovery procedures
- Debug logging instructions
- **Use this for:** When SSL setup fails or issues occur

### **3. Automated Setup Script**
**File:** `lets-encrypt-setup-automated.ps1`
- Automated PowerShell script based on successful setup
- Includes pre-checks and verification
- Error handling and rollback options
- **Use this for:** Quick automated SSL setup

## 🚀 **Quick Start**

### **For New SSL Setup:**
1. Read `LETS_ENCRYPT_SSL_SETUP_GUIDE.md` first
2. Run the automated script:
   ```powershell
   .\lets-encrypt-setup-automated.ps1 -Domain "yourdomain.com" -Email "your@email.com" -SiteName "YOUR-IIS-SITE"
   ```
3. Verify using the checklist in the troubleshooting guide

### **For Troubleshooting:**
1. Use quick diagnostic commands from `SSL_TROUBLESHOOTING_CHECKLIST.md`
2. Follow specific error solutions
3. Use recovery procedures if needed

## ✅ **What This Documentation Covers**

- ✅ Complete Let's Encrypt SSL setup process
- ✅ Windows Server + IIS configuration
- ✅ Certificate store management
- ✅ IIS binding configuration
- ✅ Auto-renewal setup
- ✅ Common error solutions
- ✅ Troubleshooting procedures
- ✅ Recovery and rollback methods
- ✅ Automated setup script

## 🎯 **Based on Successful Setup**

These documents are based on the actual successful setup process for:
- **Domain:** `interval.eastus.cloudapp.azure.com`
- **Environment:** Windows Server + IIS + Node.js
- **Method:** win-acme with selfhosting validation
- **Result:** Fully trusted Let's Encrypt SSL certificate

## 📋 **Quick Reference Commands**

### **Check Certificate Status:**
```powershell
Get-ChildItem -Path "Cert:\LocalMachine\WebHosting" | Where-Object { $_.Issuer -like "*Let's Encrypt*" } | Select-Object Subject, Issuer, Thumbprint, NotAfter
```

### **Check IIS Bindings:**
```powershell
Get-WebBinding -Name "YOUR-SITE-NAME" | Select-Object protocol, bindingInformation, certificateHash
```

### **Manual Certificate Renewal:**
```powershell
C:\win-acme\wacs.exe --renew --baseuri "https://acme-v02.api.letsencrypt.org/"
```

## 🔄 **Maintenance Schedule**

- **Daily:** Auto-renewal check (automated by win-acme)
- **Monthly:** Verify renewal task is working
- **Quarterly:** Review certificate expiration dates
- **Annually:** Update documentation if process changes

## 📞 **Support Information**

If you encounter issues not covered in the troubleshooting guide:

1. Check win-acme logs: `C:\ProgramData\win-acme\log\`
2. Review IIS logs: `C:\inetpub\logs\LogFiles\`
3. Test domain accessibility: `curl https://yourdomain.com`
4. Verify certificate stores and IIS bindings

## 🎉 **Success Indicators**

Your SSL setup is working correctly when:
- ✅ Browser shows green padlock for `https://yourdomain.com`
- ✅ No "Not secure" warnings
- ✅ Certificate details show "Let's Encrypt" as issuer
- ✅ Authentication/login works without SSL errors
- ✅ Auto-renewal task is scheduled and enabled

---

*Last Updated: January 2025 - Based on successful interval.eastus.cloudapp.azure.com setup* 