@echo off
REM Clear Reviews Batch Script
REM This is a simple wrapper for the Node.js review clearing script

setlocal enabledelayedexpansion

echo 🧹 Review Database Cleaner (Batch)
echo ==================================================

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if the JavaScript script exists
if not exist "clear-reviews.js" (
    echo ❌ clear-reviews.js not found in current directory.
    pause
    exit /b 1
)

REM If no arguments, show help
if "%~1"=="" (
    echo.
    echo 📋 Available Commands:
    echo   clear-reviews.bat all                          # Clear all reviews
    echo   clear-reviews.bat user [email]                 # Clear reviews for specific user
    echo   clear-reviews.bat status [status]              # Clear reviews with specific status
    echo   clear-reviews.bat stats                        # Show current statistics only
    echo.
    echo Examples:
    echo   clear-reviews.bat all
    echo   clear-reviews.bat user pradeepg@m365x92504196.onmicrosoft.com
    echo   clear-reviews.bat status pending
    echo.
    pause
    exit /b 0
)

REM Execute the Node.js script with arguments
echo 🚀 Executing: node clear-reviews.js %*
echo.

node clear-reviews.js %*

echo.
echo ✅ Script execution completed.
pause 