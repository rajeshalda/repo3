@echo off
echo Checking Meeting Time Tracker Service Status...
echo.
sc query "MeetingTimeTracker"
echo.
echo Checking if application is running on port 8080...
netstat -an | findstr :8080
echo.
echo Check service logs:
if exist "logs\service.log" (
    echo Last 10 lines of service log:
    powershell "Get-Content logs\service.log -Tail 10"
) else (
    echo No service log found
)
pause
