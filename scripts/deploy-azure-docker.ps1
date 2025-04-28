# Variables
$RESOURCE_GROUP = "intervaltime"
$APP_NAME = "basic-v2"
$DOCKER_IMAGE = "rajeshalda/meeting-time-tracker:latest"

# Build Docker image
Write-Host "Building Docker image..."
docker build -t $DOCKER_IMAGE .

# Log in to Docker Hub
Write-Host "Logging in to Docker Hub..."
docker login

# Push the image to Docker Hub
Write-Host "Pushing image to Docker Hub..."
docker push $DOCKER_IMAGE

# Check if Azure CLI is installed
try {
    az --version | Out-Null
} catch {
    Write-Host "Azure CLI is not installed. Please install it first."
    exit 1
}

# Check if logged in to Azure
Write-Host "Checking Azure login..."
try {
    az account show | Out-Null
} catch {
    Write-Host "Not logged in to Azure. Initiating login..."
    az login
}

# Configure the web app to use the Docker image
Write-Host "Configuring Azure Web App to use the Docker image..."
az webapp config container set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --docker-custom-image-name $DOCKER_IMAGE `
    --docker-registry-server-url https://index.docker.io

# Set the startup command explicitly
Write-Host "Setting the startup command for the web app..."
az webapp config set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --startup-file "/app/start.sh"

# Set environment variables for the application
Write-Host "Setting environment variables for the web app..."
Write-Host "Note: You'll need to configure these with actual values in Azure Portal after deployment"
az webapp config appsettings set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --settings `
    PORT=8080 `
    NODE_ENV=production `
    AZURE_AD_APP_CLIENT_ID="configure_in_portal" `
    AZURE_AD_APP_CLIENT_SECRET="configure_in_portal" `
    AZURE_AD_APP_TENANT_ID="configure_in_portal" `
    NEXTAUTH_URL="https://$APP_NAME.azurewebsites.net" `
    NEXTAUTH_SECRET="configure_in_portal" `
    AZURE_OPENAI_ENDPOINT="configure_in_portal" `
    AZURE_OPENAI_API_KEY="configure_in_portal" `
    AZURE_OPENAI_DEPLOYMENT="configure_in_portal"

# Restart the web app
Write-Host "Restarting Azure Web App..."
az webapp restart `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP

Write-Host "Deployment completed successfully!"
Write-Host "Web app URL: https://$APP_NAME.azurewebsites.net"
Write-Host "IMPORTANT: Go to Azure Portal and update environment variables with actual values in App Settings" 