# Azure Web App Deployment with Docker Hub

This document explains how we deployed the Meeting Time Tracker application to Azure Web App using Docker.

## Tools and Technologies Used

1. **Docker Desktop**
   - Used for building and testing the container locally
   - Manages Docker images and containers on the development machine

2. **Docker Hub**
   - Container registry to store and distribute our Docker images
   - Repository: `rajeshalda/meeting-time-tracker`

3. **Azure Web App**
   - PaaS (Platform as a Service) offering from Azure
   - Basic free plan used for hosting the application
   - Supports Docker container deployment

4. **Azure CLI**
   - Command-line tool for managing Azure resources
   - Used in deployment script to configure the Web App

5. **PowerShell**
   - Used for scripting the deployment process
   - Automates building, pushing, and deploying the container

6. **PM2**
   - Process manager for Node.js applications
   - Manages the AI agent background process within the container

## Key Files

1. **Dockerfile**
   - Defines how to build the application container
   - Installs dependencies and builds the Next.js application
   - Creates a startup script to run both PM2 and Next.js server

2. **scripts/deploy-azure-docker.ps1**
   - PowerShell script to automate the deployment process
   - Builds and pushes the Docker image
   - Configures the Azure Web App to use the Docker image

3. **.dockerignore**
   - Specifies files and directories to exclude from the Docker build
   - Optimizes build performance and reduces image size

## Deployment Process

1. **Container Build**
   - The Dockerfile defines a multi-step process:
     - Base image: Node.js 20 Alpine (lightweight)
     - Installs PM2 globally
     - Installs application dependencies
     - Builds the Next.js application
     - Creates a startup script to run both services

2. **Environment Configuration**
   - Dummy environment variables created for build time
   - Actual environment variables configured in Azure Web App settings
   - Sensitive values stored in Azure's secure configuration

3. **Container Registry**
   - Built image pushed to Docker Hub
   - Tagged with `latest` for easy reference
   - Public repository for Azure to pull from

4. **Azure Web App Configuration**
   - Configured to pull the container from Docker Hub
   - Custom startup command specified to run the start.sh script
   - Environment variables set for authentication and API keys

## Solving Deployment Challenges

1. **Dependency Conflicts**
   - Used `--legacy-peer-deps` to resolve React version conflicts
   - Included development dependencies for build process

2. **Environment Variables**
   - Created dummy variables for build process
   - Configured actual variables in Azure Web App settings

3. **Startup Script Issues**
   - Fixed script creation using `printf` instead of `echo`
   - Properly formatted newlines in shell script
   - Explicitly set startup command in Azure

4. **PM2 Integration**
   - Used PM2 to manage background AI agent process
   - Started PM2 in runtime mode as background process
   - Created logs directory for proper logging

## Maintenance and Updates

To update the application:

1. Make code changes locally
2. Run the deployment script: `.\scripts\deploy-azure-docker.ps1`
3. The script will:
   - Build a new Docker image
   - Push it to Docker Hub
   - Configure Azure Web App to use the new image
   - Restart the Web App

## Monitoring and Troubleshooting

- View application logs through Azure Portal
- SSH into the container for direct debugging:
  ```
  az webapp ssh --name basic-v2 --resource-group intervaltime
  ```
- Check PM2 status within the container:
  ```
  pm2 status
  ```
- View container logs:
  ```
  az webapp log tail --name basic-v2 --resource-group intervaltime
  ``` 