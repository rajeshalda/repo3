# Script to set up environment variables in Azure Web App
$RESOURCE_GROUP = "paid-intervals"
$APP_NAME = "premium-interval"

# Load environment variables from .env.local
$envContent = Get-Content -Path ".env.local" -ErrorAction SilentlyContinue
if (!$envContent) {
    Write-Host "Error: .env.local file not found." -ForegroundColor Red
    Exit 1
}

# Create a settings object
$settings = @{}

# Parse env vars
foreach ($line in $envContent) {
    # Skip empty lines and comments
    if ($line -match '^\s*$' -or $line -match '^\s*#') {
        continue
    }
    
    # Parse key-value pair
    if ($line -match '^\s*([^=]+?)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim(" `t`n`r`"'")
        $settings[$key] = $value
    }
}

# Add additional settings needed for Azure
$settings["PORT"] = "8080"
$settings["NODE_ENV"] = "production"
$settings["WEBSITES_PORT"] = "8080"
$settings["NEXTAUTH_URL"] = "https://premium-interval.azurewebsites.net"

# Show the settings to be applied
Write-Host "Applying the following environment variables to Azure Web App:" -ForegroundColor Yellow
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