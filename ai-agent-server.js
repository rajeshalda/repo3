const fs = require('fs');
const path = require('path');
const http = require('http');
const { promisify } = require('util');
require('dotenv').config({ path: '.env.local' }); // Load environment variables

// Import SQLite database
const Database = require('better-sqlite3');

// Initialize SQLite database
const dbPath = path.join(process.cwd(), 'data', 'application.sqlite');
let db;

// Database initialization function
const initializeDatabase = () => {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = new Database(dbPath);
    
    // Enable foreign keys
    db.exec('PRAGMA foreign_keys = ON');
    
    // Create tables if they don't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          intervals_api_key TEXT,
          last_sync DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS user_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT UNIQUE NOT NULL,
          enabled BOOLEAN DEFAULT false,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );
    `);
    
    console.log('✅ SQLite database initialized for AI agent server');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  }
};

// Initialize database on startup
initializeDatabase();

// Helper functions for database operations
const getUserSettings = (userId) => {
  try {
    const stmt = db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
    return stmt.get(userId);
  } catch (error) {
    console.error('Error getting user settings:', error);
    return null;
  }
};

const getAllEnabledUsers = () => {
  try {
    const stmt = db.prepare(`
      SELECT u.user_id, u.email, s.enabled 
      FROM users u 
      LEFT JOIN user_settings s ON u.user_id = s.user_id 
      WHERE s.enabled = 1
    `);
    return stmt.all();
  } catch (error) {
    console.error('Error getting enabled users:', error);
    return [];
  }
};

const updateUserEnabled = (userId, enabled) => {
  try {
    // Ensure user exists in users table
    const userStmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
    let user = userStmt.get(userId);
    
    if (!user) {
      // Create user if doesn't exist
      const insertUserStmt = db.prepare(`
        INSERT INTO users (user_id, email, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      insertUserStmt.run(userId, userId);
    }
    
    // Update or insert user settings
    const settingsStmt = db.prepare(`
      INSERT OR REPLACE INTO user_settings (user_id, enabled, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    settingsStmt.run(userId, enabled ? 1 : 0);
    
    console.log(`✅ Updated user ${userId} enabled status to: ${enabled}`);
    return true;
  } catch (error) {
    console.error('Error updating user enabled status:', error);
    return false;
  }
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

    // Get enabled users from SQLite database
    const enabledUsers = getAllEnabledUsers();
    
    console.log(`📊 Found ${enabledUsers.length} enabled users in database`);
    
    for (const user of enabledUsers) {
      try {
        await processMeetingsForUser(user.user_id);
      } catch (error) {
        console.error(`Failed to process meetings for user ${user.user_id}:`, error);
        // Continue with next user even if one fails
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
  console.log('🤖 AI Agent Server started with SQLite backend');
  
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

        // Update user data in SQLite database
        const success = updateUserEnabled(userId, enabled);
        
        if (success) {
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
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Failed to update user settings' }));
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
    
    const userSettings = getUserSettings(userId);
    const enabled = userSettings ? Boolean(userSettings.enabled) : false;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      enabled
    }));
  }
  // API endpoint to get system status
  else if (parsedUrl.pathname === '/api/status' && req.method === 'GET') {
    const enabledUsers = getAllEnabledUsers().length;
    const allUsersStmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const totalUsers = allUsersStmt.get().count;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: true, 
      status: 'running',
      enabledUsers,
      totalUsers,
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