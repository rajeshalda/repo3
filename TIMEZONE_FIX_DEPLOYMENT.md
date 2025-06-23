# Timezone Fix for Azure Deployment

## Problem
The application works correctly on localhost but shows different meeting data when deployed to Azure App Service via Docker. This is due to timezone differences:

- **Localhost**: Uses your local timezone (Asia/Kolkata)
- **Azure Docker**: Was using UTC timezone by default
- **Result**: Time calculations and date filtering were inconsistent

## Changes Made

### 1. Docker Configuration (`Dockerfile`)
- Changed container timezone from UTC to Asia/Kolkata
- Added timezone verification in startup script
- Added Node.js timezone detection for debugging

```dockerfile
# Before
ENV TZ=UTC

# After  
ENV TZ=Asia/Kolkata
```

### 2. Application Logic (`src/lib/utils.ts`)
- Fixed `getUserTimezone()` to always return `Asia/Kolkata` for consistency
- Moved timezone constants to the top for better organization

### 3. API Timezone Handling (`src/app/api/meetings/route.ts`)
- Replaced manual timezone calculations with proper timezone utilities
- Added `date-fns-tz` import for consistent timezone conversions
- Fixed attendance filtering to use proper IST date conversion

## Deployment Steps

### 1. Rebuild Docker Image
```bash
# Build new image with timezone fixes
docker build -t your-app-name:timezone-fix .

# Tag for registry (replace with your registry)
docker tag your-app-name:timezone-fix your-registry/your-app-name:latest
```

### 2. Push to Container Registry
```bash
# Push to your container registry
docker push your-registry/your-app-name:latest
```

### 3. Deploy to Azure App Service
```bash
# Update Azure App Service to use new image
az webapp config container set \
  --name your-app-name \
  --resource-group your-resource-group \
  --docker-custom-image-name your-registry/your-app-name:latest
```

### 4. Verify Deployment
After deployment, check the logs to verify timezone:
- Container timezone should show IST
- Node.js timezone should show Asia/Kolkata
- Meeting data should now match localhost behavior

## Verification Checklist
- [ ] Docker image rebuilt with new timezone settings
- [ ] Container starts with Asia/Kolkata timezone
- [ ] Meeting data matches localhost results
- [ ] Date filtering works correctly for IST dates
- [ ] Attendance reports show correct times

## Alternative Azure Configuration (Optional)
If you prefer to set timezone via Azure App Service settings instead of Docker:

1. Go to Azure Portal → Your App Service → Configuration
2. Add Application Setting:
   - Name: `TZ`
   - Value: `Asia/Kolkata`
3. Save and restart the app

## Testing
1. Compare meeting data between localhost and Azure
2. Test with date ranges spanning multiple days
3. Verify attendance times are displayed correctly
4. Check that recurring meetings show correct instances

The key fix is ensuring consistent timezone handling between development and production environments. 