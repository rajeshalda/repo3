# Setting Up WebJob for AI Agent

## Overview
This WebJob will handle continuous processing of meetings using the existing AI agent functionality, without requiring browser sessions to be open.

## Prerequisites
- Existing Azure App Service
- Azure Storage Account (intervalstorage)
- Existing AI Agent TypeScript codebase

## Storage Account Details
```
Storage Account Name: intervalstorage
Connection String: DefaultEndpointsProtocol=https;AccountName=intervalstorage;AccountKey=92wVpr2AngszdK2kqodzPIkBk0f/OvB98PCVB8/fmigEcnneJSh+RW0fRZpkykjaMZzN1hLbTAz9+AStNh43yg==;EndpointSuffix=core.windows.net
```

## Setup Steps

### 1. Create WebJob Project Structure
1. In your existing project:
   ```
   src/
   ├── webjob/
   │   ├── package.json
   │   ├── tsconfig.json
   │   ├── src/
   │   │   ├── index.ts
   │   │   └── worker.ts
   │   └── settings.json
   ```

2. Required npm packages:
   ```json
   {
     "dependencies": {
       "@azure/storage-blob": "latest",
       "typescript": "latest",
       "ts-node": "latest",
       "dotenv": "latest"
     }
   }
   ```

### 2. Project Configuration
1. Reuse existing code:
   - AI Agent services
   - Storage manager
   - Intervals API integration
   - Review service

2. Configuration in settings.json:
   ```json
   {
     "AzureWebJobsStorage": "DefaultEndpointsProtocol=https;AccountName=intervalstorage;AccountKey=92wVpr2AngszdK2kqodzPIkBk0f/OvB98PCVB8/fmigEcnneJSh+RW0fRZpkykjaMZzN1hLbTAz9+AStNh43yg==;EndpointSuffix=core.windows.net",
     "WEBSITE_TIME_ZONE": "India Standard Time"
   }
   ```

### 3. WebJob Implementation
1. Main components needed:
   - Node.js worker script
   - Timer-based execution (setInterval)
   - Meeting fetching logic
   - AI processing
   - Intervals posting
   - Storage updates

2. Use existing services:
   - Storage manager
   - Review service
   - AI agent processing
   - Intervals integration

### 4. Azure Deployment
1. Prepare for deployment:
   - Build TypeScript files: `tsc`
   - Create run.js script in dist folder
   - Zip the contents of dist folder

2. In Azure Portal:
   - Go to App Service
   - Navigate to "WebJobs" under Settings
   - Click "Add WebJob"
   - Name: "AIAgentProcessor"
   - Type: "Continuous"
   - Scale: "Single Instance"
   - Upload the zip file
   - File name: run.js

3. Configure App Service:
   - Go to Configuration
   - Add Application Settings:
     - Key: AzureWebJobsStorage
     - Value: [Your storage connection string]
   - Enable "Always On"
   - Set correct timezone
   - Save changes

4. WebJob Files Structure:
   ```
   AIAgentProcessor.zip
   ├── run.js
   ├── settings.json
   ├── node_modules/
   └── [other compiled js files]
   ```

### 5. Verify Setup
1. Check WebJob is running:
   - Azure Portal > App Service > WebJobs
   - Status should show "Running"
   - Check WebJob logs in "Logs" tab

2. Monitor in Azure Portal:
   - Go to WebJob details
   - Check continuous WebJob log stream
   - Verify processing messages
   - Monitor for any errors

## Testing
1. Local Testing:
   - Run using `ts-node src/index.ts`
   - Check local storage updates
   - Verify meeting processing

2. Production Testing:
   - Monitor Azure WebJob logs
   - Check storage account for updates
   - Verify meetings are being posted
   - Monitor Application Insights

## Troubleshooting
- Check WebJob logs in Azure Portal
- Verify storage connection in Application Settings
- Check if Always On is enabled
- Monitor WebJob status in portal
- Check Node.js version in App Service
- Verify all dependencies are included in package.json

## Next Steps
After basic setup is working:
1. Add better error handling
2. Implement proper logging
3. Add monitoring
4. Optimize performance

## Notes
- Keep the initial implementation simple
- Use Node.js best practices
- Focus on getting the continuous processing working
- Test thoroughly with your storage account
- Monitor the WebJob's resource usage
- Make sure to handle Node.js process errors and restarts 