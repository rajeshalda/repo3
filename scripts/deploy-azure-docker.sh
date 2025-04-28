#!/bin/bash

# Variables
RESOURCE_GROUP="intervaltime"
APP_NAME="basic-v2"
DOCKER_IMAGE="rajeshalda/meeting-time-tracker:latest"

# Build Docker image
echo "Building Docker image..."
docker build -t $DOCKER_IMAGE .

# Log in to Docker Hub
echo "Logging in to Docker Hub..."
docker login

# Push the image to Docker Hub
echo "Pushing image to Docker Hub..."
docker push $DOCKER_IMAGE

# Check if Azure CLI is installed
if ! command -v az &> /dev/null
then
    echo "Azure CLI is not installed. Please install it first."
    exit 1
fi

# Check if logged in to Azure
echo "Checking Azure login..."
az account show &> /dev/null || az login

# Configure the web app to use the Docker image
echo "Configuring Azure Web App to use the Docker image..."
az webapp config container set \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --docker-custom-image-name $DOCKER_IMAGE \
    --docker-registry-server-url https://index.docker.io

# Restart the web app
echo "Restarting Azure Web App..."
az webapp restart \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP

echo "Deployment completed successfully!"
echo "Web app URL: https://$APP_NAME.azurewebsites.net" 