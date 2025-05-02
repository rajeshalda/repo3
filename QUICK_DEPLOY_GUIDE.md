# Quick Deployment Guide for Azure Web App (Basic Free Plan)

This guide provides steps to deploy the Meeting Time Tracker application to your Azure Web App using Docker Hub.

## Step 1: Deploy the Application

1. Build and push the Docker image:
   ```
   .\scripts\deploy-azure-docker.ps1
   ```
   This script will:
   - Build the Docker image
   - Push it to Docker Hub
   - Configure your Azure Web App to use this image

2. Set up environment variables:
   ```
   .\scripts\setup-minimal-env-vars.ps1
   ```
   This script will:
   - Set up essential environment variables in Azure
   - Restart the Web App

## Step 2: Verify Deployment

Your application should be available at:
```
https://basic-v2.azurewebsites.net
```

## Troubleshooting

If your application doesn't start correctly:

1. Check container logs:
   ```
   az webapp log tail --name basic-v2 --resource-group intervaltime
   ```

2. SSH into the container:
   ```
   .\scripts\ssh-azure-container.ps1
   ```
   Or directly:
   ```
   az webapp ssh --name basic-v2 --resource-group intervaltime
   ```

3. Once connected via SSH, check if PM2 is running:
   ```
   pm2 status
   ```

## What We've Done

1. Created a Docker container with:
   - Node.js 20
   - PM2 for background processes
   - Next.js application

2. Set up the required environment variables in Azure:
   - Authentication credentials
   - Port configuration
   - Next.js configuration

3. Created scripts to simplify deployment and troubleshooting

## Additional Notes

- The application uses PM2 to run an AI agent in the background
- We've configured Next.js to use the correct URLs in the Azure environment
- The Azure free tier has limitations, so performance may vary 