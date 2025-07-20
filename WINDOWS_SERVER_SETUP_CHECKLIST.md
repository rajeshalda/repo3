# Windows Server IIS Setup Checklist
## For: interval.eastus.cloudapp.azure.com

### ✅ **Step 1: Install IIS Components**
Run in PowerShell as Administrator:
```powershell
# Enable IIS
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-StaticContent -All
Enable-WindowsOptionalFeature -Online -FeatureName IIS-DefaultDocument -All
```

### ✅ **Step 2: Download Required Modules**
1. **URL Rewrite Module**: https://www.iis.net/downloads/microsoft/url-rewrite
2. **Application Request Routing**: https://www.iis.net/downloads/microsoft/application-request-routing

### ✅ **Step 3: Create SSL Certificate**
```powershell
New-SelfSignedCertificate -DnsName "interval.eastus.cloudapp.azure.com" -CertStoreLocation "cert:\LocalMachine\My" -FriendlyName "Azure-Domain-SSL"
```

### ✅ **Step 4: Configure Firewall**
```powershell
New-NetFirewallRule -DisplayName "Allow HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "Allow HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "Allow Node.js" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

### ✅ **Step 5: Create IIS Website**
1. Open IIS Manager
2. Remove "Default Web Site"
3. Create new website:
   - Name: `NodeJS-App`
   - Physical path: `C:\inetpub\wwwroot\nodeapp`
   - Binding: HTTP, Port 80

### ✅ **Step 6: Add HTTPS Binding**
1. Right-click website → "Edit Bindings"
2. Add → HTTPS:
   - Port: 443
   - Host name: `interval.eastus.cloudapp.azure.com`
   - SSL certificate: Select your created certificate

### ✅ **Step 7: Configure Application Request Routing**
1. Go to IIS Manager → Server level
2. Double-click "Application Request Routing Cache"
3. Click "Server Proxy Settings"
4. Check:
   - ✅ Enable proxy
   - ✅ Reverse rewrite host in response headers
   - Timeout: 120 seconds

### ✅ **Step 8: Create URL Rewrite Rule**
1. Go to your website in IIS Manager
2. Double-click "URL Rewrite"
3. Add Rule → Blank Rule:
   - Name: `NodeJSProxy`
   - Pattern: `(.*)`
   - Action Type: Rewrite
   - Rewrite URL: `http://localhost:8080/{R:1}`
   - ✅ Append query string

### ✅ **Step 9: Setup PM2 as Windows Service**
```powershell
cd C:\Users\rajeshalda\Documents\GitHub\repo3
npm install -g pm2-windows-startup
pm2-startup install
```

### ✅ **Step 10: Start Your Application**
```powershell
cd C:\Users\rajeshalda\Documents\GitHub\repo3
npm run start
```

### ✅ **Step 11: Update Azure AD**
Add redirect URI in Azure Portal:
```
https://interval.eastus.cloudapp.azure.com/api/auth/callback/azure-ad
```

### ✅ **Step 12: Test Your Setup**
- HTTP: http://interval.eastus.cloudapp.azure.com
- HTTPS: https://interval.eastus.cloudapp.azure.com

## 🔧 **Quick Commands for Testing**

```powershell
# Check if Node.js app is running
netstat -an | findstr :8080

# Check IIS status
Get-Service W3SVC

# Test local Node.js
curl http://localhost:8080

# Check PM2 status
pm2 status

# Restart PM2 if needed
pm2 restart all
```

## 🚨 **Troubleshooting**

### If 502 Error:
1. Check if Node.js app is running on port 8080
2. Verify ARR proxy settings
3. Check URL Rewrite rule

### If SSL Issues:
1. Verify certificate binding in IIS
2. Check firewall rules
3. Ensure domain name matches certificate

### If Authentication Fails:
1. Check Azure AD redirect URI
2. Verify NEXTAUTH_URL in .env.local
3. Test with incognito/private browser

## 📞 **Need Help?**
- IIS Manager → Server → Application Request Routing Cache → Server Proxy Settings
- Event Viewer → Windows Logs → Application (for detailed errors)
- PM2 logs: `pm2 logs` 