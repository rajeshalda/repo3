# Script to check logs from Azure Web App
$RESOURCE_GROUP = "intervaltime"
$APP_NAME = "chronopulse"

Write-Host "Checking container logs from Azure Web App..." -ForegroundColor Yellow

# Stream logs from the web app
az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP

# If the above doesn't show detailed logs, uncomment these lines to SSH into the container
# Write-Host "`nOpening SSH connection to container for detailed logs..." -ForegroundColor Yellow
# az webapp ssh --name $APP_NAME --resource-group $RESOURCE_GROUP 