# Script to SSH into Azure Web App container for debugging
$RESOURCE_GROUP = "intervaltime"
$APP_NAME = "basic-v2"

Write-Host "Opening SSH connection to Azure Web App container..." -ForegroundColor Yellow
Write-Host "Once connected, run these commands to check logs:" -ForegroundColor Green
Write-Host "  cd /app/logs" -ForegroundColor Cyan
Write-Host "  cat startup.log" -ForegroundColor Cyan
Write-Host "  cat nextjs-error.log" -ForegroundColor Cyan
Write-Host "  ls -la" -ForegroundColor Cyan
Write-Host "  pm2 status" -ForegroundColor Cyan

# Connect to the container via SSH
az webapp ssh --name $APP_NAME --resource-group $RESOURCE_GROUP 