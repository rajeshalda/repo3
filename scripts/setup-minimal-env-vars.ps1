# Script to set up minimal essential environment variables in Azure Web App
$RESOURCE_GROUP = "intervaltime"
$APP_NAME = "basic-v2"

# Essential settings only
$settings = @{
    "PORT" = "8080"
    "NODE_ENV" = "production"
    "WEBSITES_PORT" = "8080"
    "NEXTAUTH_URL" = "https://basic-v2.azurewebsites.net"
    
    # Authentication settings
    "AZURE_AD_CLIENT_ID" = "18f59bee-55a1-4b61-94a4-bc22eaee83e7"
    "AZURE_AD_CLIENT_SECRET" = "sIH8Q~wYdKphJRhWZQoKQitehCtVzFHAZUSX_dq_"
    "AZURE_AD_TENANT_ID" = "d6b48afb-ae93-4180-bd0f-aa47c5c5b57b"
    "AZURE_AD_APP_CLIENT_ID" = "18f59bee-55a1-4b61-94a4-bc22eaee83e7"
    "AZURE_AD_APP_CLIENT_SECRET" = "sIH8Q~wYdKphJRhWZQoKQitehCtVzFHAZUSX_dq_"
    "AZURE_AD_APP_TENANT_ID" = "d6b48afb-ae93-4180-bd0f-aa47c5c5b57b"
    "NEXTAUTH_SECRET" = "kRqX9P8mN3vJ2cY5hL7wD4tF6gB1nZ0xK8sW4jH5"
}

# Show the settings to be applied
Write-Host "Applying minimal environment variables to Azure Web App:" -ForegroundColor Yellow
foreach ($key in $settings.Keys) {
    # Mask secrets
    if ($key -match "SECRET|PASSWORD|KEY") {
        Write-Host "  $key = ********" -ForegroundColor Cyan
    } else {
        Write-Host "  $key = $($settings[$key])" -ForegroundColor Cyan
    }
}

# Confirm before applying
$confirm = Read-Host "Apply these settings to the Azure Web App? (y/n)"
if ($confirm -ne "y") {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
    Exit 0
}

# Convert settings to arguments format for az command
$argList = @()
foreach ($key in $settings.Keys) {
    $argList += "$key=$($settings[$key])"
}

# Apply settings to Azure Web App
Write-Host "Applying settings to Azure Web App..." -ForegroundColor Yellow
az webapp config appsettings set --name $APP_NAME --resource-group $RESOURCE_GROUP --settings $argList

# Restart the web app
Write-Host "Restarting the Azure Web App..." -ForegroundColor Yellow
az webapp restart --name $APP_NAME --resource-group $RESOURCE_GROUP

Write-Host "Environment variables have been set. The web app is restarting." -ForegroundColor Green
Write-Host "Your application should be available at: https://$APP_NAME.azurewebsites.net" -ForegroundColor Green 