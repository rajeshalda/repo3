# Azure Web App Docker Deployment Script (PowerShell)

# Configuration
$RESOURCE_GROUP = "intervaltime"
$APP_NAME = "basic-v22"
$DOCKER_IMAGE = "rajeshalda/meeting-time-tracker:latest"
$DOCKER_REGISTRY = "https://index.docker.io"

Write-Host "Starting deployment process..." -ForegroundColor Yellow

# Check if docker is installed
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is not installed. Please install Docker first." -ForegroundColor Red
    Exit 1
}

# Check if Azure CLI is installed
if (-not (Get-Command "az" -ErrorAction SilentlyContinue)) {
    Write-Host "Azure CLI is not installed. Please install Azure CLI first." -ForegroundColor Red
    Exit 1
}

# Build the Docker image
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build -t $DOCKER_IMAGE .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build Docker image." -ForegroundColor Red
    Exit 1
}

# Log in to Docker Hub
Write-Host "Logging in to Docker Hub..." -ForegroundColor Yellow
Write-Host "Please enter your Docker Hub credentials:" -ForegroundColor Green
docker login

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to log in to Docker Hub." -ForegroundColor Red
    Exit 1
}

# Push the image to Docker Hub
Write-Host "Pushing image to Docker Hub..." -ForegroundColor Yellow
docker push $DOCKER_IMAGE

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push image to Docker Hub." -ForegroundColor Red
    Exit 1
}

# Check if already logged in to Azure
Write-Host "Checking Azure login status..." -ForegroundColor Yellow
$loginStatus = az account show 2>&1

# Only login if not already logged in
if ($LASTEXITCODE -ne 0) {
    Write-Host "Not logged in to Azure. Logging in now..." -ForegroundColor Yellow
    az login

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to log in to Azure." -ForegroundColor Red
        Exit 1
    }
} else {
    Write-Host "Already logged in to Azure. Continuing..." -ForegroundColor Green
}

# Configure the Web App to use your Docker image
Write-Host "Configuring Web App to use your Docker image..." -ForegroundColor Yellow
az webapp config container set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --docker-custom-image-name $DOCKER_IMAGE `
    --docker-registry-server-url $DOCKER_REGISTRY

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to configure Web App container settings." -ForegroundColor Red
    Exit 1
}

# Configure the Web App startup file
Write-Host "Setting startup file..." -ForegroundColor Yellow
az webapp config set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --startup-file "/app/start.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to set startup file." -ForegroundColor Red
    Exit 1
}

# Set required environment variables
Write-Host "Setting environment variables..." -ForegroundColor Yellow
az webapp config appsettings set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --settings PORT=8080 NODE_ENV=production

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to set environment variables." -ForegroundColor Red
    Exit 1
}

# Restart the Web App
Write-Host "Restarting Web App..." -ForegroundColor Yellow
az webapp restart `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to restart Web App." -ForegroundColor Red
    Exit 1
}

# Wait for restart to complete
Write-Host "Waiting for restart to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Show application URL
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "Your application should be available at:" -ForegroundColor Green
Write-Host "https://$APP_NAME.azurewebsites.net" -ForegroundColor Green

# Show how to check logs
Write-Host "To check logs, run:" -ForegroundColor Yellow
Write-Host "az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP" 