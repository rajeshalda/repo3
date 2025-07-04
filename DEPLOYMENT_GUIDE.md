# Complete Windows Server Deployment Guide

## 🎯 Project Overview
Successfully deployed Next.js application with Azure AD authentication on Windows Server using IIS reverse proxy.

**Final Result:** https://mtt.centralindia.cloudapp.azure.com

## 🏗️ Architecture
```
User → Azure Domain (HTTPS) → IIS (Port 443) → Node.js App (Port 8080) → Azure AD
```

## 📋 Step-by-Step Process

### 1. Server Setup
- Azure Windows Server VM
- Install Node.js LTS
- Deploy application files
- Run `npm install`

### 2. Environment Configuration
Create `.env.local`:
```env
AZURE_AD_CLIENT_ID="18f59bee-55a1-4b61-94a4-bc22eaee83e7"
AZURE_AD_CLIENT_SECRET="sIH8Q~wYdKphJRhWZQoKQitehCtVzFHAZUSX_dq_"
AZURE_AD_TENANT_ID="d6b48afb-ae93-4180-bd0f-aa47c5c5b57b"
NEXTAUTH_URL="https://mtt.centralindia.cloudapp.azure.com"
NEXTAUTH_SECRET="kRqX9P8mN3vJ2cY5hL7wD4tF6gB1nZ0xK8sW4jH5"
```

### 3. Azure Network Security
Add inbound rules:
- Port 80 (HTTP)
- Port 443 (HTTPS)
- Port 8080 (Node.js - optional)

### 4. Domain Configuration
- Azure Portal → VM → Public IP → Configuration
- DNS name label: `mtt`
- Generated: `mtt.centralindia.cloudapp.azure.com`

### 5. IIS Installation
Install components:
- Web Server (IIS)
- Application Request Routing (ARR)
- URL Rewrite Module

### 6. SSL Certificate
```powershell
New-SelfSignedCertificate -DnsName "mtt.centralindia.cloudapp.azure.com" -CertStoreLocation "cert:\LocalMachine\My"
```

### 7. IIS Website Setup
- Create website: `NodeJS-App`
- HTTP Binding: Port 80
- HTTPS Binding: Port 443 with SSL certificate

### 8. Reverse Proxy Configuration

#### Application Request Routing:
- ✅ Enable proxy
- ✅ Enable SSL offloading
- ✅ Reverse rewrite host headers
- Reverse proxy: `localhost:8080`
- Timeout: 120 seconds

#### URL Rewrite Rule:
- Pattern: `(.*)`
- Rewrite URL: `http://localhost:8080/{R:1}`
- ✅ Append query string

### 9. Azure AD Update
Add redirect URI:
```
https://mtt.centralindia.cloudapp.azure.com/api/auth/callback/azure-ad
```

### 10. Application Startup
```powershell
npm run start
```

## ✅ Final Results

**✅ Professional URL:** No port numbers  
**✅ HTTPS Security:** SSL encryption  
**✅ Azure AD Auth:** Working perfectly  
**✅ IIS Benefits:** Better performance, monitoring  
**✅ Production Ready:** Scalable architecture  

## 🔧 Key Solutions Implemented

### Authentication Challenge
- **Issue:** Azure AD requires HTTPS/domain for redirect URIs
- **Solution:** Azure DNS domain + SSL certificate

### 502 Error Resolution
- **Issue:** IIS couldn't proxy to Node.js
- **Solution:** ARR SSL offloading + proper reverse proxy config

### Professional URLs
- **Before:** `http://98.70.26.160:8080`
- **After:** `https://mtt.centralindia.cloudapp.azure.com`

## 🚀 Benefits Achieved

1. **User Experience:** Clean, professional URLs
2. **Security:** HTTPS encryption throughout
3. **Scalability:** IIS can handle load balancing
4. **Maintainability:** Standard Windows Server deployment
5. **Integration:** Full Azure AD authentication
6. **Performance:** IIS static file serving + Node.js dynamic content

## 📝 Future Enhancements

- **Trusted SSL:** Let's Encrypt certificates
- **Custom Domain:** Purchase custom domain name
- **Monitoring:** Application Insights integration
- **Scaling:** Multiple server instances

## 🎉 Deployment Status: COMPLETE ✅

Application is live and fully functional at:
**https://mtt.centralindia.cloudapp.azure.com** 