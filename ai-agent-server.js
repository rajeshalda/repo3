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

      CREATE TABLE IF NOT EXISTS processing_cycles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cycle_id TEXT UNIQUE NOT NULL,
          status TEXT DEFAULT 'running',
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          user_id TEXT
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

// Cycle management functions
const getActiveCycle = () => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM processing_cycles
      WHERE status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `);
    return stmt.get();
  } catch (error) {
    console.error('Error getting active cycle:', error);
    return null;
  }
};

const startCycle = (cycleId, userId = null) => {
  try {
    const stmt = db.prepare(`
      INSERT INTO processing_cycles (cycle_id, status, user_id, started_at)
      VALUES (?, 'running', ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(cycleId, userId);
    console.log(`✅ Cycle ${cycleId} started in database`);
    return true;
  } catch (error) {
    console.error('Error starting cycle:', error);
    return false;
  }
};

const completeCycle = (cycleId) => {
  try {
    const stmt = db.prepare(`
      UPDATE processing_cycles
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE cycle_id = ?
    `);
    stmt.run(cycleId);
    console.log(`✅ Cycle ${cycleId} marked as completed in database`);
    return true;
  } catch (error) {
    console.error('Error completing cycle:', error);
    return false;
  }
};

const forceReleaseCycle = (cycleId) => {
  try {
    const stmt = db.prepare(`
      UPDATE processing_cycles
      SET status = 'timeout', completed_at = CURRENT_TIMESTAMP
      WHERE cycle_id = ?
    `);
    stmt.run(cycleId);
    console.log(`⚠️ Cycle ${cycleId} force-released due to timeout`);
    return true;
  } catch (error) {
    console.error('Error force-releasing cycle:', error);
    return false;
  }
};

// Per-user cycle management functions
const getActiveCycleForUser = (userId) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM processing_cycles
      WHERE user_id = ? AND status = 'running'
      ORDER BY started_at DESC
      LIMIT 1
    `);
    return stmt.get(userId);
  } catch (error) {
    console.error('Error getting active cycle for user:', error);
    return null;
  }
};

const hasActiveCycleForUser = (userId) => {
  const cycle = getActiveCycleForUser(userId);
  if (!cycle) return false;

  const cycleAge = Date.now() - new Date(cycle.started_at).getTime();
  const twoHours = 2 * 60 * 60 * 1000;  // 2 hour timeout per user

  if (cycleAge >= twoHours) {
    // Force release stuck cycle
    forceReleaseCycle(cycle.cycle_id);
    return false;
  }

  return true;
};

// ===================== PROCESSING QUEUE SYSTEM =====================

class ProcessingQueue {
  constructor() {
    this.userQueues = new Map();  // userId -> { queue: [], processing: false }
    console.log('✅ Processing queue system initialized');
  }

  addRequest(userId, source) {
    if (!userId) {
      console.error('❌ Cannot add request without userId');
      return;
    }

    // Initialize user queue if doesn't exist
    if (!this.userQueues.has(userId)) {
      this.userQueues.set(userId, {
        queue: [],
        processing: false
      });
    }

    const userQueue = this.userQueues.get(userId);

    // Check if user is currently processing
    if (userQueue.processing) {
      // Check if this source is already in queue (deduplicate)
      const existingIndex = userQueue.queue.findIndex(item => item.source === source);
      if (existingIndex >= 0) {
        console.log(`🔄 User ${userId} already has "${source}" in queue, updating timestamp`);
        userQueue.queue[existingIndex].requestedAt = Date.now();
        return;
      }
    }

    // Add request to queue
    userQueue.queue.push({
      source,
      requestedAt: Date.now()
    });

    console.log(`📥 Queued: ${userId} from "${source}" (queue length: ${userQueue.queue.length})`);

    // Try to start processing for this user
    this.processUserQueue(userId);
  }

  async processUserQueue(userId) {
    const userQueue = this.userQueues.get(userId);

    if (!userQueue) {
      console.log(`⚠️ No queue found for user ${userId}`);
      return;
    }

    // Already processing this user?
    if (userQueue.processing) {
      console.log(`⏸️ User ${userId} already processing, request will wait in queue`);
      return;
    }

    // Queue empty?
    if (userQueue.queue.length === 0) {
      // Clean up empty queue
      this.userQueues.delete(userId);
      return;
    }

    // Check if user has active cycle in database
    if (hasActiveCycleForUser(userId)) {
      console.log(`⏸️ User ${userId} has active cycle in DB, will retry in 10 seconds`);
      setTimeout(() => this.processUserQueue(userId), 10000);
      return;
    }

    // Check if user is still enabled
    const userSettings = getUserSettings(userId);
    if (!userSettings || !userSettings.enabled) {
      console.log(`⏭️ User ${userId} is disabled, clearing queue`);
      userQueue.queue = [];
      this.userQueues.delete(userId);
      return;
    }

    // Mark as processing
    userQueue.processing = true;

    // Get all queued requests and clear queue
    const requests = [...userQueue.queue];
    userQueue.queue = [];

    console.log(`
╔════════════════════════════════════════════════════════╗
║ 🔄 PROCESSING USER FROM QUEUE                          ║
║ 👤 User: ${userId}                                     ║
║ 📊 Requests: ${requests.length}                        ║
║ 📝 Sources: ${requests.map(r => r.source).join(', ')}  ║
╚════════════════════════════════════════════════════════╝`);

    const cycleId = `cycle_${userId}_${Date.now()}`;

    try {
      // Start cycle in database for this user
      startCycle(cycleId, userId);

      // Process meetings for this user
      await processMeetingsForUser(userId);

      console.log(`✅ User ${userId} processing completed successfully`);
    } catch (error) {
      console.error(`❌ Error processing user ${userId}:`, error);
    } finally {
      // Mark cycle as complete
      completeCycle(cycleId);

      // Mark as not processing
      userQueue.processing = false;

      // Check if more requests arrived while processing
      if (userQueue.queue.length > 0) {
        console.log(`📋 User ${userId} has ${userQueue.queue.length} more requests in queue, processing...`);
        setTimeout(() => this.processUserQueue(userId), 2000);  // 2 second delay
      } else {
        // Clean up empty queue
        this.userQueues.delete(userId);
      }
    }
  }

  getQueueStats() {
    const stats = {
      totalUsers: this.userQueues.size,
      usersProcessing: 0,
      totalQueued: 0,
      details: []
    };

    for (const [userId, userQueue] of this.userQueues.entries()) {
      if (userQueue.processing) {
        stats.usersProcessing++;
      }
      stats.totalQueued += userQueue.queue.length;

      if (userQueue.queue.length > 0 || userQueue.processing) {
        stats.details.push({
          userId,
          processing: userQueue.processing,
          queueLength: userQueue.queue.length
        });
      }
    }

    return stats;
  }
}

// Initialize global queue
const processingQueue = new ProcessingQueue();

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
      // Increased to 10 minutes to allow for full meeting processing cycle
      req.setTimeout(600000, () => {
        console.error(`Request timeout for user: ${userId}`);
        req.abort();
        reject(new Error('Request timeout after 10 minutes'));
      });

      req.end();
    });
  } catch (error) {
    console.error(`Error in processMeetingsForUser for user ${userId}:`, error);
    throw error;
  }
};

// Process meetings for all enabled users (now uses queue system)
const processAllUsers = async () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║ ⏰ SCHEDULED CYCLE TRIGGERED                           ║
║ 🕐 Time: ${new Date().toISOString()}                   ║
╚════════════════════════════════════════════════════════╝`);

  try {
    // Get enabled users from SQLite database
    const enabledUsers = getAllEnabledUsers();

    console.log(`📊 Found ${enabledUsers.length} enabled users in database`);

    if (enabledUsers.length === 0) {
      console.log('ℹ️ No enabled users to process');
      return;
    }

    // Add all enabled users to their respective queues
    for (const user of enabledUsers) {
      try {
        processingQueue.addRequest(user.user_id, 'scheduled');
      } catch (error) {
        console.error(`Failed to queue user ${user.user_id}:`, error);
        // Continue with next user even if one fails
      }
    }

    // Log queue statistics
    const stats = processingQueue.getQueueStats();
    console.log(`
╔════════════════════════════════════════════════════════╗
║ 📊 QUEUE STATISTICS                                    ║
║ 👥 Total Users: ${stats.totalUsers}                    ║
║ ⚙️ Processing: ${stats.usersProcessing}                ║
║ 📋 Queued Requests: ${stats.totalQueued}               ║
╚════════════════════════════════════════════════════════╝`);

  } catch (error) {
    console.error('Error in processAllUsers:', error);
  }
};

// Main function to start the processing cycle
const startProcessingCycle = () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║ 🤖 AI AGENT SERVER STARTED                             ║
║ ✅ SQLite backend initialized                          ║
║ ✅ DB-based per-user cycle locking active              ║
║ ✅ Processing queue system ready                       ║
║ ⏰ Scheduled interval: Every 30 minutes                ║
╚════════════════════════════════════════════════════════╝`);

  // Process immediately on startup
  processAllUsers();

  // Set up interval to process meetings every 30 minutes
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

        // If enabling, add to processing queue
        if (enabled) {
          try {
            processingQueue.addRequest(userId, 'user_enable');
            console.log(`✅ User ${userId} added to processing queue after enable`);
          } catch (error) {
            console.error(`Error adding user ${userId} to queue:`, error);
          }
        } else {
          // If disabling, clear any pending queue items for this user
          console.log(`🛑 User ${userId} disabled - any pending queue items will be cleared on next check`);
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

    // Get queue statistics
    const queueStats = processingQueue.getQueueStats();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      status: 'running',
      enabledUsers,
      totalUsers,
      uptime: process.uptime(),
      queue: queueStats
    }));
  }
  // API endpoint to get queue status
  else if (parsedUrl.pathname === '/api/queue-status' && req.method === 'GET') {
    const stats = processingQueue.getQueueStats();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      queue: stats
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