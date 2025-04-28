# Quick Deployment Guide for Azure Web App (Basic Free Plan)

This guide provides the specific steps to deploy the Meeting Time Tracker application to your Azure Web App using Docker Hub.

## Prerequisites

- Docker Desktop installed on your computer
- Docker Hub account (username: rajeshalda)
- Azure CLI installed
- Azure account with resource group "intervaltime" already created
- Azure Web App "basic-v2" already created

## Deployment Steps

### Step 1: Build and Push Docker Image

1. Open a terminal/PowerShell window in the project root directory
2. Build the Docker image:
   ```
   docker build -t rajeshalda/meeting-time-tracker:latest .
   ```
3. Log in to Docker Hub:
   ```
   docker login
   ```
4. Push the image to Docker Hub:
   ```
   docker push rajeshalda/meeting-time-tracker:latest
   ```

### Step 2: Deploy to Azure Web App

1. Log in to Azure (if not already logged in):
   ```
   az login
   ```

2. Configure the Web App to use your Docker image:
   ```
   az webapp config container set --name basic-v2 --resource-group intervaltime --docker-custom-image-name rajeshalda/meeting-time-tracker:latest --docker-registry-server-url https://index.docker.io
   ```

3. Configure the Web App startup file:
   ```
   az webapp config set --name basic-v2 --resource-group intervaltime --startup-file "/app/start.sh"
   ```

4. Set required environment variables:
   ```
   az webapp config appsettings set --name basic-v2 --resource-group intervaltime --settings PORT=8080 NODE_ENV=production
   ```

5. Restart the Web App:
   ```
   az webapp restart --name basic-v2 --resource-group intervaltime
   ```

### Step 3: Verify Deployment

1. Wait a few minutes for the deployment to complete
2. Check the status of your Web App:
   ```
   az webapp show --name basic-v2 --resource-group intervaltime --query state
   ```
3. Visit your application at https://basic-v2.azurewebsites.net
4. Check the logs if there are any issues:
   ```
   az webapp log tail --name basic-v2 --resource-group intervaltime
   ```

## Using the Deployment Scripts

For convenience, you can use the deployment scripts provided:

- **Windows**: Run in PowerShell
  ```
  .\scripts\deploy-azure-docker.ps1
  ```

- **Linux/Mac**: Run in terminal
  ```
  chmod +x scripts/deploy-azure-docker.sh
  ./scripts/deploy-azure-docker.sh
  ```

## Troubleshooting

If your application doesn't start correctly:

1. Check container logs:
   ```
   az webapp log tail --name basic-v2 --resource-group intervaltime
   ```

2. SSH into the container:
   ```
   az webapp ssh --name basic-v2 --resource-group intervaltime
   ```

3. Once connected via SSH, check if PM2 is running:
   ```
   pm2 status
   ```

4. If needed, manually start the application:
   ```
   cd /app
   ./start.sh
   ``` 