const fs = require('fs');
const path = require('path');
const http = require('http');
const { promisify } = require('util');
require('dotenv').config({ path: '.env.local' }); // Load environment variables

// Path to store user preference data
const USER_DATA_PATH = path.join(process.cwd(), 'src/ai-agent/data/storage/json/pm2-user-data.json');
const POSTED_MEETINGS_PATH = path.join(process.cwd(), 'src/ai-agent/data/storage/json/ai-agent-meetings.json');

// Create directory if it doesn't exist
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Ensure the storage directories exist
ensureDirectoryExists(path.dirname(USER_DATA_PATH));

// Initialize user data if it doesn't exist
if (!fs.existsSync(USER_DATA_PATH)) {
  fs.writeFileSync(USER_DATA_PATH, JSON.stringify({ users: [] }, null, 2));
}

// Initialize meetings storage if it doesn't exist
if (!fs.existsSync(POSTED_MEETINGS_PATH)) {
  fs.writeFileSync(POSTED_MEETINGS_PATH, JSON.stringify({ meetings: [] }, null, 2));
}

// Load user data
let userData = JSON.parse(fs.readFileSync(USER_DATA_PATH, 'utf8'));

// Helper to save user data
const saveUserData = () => {
  fs.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2));
};

// Process meetings for a user
const processMeetingsForUser = async (userId) => {
  console.log(`Processing meetings for user: ${userId}`);

  try {
    // Make a request to your internal API endpoint to process meetings
    // We'll use the Next.js API routes which will handle the actual processing
    const options = {
      hostname: 'localhost',
      port: 8080, // Your Next.js server port
      path: `/api/process-meetings?userId=${encodeURIComponent(userId)}&source=pm2`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    console.log(`Sending request to: http://localhost:8080/api/process-meetings?userId=${encodeURIComponent(userId)}&source=pm2`);

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`Successfully processed meetings for user: ${userId}`);
            try {
              const parsedData = JSON.parse(data);
              console.log('Response data:', parsedData);
              resolve(parsedData);
            } catch (parseError) {
              console.log('Raw response data:', data);
              resolve(data);
            }
          } else {
            console.error(`Failed to process meetings for user: ${userId}. Status code: ${res.statusCode}`);
            console.error(`Response data: ${data}`);
            reject(new Error(`HTTP Error: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`Network error processing meetings for user: ${userId}:`, error.message);
        console.error(`Make sure the Next.js server is running on port 8080`);
        reject(error);
      });

      // Add a timeout to prevent hanging requests
      req.setTimeout(30000, () => {
        console.error(`Request timeout for user: ${userId}`);
        req.abort();
        reject(new Error('Request timeout after 30 seconds'));
      });

      req.end();
    });
  } catch (error) {
    console.error(`Error in processMeetingsForUser for user ${userId}:`, error);
    throw error;
  }
};

// Process meetings for all enabled users
const processAllUsers = async () => {
  // Skip this cycle if already processing
  if (global.isProcessingCycle) {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║ ⚠️ CYCLE OVERLAP PREVENTED                              ║');
    console.log('║ Previous cycle still in progress. Skipping new cycle.  ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    return;
  }

  // Set cycle lock with timestamp
  global.isProcessingCycle = true;
  global.cycleStartTime = Date.now();
  const cycleId = `cycle_${Date.now()}`;
  console.log(`
╔════════════════════════════════════════════════════════╗
║ 🔄 STARTING NEW PROCESSING CYCLE                       ║
║ 🆔 Cycle ID: ${cycleId}                               ║
║ ⏰ Start Time: ${new Date().toISOString()}            ║
╚════════════════════════════════════════════════════════╝`);

  try {
    // Add cycle timeout protection (30 minutes)
    const cycleTimeout = setTimeout(() => {
      if (global.isProcessingCycle && global.cycleStartTime === cycleStartTime) {
        console.log(`
╔════════════════════════════════════════════════════════╗
║ ⚠️ CYCLE TIMEOUT                                       ║
║ Cycle ${cycleId} exceeded 30 minute timeout.           ║
║ Force releasing cycle lock.                            ║
╚════════════════════════════════════════════════════════╝`);
        global.isProcessingCycle = false;
      }
    }, 30 * 60 * 1000);

    for (const user of userData.users) {
      if (user.enabled) {
        try {
          await processMeetingsForUser(user.userId);
        } catch (error) {
          console.error(`Failed to process meetings for user ${user.userId}:`, error);
          // Continue with next user even if one fails
        }
      }
    }

    clearTimeout(cycleTimeout);
    console.log(`
╔════════════════════════════════════════════════════════╗
║ ✅ CYCLE COMPLETED SUCCESSFULLY                        ║
║ 🆔 Cycle ID: ${cycleId}                               ║
║ ⏱️ Duration: ${((Date.now() - global.cycleStartTime)/1000).toFixed(2)}s ║
╚════════════════════════════════════════════════════════╝`);
  } catch (error) {
    console.error('Error in processing cycle:', error);
  } finally {
    // Release the lock when done, regardless of success or failure
    global.isProcessingCycle = false;
    global.cycleStartTime = null;
  }
};

// Main function to start the processing cycle
const startProcessingCycle = () => {
  console.log('AI Agent Server started');
  
  // Initialize cycle control variables
  global.isProcessingCycle = false;
  global.cycleStartTime = null;
  
  // Process immediately on startup
  processAllUsers();
  
  // Set up interval to process meetings every 30 minutes (increased from 5 minutes)
  setInterval(processAllUsers, 30 * 60 * 1000);
};

// API server to handle enabling/disabling the AI agent
const url = require('url');

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  
  // API endpoint to enable/disable the AI agent for a user
  if (parsedUrl.pathname === '/api/agent-status' && req.method === 'POST') {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const { userId, enabled } = JSON.parse(body);
        
        if (!userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'userId is required' }));
          return;
        }

        // Update or add user data
        const existingUserIndex = userData.users.findIndex(user => user.userId === userId);
        
        if (existingUserIndex >= 0) {
          userData.users[existingUserIndex].enabled = enabled;
        } else {
          userData.users.push({ userId, enabled });
        }
        
        saveUserData();
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: `AI agent ${enabled ? 'enabled' : 'disabled'} for user ${userId}` 
        }));
        
        // If enabling, trigger processing immediately
        if (enabled) {
          processMeetingsForUser(userId).catch(error => {
            console.error(`Error processing meetings after enabling for user ${userId}:`, error);
          });
        }
      } catch (error) {
        console.error('Error processing agent-status request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
  }
  // API endpoint to get AI agent status for a user
  else if (parsedUrl.pathname === '/api/agent-status' && req.method === 'GET') {
    const userId = parsedUrl.query.userId;
    
    if (!userId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'userId is required' }));
      return;
    }
    
    const user = userData.users.find(user => user.userId === userId);
    const enabled = user ? user.enabled : false;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      enabled
    }));
  }
  // API endpoint to get system status
  else if (parsedUrl.pathname === '/api/status' && req.method === 'GET') {
    const enabledUsers = userData.users.filter(user => user.enabled).length;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      status: 'running',
      enabledUsers,
      totalUsers: userData.users.length,
      uptime: process.uptime()
    }));
  }
  else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not found' }));
  }
});

// Start the API server on port 3100
server.listen(3100, () => {
  console.log('AI Agent API server listening on port 3100');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Gracefully shutting down AI Agent Server...');
  server.close(() => {
    console.log('AI Agent API server closed');
    process.exit(0);
  });
});

// Start the processing cycle
startProcessingCycle(); 