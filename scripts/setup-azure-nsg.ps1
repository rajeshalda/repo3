# Azure NSG Setup Script
# Run this in Azure Cloud Shell or with Azure CLI installed

param(
    [string]$ResourceGroupName = "your-resource-group-name",
    [string]$VMName = "your-vm-name",
    [string]$NSGName = "your-vm-nsg"
)

Write-Host "Setting up Azure NSG rules for web traffic..." -ForegroundColor Green

# Check if Azure CLI is available
try {
    az --version | Out-Null
    Write-Host "Azure CLI found" -ForegroundColor Green
} catch {
    Write-Host "Azure CLI not found. Please install Azure CLI or use Azure Cloud Shell" -ForegroundColor Red
    Write-Host "Download from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli" -ForegroundColor Yellow
    exit 1
}

# Login check
Write-Host "Checking Azure login status..." -ForegroundColor Cyan
$loginStatus = az account show 2>$null
if (-not $loginStatus) {
    Write-Host "Please login to Azure first:" -ForegroundColor Yellow
    Write-Host "az login" -ForegroundColor White
    exit 1
}

# Get VM details automatically if not provided
if ($ResourceGroupName -eq "your-resource-group-name" -or $VMName -eq "your-vm-name") {
    Write-Host "Getting VM details..." -ForegroundColor Cyan
    $vms = az vm list --query "[].{Name:name, ResourceGroup:resourceGroup}" -o json | ConvertFrom-Json
    
    if ($vms.Count -eq 1) {
        $ResourceGroupName = $vms[0].ResourceGroup
        $VMName = $vms[0].Name
        Write-Host "Found VM: $VMName in Resource Group: $ResourceGroupName" -ForegroundColor Green
    } else {
        Write-Host "Multiple VMs found or no VMs found. Please specify manually:" -ForegroundColor Yellow
        Write-Host ".\scripts\setup-azure-nsg.ps1 -ResourceGroupName 'your-rg' -VMName 'your-vm'" -ForegroundColor White
        exit 1
    }
}

# Get NSG name associated with the VM
Write-Host "Finding Network Security Group..." -ForegroundColor Cyan
$nics = az vm nic list --resource-group $ResourceGroupName --vm-name $VMName | ConvertFrom-Json
if ($nics.Count -gt 0) {
    $nicId = $nics[0].id
    $nicDetails = az network nic show --ids $nicId | ConvertFrom-Json
    
    if ($nicDetails.networkSecurityGroup) {
        $NSGName = ($nicDetails.networkSecurityGroup.id -split '/')[-1]
        Write-Host "Found NSG: $NSGName" -ForegroundColor Green
    } else {
        Write-Host "No NSG found associated with VM. Creating one..." -ForegroundColor Yellow
        $NSGName = "$VMName-nsg"
        az network nsg create --resource-group $ResourceGroupName --name $NSGName
        az network nic update --resource-group $ResourceGroupName --name $nicDetails.name --network-security-group $NSGName
    }
}

Write-Host "Configuring NSG rules for $NSGName..." -ForegroundColor Cyan

# Add HTTP rule
Write-Host "Adding HTTP (port 80) rule..." -ForegroundColor Cyan
az network nsg rule create `
    --resource-group $ResourceGroupName `
    --nsg-name $NSGName `
    --name "Allow-HTTP" `
    --protocol "TCP" `
    --priority 300 `
    --destination-port-range 80 `
    --access "Allow" `
    --direction "Inbound" `
    --source-address-prefix "*" `
    --destination-address-prefix "*"

# Add HTTPS rule
Write-Host "Adding HTTPS (port 443) rule..." -ForegroundColor Cyan
az network nsg rule create `
    --resource-group $ResourceGroupName `
    --nsg-name $NSGName `
    --name "Allow-HTTPS" `
    --protocol "TCP" `
    --priority 310 `
    --destination-port-range 443 `
    --access "Allow" `
    --direction "Inbound" `
    --source-address-prefix "*" `
    --destination-address-prefix "*"

# Optional: Add Node.js direct access rule (for debugging)
Write-Host "Adding Node.js (port 8080) rule for debugging..." -ForegroundColor Cyan
az network nsg rule create `
    --resource-group $ResourceGroupName `
    --nsg-name $NSGName `
    --name "Allow-NodeJS" `
    --protocol "TCP" `
    --priority 320 `
    --destination-port-range 8080 `
    --access "Allow" `
    --direction "Inbound" `
    --source-address-prefix "*" `
    --destination-address-prefix "*"

Write-Host ""
Write-Host "NSG Configuration Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Rules added:" -ForegroundColor Yellow
Write-Host "- HTTP (80): Priority 300" -ForegroundColor White
Write-Host "- HTTPS (443): Priority 310" -ForegroundColor White
Write-Host "- Node.js (8080): Priority 320" -ForegroundColor White
Write-Host ""
Write-Host "Test your application now:" -ForegroundColor Cyan
Write-Host "- HTTP:  http://interval.eastus.cloudapp.azure.com" -ForegroundColor White
Write-Host "- HTTPS: https://interval.eastus.cloudapp.azure.com" -ForegroundColor White
Write-Host "- Direct: http://interval.eastus.cloudapp.azure.com:8080" -ForegroundColor White 