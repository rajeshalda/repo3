# Dockerization Steps for Meeting Time Tracker

This document outlines the step-by-step process of containerizing the Meeting Time Tracker application with Docker.

## 1. Setting Up the Docker Environment

### Initial Analysis
- Identified application components: Next.js web app and PM2-managed AI agent
- Determined required environment variables and dependencies
- Chose Node.js 20 Alpine as the base image for smaller size and security

### Creating Docker Files
We created the following files:
- **Dockerfile**: Main configuration for building the container
- **.dockerignore**: To exclude unnecessary files from the build
- **scripts/deploy-azure-docker.ps1**: PowerShell deployment script

## 2. Developing the Dockerfile

### Base Image Selection
```dockerfile
FROM node:20-alpine
```
Selected the Alpine variant for its smaller size and security benefits.

### Working Directory Setup
```dockerfile
WORKDIR /app
```
Established `/app` as the main directory for the application.

### Package Installation
```dockerfile
# Install PM2 globally
RUN npm install -g pm2

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install all dependencies including dev dependencies
RUN npm install --legacy-peer-deps
```
Used `--legacy-peer-deps` to resolve React version conflicts between dependencies.

### Application Code
```dockerfile
# Copy rest of the application
COPY . .
```
Copied the entire application codebase into the container.

### Environment Configuration
```dockerfile
# Create a dummy .env.local file for build process
RUN echo "AZURE_AD_APP_CLIENT_ID=dummy-client-id" > .env.local && \
    echo "AZURE_AD_APP_CLIENT_SECRET=dummy-secret" >> .env.local && \
    ...
```
Created placeholder environment variables for the build process.

### Application Build
```dockerfile
# Build the Next.js application
RUN npm run build
```
Pre-built the Next.js application during the image creation.

### Startup Script
```dockerfile
# Create a properly formatted startup script
RUN printf '#!/bin/sh\n\
# Start PM2 with pm2-runtime to run in foreground\n\
pm2-runtime start pm2.config.js &\n\
# Wait a moment for PM2 to start\n\
sleep 5\n\
# Start Next.js server\n\
node server.js\n' > start.sh && \
chmod +x start.sh
```
Created a script that:
1. Starts PM2 as a background process
2. Waits for PM2 to initialize
3. Starts the Next.js server in the foreground

### Port Configuration
```dockerfile
# Expose the port
EXPOSE 8080
```
Made port 8080 available for connections.

### Container Startup Command
```dockerfile
# Start the application
CMD ["./start.sh"]
```
Set the startup script as the container's entrypoint.

## 3. Resolving Challenges

### Dependency Conflicts
- Challenge: React version conflicts with other dependencies
- Solution: Used `--legacy-peer-deps` flag during installation

### Environment Variables
- Challenge: Application needed environment variables during build
- Solution: Created dummy variables for build and configured real ones in Azure

### Build Process
- Challenge: Build process required development dependencies
- Solution: Included all dependencies instead of using `--production` flag

### Startup Script Issues
- Challenge: Newlines in shell script weren't being properly formatted
- Solution: Used `printf` instead of `echo` with proper newline formatting

### Container Startup
- Challenge: Azure Web App wasn't finding the startup script
- Solution: Explicitly set the startup command in Azure config

## 4. Testing the Container

### Local Testing
1. Built the image: `docker build -t meeting-time-tracker .`
2. Ran locally: `docker run -p 8080:8080 meeting-time-tracker`
3. Verified both the Next.js server and PM2 processes started correctly

### Azure Deployment Testing
1. Deployed to Azure using PowerShell script
2. Monitored container logs for startup issues
3. Verified application functionality after deployment

## 5. Final Container Architecture

```
Meeting Time Tracker Container
├── Next.js Web Application (port 8080)
└── PM2 Process Manager
    └── AI Agent Background Service
```

The containerized application uses:
- NodeJS 20 on Alpine Linux
- PM2 for process management
- Port 8080 for web traffic
- Pre-built Next.js application
- Shell script orchestration for startup

This architecture ensures that both the web application and the AI agent run properly within a single container, while maintaining proper separation between the processes. 