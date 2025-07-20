# Setup Node.js Application as Windows Service
# This will run your app automatically without terminal

param(
    [string]$AppPath = "C:\Users\rajeshalda\Documents\GitHub\repo3",
    [string]$ServiceName = "MeetingTimeTracker"
)

Write-Host "Setting up $ServiceName as Windows Service" -ForegroundColor Green

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "This script must be run as Administrator!"
    exit 1
}

# Step 1: Install node-windows globally
Write-Host "Installing node-windows..." -ForegroundColor Cyan
npm install -g node-windows

# Step 2: Create Windows Service script
Write-Host "Creating service installation script..." -ForegroundColor Cyan
$serviceScript = @"
const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: '$ServiceName',
  description: 'Meeting Time Tracker - Next.js Application with PM2',
  script: path.join('$($AppPath.Replace('\', '\\'))', 'server.js'),
  nodeOptions: [
    '--max_old_space_size=4096'
  ],
  env: {
    name: "NODE_ENV",
    value: "production"
  },
  workingDirectory: '$($AppPath.Replace('\', '\\'))',
  allowServiceLogon: true
});

// Listen for the 'install' event, which indicates the process is available as a service.
svc.on('install', function(){
  console.log('$ServiceName installed as Windows Service');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', function(){
  console.log('$ServiceName started successfully');
});

svc.on('error', function(err){
  console.log('Service error:', err);
});

// Install the service
console.log('Installing $ServiceName as Windows Service...');
svc.install();
"@

$serviceScriptPath = "$AppPath\install-service.js"
$serviceScript | Out-File -FilePath $serviceScriptPath -Encoding UTF8

# Step 3: Create service uninstall script  
Write-Host "Creating service uninstall script..." -ForegroundColor Cyan
$uninstallScript = @"
const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: '$ServiceName',
  script: path.join('$($AppPath.Replace('\', '\\'))', 'server.js')
});

// Listen for the 'uninstall' event
svc.on('uninstall', function(){
  console.log('$ServiceName uninstalled successfully');
});

// Uninstall the service
console.log('Uninstalling $ServiceName...');
svc.uninstall();
"@

$uninstallScriptPath = "$AppPath\uninstall-service.js"
$uninstallScript | Out-File -FilePath $uninstallScriptPath -Encoding UTF8

# Step 4: Create startup batch file
Write-Host "Creating startup batch file..." -ForegroundColor Cyan
$startupBatch = @"
@echo off
cd /d "$AppPath"
echo Starting Meeting Time Tracker Service...
node install-service.js
pause
"@

$startupBatchPath = "$AppPath\install-as-service.bat"
$startupBatch | Out-File -FilePath $startupBatchPath -Encoding ASCII

# Step 5: Create uninstall batch file
$uninstallBatch = @"
@echo off
cd /d "$AppPath"
echo Uninstalling Meeting Time Tracker Service...
node uninstall-service.js
pause
"@

$uninstallBatchPath = "$AppPath\uninstall-service.bat"
$uninstallBatch | Out-File -FilePath $uninstallBatchPath -Encoding ASCII

# Step 6: Stop any existing PM2 processes
Write-Host "Stopping existing PM2 processes..." -ForegroundColor Cyan
Push-Location $AppPath
try {
    pm2 stop all
    pm2 delete all
} catch {
    Write-Host "No PM2 processes to stop" -ForegroundColor Yellow
}
Pop-Location

# Step 7: Install as Windows Service
Write-Host "Installing as Windows Service..." -ForegroundColor Cyan
Push-Location $AppPath
try {
    node install-service.js
    Write-Host "Service installation initiated..." -ForegroundColor Green
    Start-Sleep -Seconds 10  # Wait for service to install
    
    # Check if service was created
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service) {
        Write-Host "Service '$ServiceName' created successfully!" -ForegroundColor Green
        Write-Host "Service Status: $($service.Status)" -ForegroundColor Cyan
    } else {
        Write-Host "Service creation may have failed. Check logs." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Service installation failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Try running manually: cd $AppPath && node install-service.js" -ForegroundColor Yellow
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Windows Service Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Service Management:" -ForegroundColor Yellow
Write-Host "- Service Name: $ServiceName" -ForegroundColor White
Write-Host "- Start Service: Start-Service '$ServiceName'" -ForegroundColor White
Write-Host "- Stop Service: Stop-Service '$ServiceName'" -ForegroundColor White
Write-Host "- Service Status: Get-Service '$ServiceName'" -ForegroundColor White
Write-Host ""
Write-Host "Files Created:" -ForegroundColor Yellow
Write-Host "- Install: $AppPath\install-as-service.bat" -ForegroundColor White
Write-Host "- Uninstall: $AppPath\uninstall-service.bat" -ForegroundColor White
Write-Host ""
Write-Host "The application will now start automatically on Windows boot!" -ForegroundColor Green 