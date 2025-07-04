# Windows Server Deployment Guide - Next.js with Azure AD

## 🎯 Overview

This guide documents the complete deployment of a Next.js application with Azure AD authentication on Windows Server using IIS reverse proxy and Azure domain configuration.

## 🏆 Final Result

✅ **Live Application:** `https://mtt.centralindia.cloudapp.azure.com`  
✅ **Professional domain** (no port numbers)  
✅ **HTTPS/SSL** enabled  
✅ **Azure AD authentication** working  
✅ **IIS reverse proxy** configured  
✅ **Production-ready deployment**

---

## 📋 Prerequisites

- Azure Windows Server VM
- Next.js application with Azure AD integration
- Administrator access to Windows Server
- Azure Portal access

## 🚀 Deployment Process

### Step 1: Server Preparation

#### Install Node.js on Windows Server
1. Download Node.js LTS from https://nodejs.org
2. Install with "Add to PATH" option
3. Verify installation:
   ```powershell
   node --version
   npm --version
   ```

#### Deploy Application Files
1. Copy project folder to server (e.g., `C:\apps\your-app`)
2. Install dependencies:
   ```powershell
   npm install
   ```

### Step 2: Environment Configuration

Create `.env.local` file in project root:

```env
# Azure AD Configuration
AZURE_AD_CLIENT_ID="your_client_id"
AZURE_AD_CLIENT_SECRET="your_client_secret"
AZURE_AD_TENANT_ID="your_tenant_id"

# Application Permissions (same as above if using same app registration)
AZURE_AD_APP_CLIENT_ID="your_app_client_id"
AZURE_AD_APP_CLIENT_SECRET="your_app_client_secret"
AZURE_AD_APP_TENANT_ID="your_app_tenant_id"

# NextAuth Configuration
NEXTAUTH_URL="https://your-domain.cloudapp.azure.com"
NEXTAUTH_SECRET="your_generated_secret"

# Azure OpenAI (if applicable)
AZURE_OPENAI_ENDPOINT="your_openai_endpoint"
AZURE_OPENAI_API_KEY="your_openai_api_key"
AZURE_OPENAI_DEPLOYMENT="your_deployment_name"
```

### Step 3: Azure Network Security Configuration

#### Add Firewall Rules in Azure Portal
1. Navigate to **VM → Networking**
2. Add inbound port rules:

| Service | Port | Protocol | Action | Priority | Name |
|---------|------|----------|--------|----------|------|
| HTTP | 80 | TCP | Allow | 300 | HTTP-Web-Access |
| HTTPS | 443 | TCP | Allow | 310 | HTTPS-Web-Access |
| Custom | 8080 | TCP | Allow | 320 | NodeJS-Direct-Access |

### Step 4: Azure Domain Setup

#### Configure Azure DNS Name
1. **Azure Portal → VM → Overview**
2. **Click Public IP Address**
3. **Configuration → DNS name label:** Enter desired name (e.g., `mtt`)
4. **Save**
5. **Result:** `your-name.region.cloudapp.azure.com`

### Step 5: IIS Installation

#### Install IIS with Required Modules
1. **Server Manager → Add Roles and Features**
2. **Server Roles:** Web Server (IIS)
3. **Additional modules to install:**
   - Application Request Routing (ARR)
   - URL Rewrite Module

#### Install Application Request Routing
```powershell
# Option 1: Web Platform Installer
# Download and install ARR 3.0

# Option 2: Direct download from IIS.net
# Install URL Rewrite Module 2.1
```

### Step 6: SSL Certificate Creation

#### Generate Self-Signed Certificate
```powershell
# Run as Administrator
New-SelfSignedCertificate -DnsName "your-domain.cloudapp.azure.com" -CertStoreLocation "cert:\LocalMachine\My" -FriendlyName "Domain-SSL-Cert"
```

### Step 7: IIS Website Configuration

#### Create Website
1. **IIS Manager → Sites → Add Website**
2. **Configuration:**
   - Site name: `NodeJS-App`
   - Physical path: `C:\inetpub\wwwroot\nodeapp`
   - Binding: HTTP, Port 80, All Unassigned

#### Add HTTPS Binding
1. **Right-click site → Edit Bindings**
2. **Add → HTTPS:**
   - Type: https
   - Port: 443
   - Host name: `your-domain.cloudapp.azure.com`
   - SSL certificate: Select your created certificate

### Step 8: Application Request Routing Configuration

#### Enable Proxy at Server Level
1. **IIS Manager → Server root**
2. **Application Request Routing Cache**
3. **Server Proxy Settings:**
   - ✅ Enable proxy
   - ✅ Reverse rewrite host in response headers
   - **Timeout:** 120 seconds
   - ✅ Keep alive

#### Configure Proxy Type Settings
1. **Proxy Type section:**
   - ✅ Use URL Rewrite to inspect incoming requests
   - ✅ Enable SSL offloading
   - **Reverse proxy:** `localhost:8080`

### Step 9: URL Rewrite Configuration

#### Create Reverse Proxy Rule
1. **Site level → URL Rewrite**
2. **Add Rule → Blank Rule:**
   - **Name:** NodeJSProxy
   - **Pattern:** `(.*)`
   - **Action Type:** Rewrite
   - **Rewrite URL:** `http://localhost:8080/{R:1}`
   - ✅ Append query string
   - ✅ Stop processing

### Step 10: Azure AD App Registration Update

#### Update Redirect URI
1. **Azure Portal → App Registrations → Your App**
2. **Authentication → Redirect URIs**
3. **Add:** `https://your-domain.cloudapp.azure.com/api/auth/callback/azure-ad`
4. **Remove any localhost or IP-based URIs**
5. **Save**

### Step 11: Application Startup

#### Start Node.js Application
```powershell
cd C:\path\to\your\app
npm run start
```

#### Verify Services
```powershell
# Check port usage
netstat -an | findstr :8080  # Node.js
netstat -an | findstr :443   # IIS HTTPS
netstat -an | findstr :80    # IIS HTTP

# Test direct Node.js access
curl http://localhost:8080
```

---

## 🔧 Architecture Overview

```
Internet Traffic
       ↓
https://your-domain.cloudapp.azure.com
       ↓
Azure Load Balancer (Port 443)
       ↓
Windows Server IIS (Port 443)
       ↓
SSL Termination & URL Rewrite
       ↓
Node.js Application (localhost:8080)
       ↓
Azure AD Authentication Flow
```

## 🛠️ Troubleshooting

### Common Issues and Solutions

#### 502 Bad Gateway Error
- **Check:** Node.js app is running on port 8080
- **Check:** ARR proxy settings are correct
- **Check:** SSL offloading is enabled
- **Fix:** Restart IIS and Node.js app

#### SSL/Certificate Warnings
- **Expected:** Self-signed certificates show "Not Secure"
- **Solution:** Accept certificate or use Let's Encrypt for trusted certificate

#### Azure AD Authentication Errors
- **Check:** NEXTAUTH_URL matches your domain exactly
- **Check:** Redirect URI is properly configured in Azure AD
- **Check:** All Azure AD credentials are correct in .env.local

#### Port Access Issues
- **Check:** Azure Network Security Group rules
- **Check:** Windows Firewall settings
- **Test:** Direct access to localhost:8080 on server

## 📊 Performance Optimizations

### IIS Optimizations
- **Static Content:** IIS serves static files efficiently
- **Compression:** Enable HTTP compression
- **Caching:** Configure appropriate cache headers

### Application Optimizations
- **PM2 Process Management:** Already configured
- **Memory Management:** Monitor and adjust as needed
- **Database:** SQLite for simplicity (consider upgrade for scale)

## 🔐 Security Considerations

### Current Security Features
- ✅ HTTPS encryption
- ✅ Azure AD authentication
- ✅ IIS request filtering
- ✅ Network security groups

### Production Security Enhancements
- **Trusted SSL Certificate:** Let's Encrypt or commercial
- **Security Headers:** HSTS, CSP, etc.
- **Rate Limiting:** Application-level or IIS-level
- **Monitoring:** Application Insights, IIS logs

## 🚀 Future Enhancements

### Immediate Improvements
1. **Let's Encrypt SSL:** Free trusted certificates with auto-renewal
2. **Custom Domain:** Purchase and configure custom domain
3. **Monitoring:** Application Insights integration

### Scaling Options
1. **Load Balancing:** Multiple server instances
2. **Database Upgrade:** PostgreSQL or SQL Server
3. **CDN Integration:** Azure CDN for static content
4. **Container Deployment:** Docker containerization

## 📝 Maintenance Tasks

### Regular Maintenance
- **SSL Certificate Renewal:** Every 90 days (automated with Let's Encrypt)
- **Windows Updates:** Monthly security updates
- **Application Updates:** Deploy via CI/CD pipeline
- **Backup:** Database and configuration files

### Monitoring
- **IIS Logs:** Monitor for errors and performance
- **Application Logs:** PM2 logs for Node.js app
- **Azure Metrics:** VM performance and networking

---

## ✅ Deployment Checklist

- [ ] Windows Server provisioned
- [ ] Node.js installed
- [ ] Application files deployed
- [ ] .env.local configured
- [ ] Azure firewall rules added
- [ ] Azure domain configured
- [ ] IIS installed with ARR and URL Rewrite
- [ ] SSL certificate created and bound
- [ ] IIS reverse proxy configured
- [ ] Azure AD redirect URI updated
- [ ] Application tested and working
- [ ] HTTPS access verified
- [ ] Authentication flow tested

## 🎉 Success Metrics

**✅ Professional URL:** No port numbers in user-facing URLs  
**✅ Security:** HTTPS encryption throughout  
**✅ Authentication:** Azure AD integration working  
**✅ Performance:** IIS handling static content efficiently  
**✅ Scalability:** Ready for production traffic  
**✅ Maintainability:** Clear architecture and documentation

---

## 📞 Support Information

For issues or questions:
1. Check troubleshooting section above
2. Review IIS logs: `C:\inetpub\logs\LogFiles\W3SVC1\`
3. Check Node.js logs via PM2: `pm2 logs`
4. Verify Azure Network Security Group settings

**Deployment Status:** ✅ **COMPLETE AND OPERATIONAL**

---

*Last Updated: [Current Date]*  
*Deployed Application: https://mtt.centralindia.cloudapp.azure.com* 