# Server-Side Migration: AI Agent Processing

## Problem Description

Initially, the AI agent was running on the browser side, which caused several issues:

1. **Security Concerns**
   - API keys and secrets were exposed to the client
   - Sensitive meeting data was processed in the browser
   - Rate limiting was not properly enforced

2. **Performance Issues**
   - Browser limitations on concurrent requests
   - No persistent queue management
   - Rate limits were hit frequently due to uncoordinated requests

3. **Reliability Problems**
   - Process would stop if browser tab was closed
   - No proper error handling or retry mechanism
   - Inconsistent state management

## Solution Implementation

### 1. Architecture Changes

#### Before (Browser-side):
```typescript
// Client-side code making direct API calls
const analyzeInBrowser = async (meeting) => {
  const response = await fetch('/api/openai', {
    method: 'POST',
    body: JSON.stringify(meeting)
  });
  return response.json();
};
```

#### After (Server-side):
```typescript
// Server-side implementation with proper queue management
export class MeetingService {
    private static instance: MeetingService;
    private queueManager: QueueManager;
    private batchProcessor: BatchProcessor;
    private rateLimiter: RateLimiter;

    public async analyzeMeeting(meeting: Meeting, userId: string): Promise<ProcessedMeeting> {
        return await this.queueManager.queueMeetingAnalysis(
            meeting, 
            userId,
            (m, uid) => this.analyzeMeetingInternal(m, uid)
        );
    }
}
```

### 2. Process Management with PM2

PM2 was implemented to ensure reliable server-side processing and application management:

1. **Process Management Setup**
```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ai-agent',
    script: 'npm',
    args: 'start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
```

2. **Key PM2 Features Utilized**
   - **Process Persistence**: Keeps the AI agent running continuously
   - **Auto-restart**: Automatically restarts the service if it crashes
   - **Memory Management**: Restarts if memory exceeds configured limit
   - **Log Management**: Centralized logging for better monitoring
   - **Process Monitoring**: Real-time monitoring of service health

3. **Automatic PM2 Integration**
   - Added predev script to check and start PM2 automatically
   - Created PM2 status check utilities
   - Implemented multiple fallback mechanisms for reliable startup

4. **Deployment Commands**
```bash
# Install PM2 globally
npm install -g pm2

# Start everything with a single command (automatically starts PM2)
npm run dev

# Alternative explicit commands
npm run dev:with-agent   # Explicitly starts PM2 and Next.js
npm run dev:no-agent     # Starts Next.js without PM2

# PM2 Management Commands
pm2 stop ai-agent        # Stop AI agent
pm2 status               # Check PM2 status
pm2 monit                # Monitor the service
pm2 logs ai-agent        # View logs
pm2 restart ai-agent     # Restart service
```

5. **Package.json Scripts**
```json
{
  "scripts": {
    "predev": "node scripts/pm2-check.js",
    "dev": "cross-env START_PM2=true next dev -p 8080",
    "pm2:start": "pm2 start pm2.config.js",
    "pm2:stop": "pm2 stop ai-agent",
    "pm2:restart": "pm2 restart ai-agent",
    "pm2:status": "pm2 status",
    "pm2:logs": "pm2 logs ai-agent",
    "pm2:monitor": "pm2 monit",
    "dev:with-agent": "npm run pm2:start && npm run dev",
    "dev:no-agent": "cross-env START_PM2=false next dev -p 8080"
  }
}
```

6. **PM2 Status Check Implementation**
```javascript
// scripts/pm2-check.js
async function main() {
  // Check if PM2 is running the AI agent
  const isRunning = checkPM2Status();
  
  // If not running, start it
  if (!isRunning) {
    startAIAgent();
  }
  
  // Verify the API is responding
  const apiResponding = await checkAIAgentAPI();
  
  // Restart if not responding properly
  if (!apiResponding) {
    execSync('npm run pm2:restart');
  }
}
```

7. **Benefits of Improved PM2 Integration**
   - **Simplified Development**: Single `npm run dev` command handles everything
   - **Zero Downtime**: Continuous operation even during updates
   - **Self-Healing**: Automatic detection and recovery from issues
   - **Resource Management**: Better CPU and memory utilization
   - **Monitoring**: Real-time metrics and health checks
   - **Log Rotation**: Automatic log management and rotation

8. **Error Recovery Flow**
```typescript
// Automatic restart on uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Log error and allow PM2 to restart the process
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM signal');
    // Clean up resources
    await cleanupResources();
    process.exit(0);
});
```

### 3. Key Components Added

1. **Queue Manager**
   - Handles meeting processing queue
   - Enforces rate limits
   - Provides persistent processing

2. **Batch Processor**
   - Processes multiple meetings efficiently
   - Manages concurrent processing
   - Tracks batch status

3. **Rate Limiter**
   - Token bucket implementation
   - Coordinates API request timing
   - Prevents rate limit errors

### 4. API Endpoints Updated

1. **Meeting Analysis Endpoint**
```typescript
// pages/api/analyze-meeting.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const meetingService = MeetingService.getInstance();
    const result = await meetingService.analyzeMeeting(req.body.meeting, req.body.userId);
    res.json(result);
}
```

2. **Batch Processing Endpoint**
```typescript
// pages/api/batch-process.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const meetingService = MeetingService.getInstance();
    const batchId = await meetingService.analyzeMeetingBatch(req.body.meetings, req.body.userId);
    res.json({ batchId });
}
```

3. **Status Check Endpoint**
```typescript
// pages/api/batch-status.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const meetingService = MeetingService.getInstance();
    const status = meetingService.getBatchStatus(req.query.batchId as string);
    res.json(status);
}
```

### 5. Security Improvements

1. **API Key Management**
   - Moved all API keys to server environment variables
   - Implemented proper token management for Microsoft Graph API
   - Added secure token validation

2. **Request Validation**
   - Added user authentication checks
   - Implemented request rate limiting
   - Added input validation

### 6. Error Handling

1. **Retry Logic**
```typescript
try {
    analysisResult = await openAIClient.analyzeMeeting(meetingData);
} catch (error) {
    if (error instanceof Error && error.message.includes('429')) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        analysisResult = await openAIClient.analyzeMeeting(meetingData);
    }
}
```

2. **Graceful Failure Handling**
   - Added proper error logging
   - Implemented fallback mechanisms
   - Added error status tracking

## Benefits Achieved

1. **Better Security**
   - No sensitive data exposed to client
   - Proper API key management
   - Secure token handling

2. **Improved Performance**
   - Efficient queue management
   - Proper rate limiting
   - Better resource utilization

3. **Enhanced Reliability**
   - Persistent processing
   - Proper error handling
   - Better state management

4. **Scalability**
   - Better handling of concurrent requests
   - Efficient batch processing
   - Proper resource management

## Future Improvements

1. **Monitoring**
   - Add detailed logging
   - Implement performance metrics
   - Add alerting system

2. **Scaling**
   - Implement horizontal scaling
   - Add load balancing
   - Optimize resource usage

3. **Features**
   - Add webhook support
   - Implement real-time status updates
   - Add more analysis capabilities 