# Clear Reviews PowerShell Script
# This script clears review data from the SQLite database for testing purposes

param(
    [string]$Action = "",
    [string]$Target = ""
)

# Function to display help
function Show-Help {
    Write-Host "🧹 Review Database Cleaner (PowerShell)" -ForegroundColor Cyan
    Write-Host "=" * 50 -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 Available Commands:" -ForegroundColor Yellow
    Write-Host "  .\clear-reviews.ps1 -Action all                    # Clear all reviews"
    Write-Host "  .\clear-reviews.ps1 -Action user -Target <email>   # Clear reviews for specific user"
    Write-Host "  .\clear-reviews.ps1 -Action status -Target <status> # Clear reviews with specific status"
    Write-Host "  .\clear-reviews.ps1 -Action stats                  # Show current statistics only"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Green
    Write-Host "  .\clear-reviews.ps1 -Action all"
    Write-Host "  .\clear-reviews.ps1 -Action user -Target 'pradeepg@m365x92504196.onmicrosoft.com'"
    Write-Host "  .\clear-reviews.ps1 -Action status -Target 'pending'"
    Write-Host ""
}

# Function to check if Node.js is available
function Test-NodeJS {
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
            return $true
        }
    }
    catch {
        Write-Host "❌ Node.js not found. Please install Node.js to run this script." -ForegroundColor Red
        return $false
    }
    return $false
}

# Function to check if the JavaScript script exists
function Test-JSScript {
    $jsScript = Join-Path $PSScriptRoot "clear-reviews.js"
    if (Test-Path $jsScript) {
        Write-Host "✅ JavaScript script found: $jsScript" -ForegroundColor Green
        return $jsScript
    }
    else {
        Write-Host "❌ JavaScript script not found: $jsScript" -ForegroundColor Red
        return $null
    }
}

# Main execution
function Main {
    Write-Host "🧹 Review Database Cleaner (PowerShell)" -ForegroundColor Cyan
    Write-Host "=" * 50 -ForegroundColor Cyan
    
    # Check prerequisites
    if (-not (Test-NodeJS)) {
        return
    }
    
    $jsScript = Test-JSScript
    if (-not $jsScript) {
        return
    }
    
    # If no action specified, show help
    if (-not $Action) {
        Show-Help
        return
    }
    
    # Build the command arguments
    $nodeArgs = @($jsScript)
    
    switch ($Action.ToLower()) {
        "all" {
            $nodeArgs += "--all"
        }
        "user" {
            if (-not $Target) {
                Write-Host "❌ Please specify a user email with -Target parameter" -ForegroundColor Red
                Write-Host "Example: .\clear-reviews.ps1 -Action user -Target 'user@example.com'"
                return
            }
            $nodeArgs += "--user", $Target
        }
        "status" {
            if (-not $Target) {
                Write-Host "❌ Please specify a status with -Target parameter" -ForegroundColor Red
                Write-Host "Example: .\clear-reviews.ps1 -Action status -Target 'pending'"
                return
            }
            $nodeArgs += "--status", $Target
        }
        "stats" {
            $nodeArgs += "--stats"
        }
        default {
            Write-Host "❌ Unknown action: $Action" -ForegroundColor Red
            Show-Help
            return
        }
    }
    
    # Execute the Node.js script
    Write-Host ""
    Write-Host "🚀 Executing: node $($nodeArgs -join ' ')" -ForegroundColor Cyan
    Write-Host ""
    
    try {
        & node @nodeArgs
    }
    catch {
        Write-Host "❌ Error executing script: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Run the main function
Main 