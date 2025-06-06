#!/bin/bash
# Azure Web App Docker Deployment Script

# Configuration
RESOURCE_GROUP="intervaltime"
APP_NAME="chronopulse"
DOCKER_IMAGE="rajeshalda/meeting-time-tracker:latest"
DOCKER_REGISTRY="https://index.docker.io"

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting deployment process...${NC}"

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Azure CLI is not installed. Please install Azure CLI first.${NC}"
    exit 1
fi

# Build the Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t $DOCKER_IMAGE .

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to build Docker image.${NC}"
    exit 1
fi

# Log in to Docker Hub
echo -e "${YELLOW}Logging in to Docker Hub...${NC}"
echo -e "${GREEN}Please enter your Docker Hub credentials:${NC}"
docker login

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to log in to Docker Hub.${NC}"
    exit 1
fi

# Push the image to Docker Hub
echo -e "${YELLOW}Pushing image to Docker Hub...${NC}"
docker push $DOCKER_IMAGE

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to push image to Docker Hub.${NC}"
    exit 1
fi

# Check if already logged in to Azure
echo -e "${YELLOW}Checking Azure login status...${NC}"
az account show &> /dev/null

# Only login if not already logged in
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Not logged in to Azure. Logging in now...${NC}"
    az login

    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to log in to Azure.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Already logged in to Azure. Continuing...${NC}"
fi

# Configure the Web App to use your Docker image
echo -e "${YELLOW}Configuring Web App to use your Docker image...${NC}"
az webapp config container set \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --docker-custom-image-name $DOCKER_IMAGE \
    --docker-registry-server-url $DOCKER_REGISTRY

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to configure Web App container settings.${NC}"
    exit 1
fi

# Configure the Web App startup file
echo -e "${YELLOW}Setting startup file...${NC}"
az webapp config set \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --startup-file "/app/start.sh"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to set startup file.${NC}"
    exit 1
fi

# Set required environment variables
echo -e "${YELLOW}Setting environment variables...${NC}"
az webapp config appsettings set \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings PORT=8080 NODE_ENV=production

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to set environment variables.${NC}"
    exit 1
fi

# Restart the Web App
echo -e "${YELLOW}Restarting Web App...${NC}"
az webapp restart \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to restart Web App.${NC}"
    exit 1
fi

# Wait for restart to complete
echo -e "${YELLOW}Waiting for restart to complete...${NC}"
sleep 30

# Show application URL
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}Your application should be available at:${NC}"
echo -e "${GREEN}https://$APP_NAME.azurewebsites.net${NC}"

# Show how to check logs
echo -e "${YELLOW}To check logs, run:${NC}"
echo -e "az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP" 