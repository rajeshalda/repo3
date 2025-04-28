# Azure Web App Container Configuration Details

This document provides technical details about the Azure Web App container configuration for the Meeting Time Tracker application.

## Azure Web App Configuration

### Basic Plan Settings

- **SKU**: Basic (B1)
- **Instance Count**: 1
- **OS**: Linux
- **Region**: Closest to your users

### Container Settings

- **Container Type**: Docker Container
- **Registry Source**: Docker Hub
- **Repository**: rajeshalda/meeting-time-tracker
- **Tag**: latest
- **Startup Command**: /app/start.sh
- **Continuous Deployment**: Disabled (using manual deployment)

## Container Runtime Settings

### Ports and Network

- **Port**: 8080
- **WEBSITES_PORT**: 8080 (Azure environment variable)
- **Container Expose**: 8080

### Environment Variables

Essential environment variables configured in App Settings:

```
PORT=8080
NODE_ENV=production
AZURE_AD_APP_CLIENT_ID=<your-value>
AZURE_AD_APP_CLIENT_SECRET=<your-value>
AZURE_AD_APP_TENANT_ID=<your-value>
NEXTAUTH_URL=https://basic-v2.azurewebsites.net
NEXTAUTH_SECRET=<your-value>
AZURE_OPENAI_ENDPOINT=<your-value>
AZURE_OPENAI_API_KEY=<your-value>
AZURE_OPENAI_DEPLOYMENT=<your-value>
```

### Application Storage

- **WEBSITES_ENABLE_APP_SERVICE_STORAGE**: false
- Container is ephemeral - any files written to the filesystem will not persist between restarts

## Resource Allocation

- **CPU**: 1 Core (Basic Plan)
- **Memory**: 1.75 GB (Basic Plan)
- **Disk**: 10 GB (shared)

## PM2 Configuration

PM2 is used to manage the AI agent process:

- **Process Name**: ai-agent
- **Script**: pm2.config.js
- **Logs Directory**: /app/logs
- **PM2 Home**: /app/.pm2

## Container Lifecycle Management

- **Restart Policy**: Always
- **Startup Timeout**: 230 seconds
- **Stop Timeout**: 10 seconds

## Scaling and Performance

Basic plan limitations:

- **Max Instances**: 3
- **Auto-scale**: Not available (requires Standard plan or higher)
- **Custom domains**: Supported with CNAME configuration
- **SSL**: Supported (free SSL with Azure domains)

## Deployment Process

Deployment is handled through PowerShell script with these Azure CLI commands:

```powershell
# Configure container image
az webapp config container set --name basic-v2 --resource-group intervaltime --docker-custom-image-name rajeshalda/meeting-time-tracker:latest --docker-registry-server-url https://index.docker.io

# Set startup command
az webapp config set --name basic-v2 --resource-group intervaltime --startup-file "/app/start.sh"

# Configure environment variables
az webapp config appsettings set --name basic-v2 --resource-group intervaltime --settings KEY=VALUE

# Restart the web app
az webapp restart --name basic-v2 --resource-group intervaltime
```

## Troubleshooting Common Issues

1. **Container fails to start**: 
   - Check logs: `az webapp log tail --name basic-v2 --resource-group intervaltime`
   - Verify startup command is correct
   - Ensure environment variables are properly set

2. **PM2 not running**:
   - SSH to container: `az webapp ssh --name basic-v2 --resource-group intervaltime`
   - Check PM2 status: `pm2 status`
   - Verify logs in /app/logs directory

3. **Application errors**:
   - Check Next.js logs in Azure Portal > basic-v2 > Diagnose and solve problems
   - Review PM2 logs in container: `pm2 logs` 