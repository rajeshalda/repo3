# Docker Deployment to Azure Web App

This guide explains how to deploy the Meeting Time Tracker application to Azure Web App using Docker.

## Prerequisites

1. Docker installed locally
2. Docker Hub account
3. Azure account with an active subscription
4. Azure CLI installed locally

## Local Docker Setup

### Build and Run Locally

1. Build the Docker image:
```bash
docker build -t meeting-time-tracker .
```

2. Run the container locally:
```bash
docker run -p 8080:8080 -d meeting-time-tracker
```

3. Access the application at http://localhost:8080

## Docker Hub Deployment

1. Log in to Docker Hub:
```bash
docker login
```

2. Tag the image with your Docker Hub username:
```bash
docker tag meeting-time-tracker rajeshalda/meeting-time-tracker:latest
```

3. Push the image to Docker Hub:
```bash
docker push rajeshalda/meeting-time-tracker:latest
```

## Azure Web App Setup

1. Create a resource group (if not already created):
```bash
az group create --name intervaltime --location eastus
```

2. Create an App Service Plan (if not already created):
```bash
az appservice plan create --name basic-plan --resource-group intervaltime --is-linux --sku B1
```

3. Create an Azure Web App with Docker configuration:
```bash
az webapp create --resource-group intervaltime \
                --plan basic-plan \
                --name basic-v2 \
                --deployment-container-image-name rajeshalda/meeting-time-tracker:latest
```

4. Configure the Web App to use the Docker Hub image:
```bash
az webapp config container set --name basic-v2 \
                            --resource-group intervaltime \
                            --docker-custom-image-name rajeshalda/meeting-time-tracker:latest \
                            --docker-registry-server-url https://index.docker.io
```

5. Set application settings:
```bash
az webapp config appsettings set --name basic-v2 \
                                --resource-group intervaltime \
                                --settings PORT=8080 NODE_ENV=production
```

6. Set any required environment variables for your application:
```bash
az webapp config appsettings set --name basic-v2 \
                                --resource-group intervaltime \
                                --settings \
                                AZURE_AD_CLIENT_ID="your-client-id" \
                                AZURE_AD_CLIENT_SECRET="your-client-secret" \
                                AZURE_AD_TENANT_ID="your-tenant-id" \
                                NEXTAUTH_URL="https://basic-v2.azurewebsites.net" \
                                NEXTAUTH_SECRET="your-secret" \
                                AZURE_OPENAI_ENDPOINT="your-endpoint" \
                                AZURE_OPENAI_API_KEY="your-api-key" \
                                AZURE_OPENAI_DEPLOYMENT="your-deployment-name"
```

## Using the Deployment Script

For convenience, a deployment script is provided in `scripts/deploy-azure-docker.sh`. To use it:

1. Make it executable (Linux/Mac):
```bash
chmod +x scripts/deploy-azure-docker.sh
```

2. Run the script:
```bash
./scripts/deploy-azure-docker.sh
```

On Windows, you can run it with:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-azure-docker.ps1
```

## Troubleshooting

1. Check Docker container logs:
```bash
az webapp log tail --name basic-v2 --resource-group intervaltime
```

2. Check if container is running:
```bash
az webapp config container show --name basic-v2 --resource-group intervaltime
```

3. Restart the web app:
```bash
az webapp restart --name basic-v2 --resource-group intervaltime
```

4. Verify PM2 is running correctly inside the container:
```bash
az webapp ssh --name basic-v2 --resource-group intervaltime
pm2 status
``` 