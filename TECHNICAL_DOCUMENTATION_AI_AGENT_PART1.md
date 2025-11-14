# Technical Documentation - Meeting Time Tracker Application
## Part 2: AI Agent Workflow (Part 1 of 2)

**Version:** 1.0
**Last Updated:** 2025-11-13
**Application Type:** Automated Background Processing System

---

## Table of Contents (Part 1)

1. [AI Agent Overview](#1-ai-agent-overview)
2. [PM2 Process Management](#2-pm2-process-management)
3. [AI Agent Directory Structure](#3-ai-agent-directory-structure)
4. [Queue Management System](#4-queue-management-system)
5. [Batch Processing Logic](#5-batch-processing-logic)
6. [JSON Storage System](#6-json-storage-system)
7. [Azure OpenAI Integration](#7-azure-openai-integration)
8. [Microsoft Graph API with Application Permissions](#8-microsoft-graph-api-with-application-permissions)

---

## 1. AI Agent Overview

### What is the AI Agent?

The AI Agent is a sophisticated, independently-running background processing system designed to automatically:
- Process Microsoft Teams meetings without user interaction
- Match meetings to tasks using artificial intelligence
- Create time entries in Intervals time tracking system
- Queue ambiguous cases for human review
- Operate 24/7 on a scheduled basis

### Key Differences from Manual Workflow

| Aspect | Manual Workflow | AI Agent Workflow |
|--------|----------------|-------------------|
| **Trigger** | User clicks button | Scheduled every 30 minutes |
| **Authentication** | Delegated (requires user login) | Application (background, no user) |
| **Task Matching** | User selects manually | AI-powered automatic matching |
| **Time Entry** | User clicks "Post" | Automatic if confident |
| **User Interaction** | Required constantly | One-time setup + reviews |
| **Processing Speed** | Immediate | Batch (max 30 min delay) |
| **Error Handling** | User corrects immediately | Queued for review |
| **Timezone** | User's browser timezone | IST (hardcoded) |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PM2 Process Manager                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           ai-agent-server.js (Port 3100)              │  │
│  │  - HTTP Server for control endpoints                  │  │
│  │  - 30-minute scheduled processing cycle               │  │
│  │  - SQLite database connection                         │  │
│  │  - User enablement management                         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              AI Agent Processing Pipeline                    │
│                                                              │
│  1. Fetch Meetings (Microsoft Graph API - App Permissions)  │
│  2. Analyze Meetings (Azure OpenAI)                         │
│  3. Process Attendance Reports                              │
│  4. Match Tasks (AI-powered)                                │
│  5. Create Time Entries (Intervals API)                     │
│  6. Queue Unmatched for Review                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Data Storage Layer                          │
│  - SQLite: users, user_settings, meetings, reviews          │
│  - JSON Cache: ai-agent-meetings.json (meeting cache)       │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **PM2 Server** | `ai-agent-server.js` | Process orchestration and scheduling |
| **Queue Manager** | `src/ai-agent/services/queue/queue-manager.ts` | Sequential meeting processing |
| **Batch Processor** | `src/ai-agent/services/meeting/batch-processor.ts` | Parallel batch processing |
| **OpenAI Client** | `src/ai-agent/core/azure-openai/client.ts` | AI analysis and matching |
| **Graph Service** | `src/ai-agent/services/meeting/graph-meetings.ts` | Meeting retrieval |
| **Task Service** | `src/ai-agent/services/task/intervals.ts` | Task fetching and matching |
| **Time Entry Service** | `src/ai-agent/services/time-entry/intervals.ts` | Automatic posting |
| **Review Service** | `src/ai-agent/services/review/review-service.ts` | Manual review queue |
| **Storage Manager** | `src/ai-agent/data/storage/manager.ts` | Data persistence |

---

## 2. PM2 Process Management

### PM2 Configuration

**File Location:** `pm2.config.js`

```javascript
module.exports = {
  apps: [{
    name: 'ai-agent',
    script: 'ai-agent-server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3100,
      // All .env.local variables loaded via dotenv
    },
    error_file: './logs/ai-agent-error.log',
    out_file: './logs/ai-agent-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    kill_timeout: 5000
  }]
};
```

**Key Configuration Points:**

| Setting | Value | Purpose |
|---------|-------|---------|
| `instances` | 1 | Single process (not clustered) |
| `autorestart` | true | Auto-restart on crash |
| `watch` | false | Don't watch file changes (production) |
| `max_memory_restart` | 500M | Restart if memory exceeds 500MB |
| `kill_timeout` | 5000ms | Wait 5s for graceful shutdown |
| `merge_logs` | true | Combine stdout and stderr |

### PM2 Management Commands

**Start AI Agent:**
```bash
npm run pm2:start
# Equivalent: pm2 start pm2.config.js
```

**Stop AI Agent:**
```bash
npm run pm2:stop
# Equivalent: pm2 stop ai-agent
```

**Restart AI Agent:**
```bash
npm run pm2:restart
# Equivalent: pm2 restart ai-agent
```

**Check Status:**
```bash
npm run pm2:status
# Equivalent: pm2 list
# Shows: name, status (online/stopped), CPU, memory, uptime, restarts
```

**View Logs:**
```bash
npm run pm2:logs
# Equivalent: pm2 logs ai-agent
# Shows: real-time log stream
```

**Monitor Resources:**
```bash
npm run pm2:monitor
# Equivalent: pm2 monit
# Shows: interactive dashboard with CPU, memory, logs
```

**Delete Process:**
```bash
pm2 delete ai-agent
# Removes from PM2 process list
```

---

### AI Agent Server (ai-agent-server.js)

**File Location:** `ai-agent-server.js`

**Purpose:** Core PM2 process that orchestrates all AI agent operations

#### Server Initialization

```javascript
const express = require('express');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });

// Initialize SQLite database
const db = new Database('data/application.sqlite');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables if not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    intervals_api_key TEXT,
    last_sync DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    enabled BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
  )
`);
```

**Location:** `ai-agent-server.js:1-50`

---

#### Database Operations

**1. Get User Settings**
```javascript
function getUserSettings(userId) {
  const stmt = db.prepare(`
    SELECT enabled
    FROM user_settings
    WHERE user_id = ?
  `);
  const result = stmt.get(userId);
  return result ? { enabled: Boolean(result.enabled) } : { enabled: false };
}
```
**Location:** `ai-agent-server.js:52-60`

---

**2. Get All Enabled Users**
```javascript
function getAllEnabledUsers() {
  const stmt = db.prepare(`
    SELECT u.user_id, u.email
    FROM users u
    JOIN user_settings us ON u.user_id = us.user_id
    WHERE us.enabled = 1
  `);
  return stmt.all();
}
```
**Purpose:** Returns list of users who have AI agent enabled
**Location:** `ai-agent-server.js:62-72`

---

**3. Update User Enabled Status**
```javascript
function updateUserEnabled(userId, enabled) {
  // Create user if doesn't exist
  const userStmt = db.prepare(`
    INSERT OR IGNORE INTO users (user_id, email)
    VALUES (?, ?)
  `);
  userStmt.run(userId, userId);

  // Update or insert settings
  const settingsStmt = db.prepare(`
    INSERT INTO user_settings (user_id, enabled, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = CURRENT_TIMESTAMP
  `);
  settingsStmt.run(userId, enabled ? 1 : 0);

  console.log(`✅ Updated user ${userId}: enabled=${enabled}`);
}
```
**Location:** `ai-agent-server.js:74-95`

---

#### Processing Functions

**4. Process Meetings for Single User**
```javascript
async function processMeetingsForUser(userId) {
  console.log(`🔄 Processing meetings for user: ${userId}`);

  try {
    const response = await fetch(
      `http://localhost:8080/api/process-meetings?userId=${userId}&source=pm2`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000  // 30 second timeout
      }
    );

    const data = await response.json();
    console.log(`✅ Processing completed for ${userId}:`, data);
    return data;
  } catch (error) {
    console.error(`❌ Error processing ${userId}:`, error.message);
    throw error;
  }
}
```
**Location:** `ai-agent-server.js:97-120`

---

**5. Process All Enabled Users (Main Cycle)**
```javascript
async function processAllUsers() {
  // Prevent overlapping cycles
  if (global.isProcessingCycle) {
    console.log('⏸️  Processing cycle already running, skipping...');
    return;
  }

  global.isProcessingCycle = true;
  global.cycleStartTime = Date.now();

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ 🔄 STARTING NEW PROCESSING CYCLE                       ║');
  console.log(`║ 🆔 Cycle ID: cycle_${Date.now()}                        ║`);
  console.log(`║ ⏰ Start Time: ${new Date().toISOString()}              ║`);
  console.log('╚════════════════════════════════════════════════════════╝');

  // Set timeout to force release after 30 minutes
  const cycleTimeout = setTimeout(() => {
    const cycleAge = (Date.now() - global.cycleStartTime) / 1000;
    if (global.isProcessingCycle && cycleAge > 1800) {
      console.error('⚠️  CYCLE TIMEOUT: Forcing unlock after 30 minutes');
      global.isProcessingCycle = false;
    }
  }, 30 * 60 * 1000);

  try {
    // Get all enabled users
    const enabledUsers = getAllEnabledUsers();
    console.log(`📊 Found ${enabledUsers.length} enabled users in database`);

    if (enabledUsers.length === 0) {
      console.log('ℹ️  No enabled users found');
      return;
    }

    // Process each user
    for (const user of enabledUsers) {
      try {
        await processMeetingsForUser(user.user_id);
      } catch (error) {
        console.error(`❌ Failed for ${user.user_id}:`, error.message);
        // Continue to next user even if one fails
      }
    }

    const duration = ((Date.now() - global.cycleStartTime) / 1000).toFixed(2);
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║ ✅ CYCLE COMPLETED SUCCESSFULLY                        ║');
    console.log(`║ ⏱️  Duration: ${duration}s                              ║`);
    console.log('╚════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('❌ Error in processing cycle:', error);
  } finally {
    clearTimeout(cycleTimeout);
    global.isProcessingCycle = false;
  }
}
```
**Location:** `ai-agent-server.js:122-180`

---

**6. Start Processing Cycle (Scheduled)**
```javascript
function startProcessingCycle() {
  console.log('🚀 AI Agent starting...');
  console.log(`📍 Server running on port 3100`);
  console.log(`⏰ Processing interval: every 30 minutes`);

  // Run immediately on startup
  processAllUsers().catch(error => {
    console.error('Error in initial processing:', error);
  });

  // Schedule every 30 minutes
  setInterval(() => {
    processAllUsers().catch(error => {
      console.error('Error in scheduled processing:', error);
    });
  }, 30 * 60 * 1000);  // 30 minutes = 1,800,000 ms
}
```
**Location:** `ai-agent-server.js:182-200`

---

#### HTTP API Endpoints

**Server Setup:**
```javascript
const app = express();
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const PORT = 3100;
app.listen(PORT, () => {
  console.log(`AI Agent server listening on port ${PORT}`);
  startProcessingCycle();
});
```
**Location:** `ai-agent-server.js:202-220`

---

**Endpoint 1: Enable/Disable AI Agent**
```javascript
app.post('/api/agent-status', (req, res) => {
  const { userId, enabled } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId is required'
    });
  }

  try {
    updateUserEnabled(userId, enabled);

    // Optionally trigger immediate processing
    if (enabled) {
      processMeetingsForUser(userId).catch(error => {
        console.error(`Error processing on enable: ${error.message}`);
      });
    }

    res.json({
      success: true,
      enabled,
      message: `AI Agent ${enabled ? 'enabled' : 'disabled'} for ${userId}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```
**Method:** POST
**Path:** `/api/agent-status`
**Body:** `{ userId: string, enabled: boolean }`
**Response:** `{ success: boolean, enabled: boolean, message: string }`
**Location:** `ai-agent-server.js:222-250`

---

**Endpoint 2: Check Agent Status**
```javascript
app.get('/api/agent-status', (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'userId query parameter is required'
    });
  }

  try {
    const settings = getUserSettings(userId);
    res.json({
      success: true,
      enabled: settings.enabled
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```
**Method:** GET
**Path:** `/api/agent-status?userId={userId}`
**Response:** `{ success: boolean, enabled: boolean }`
**Location:** `ai-agent-server.js:252-275`

---

**Endpoint 3: System Status**
```javascript
app.get('/api/status', (req, res) => {
  try {
    const enabledUsers = getAllEnabledUsers();
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();

    res.json({
      success: true,
      status: 'running',
      enabledUsers: enabledUsers.length,
      totalUsers: totalUsers.count,
      uptime: process.uptime(),
      isProcessing: global.isProcessingCycle || false,
      lastCycleStart: global.cycleStartTime
        ? new Date(global.cycleStartTime).toISOString()
        : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```
**Method:** GET
**Path:** `/api/status`
**Response:**
```json
{
  "success": true,
  "status": "running",
  "enabledUsers": 5,
  "totalUsers": 12,
  "uptime": 3600.5,
  "isProcessing": false,
  "lastCycleStart": "2025-01-15T10:00:00.000Z"
}
```
**Location:** `ai-agent-server.js:277-305`

---

#### Graceful Shutdown

```javascript
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT signal');
  console.log('🔄 Shutting down gracefully...');

  // Clear processing lock
  if (global.isProcessingCycle) {
    console.log('⚠️  Force releasing processing lock');
    global.isProcessingCycle = false;
  }

  // Close database connection
  db.close();
  console.log('✅ Database connection closed');

  // Exit process
  process.exit(0);
});
```
**Location:** `ai-agent-server.js:307-325`

---

### Processing Cycle Timeline

```
Time 0:00  → PM2 starts ai-agent-server.js
Time 0:01  → startProcessingCycle() called
Time 0:02  → processAllUsers() runs immediately (first cycle)
Time 0:02  → Fetches enabled users from database
Time 0:03  → Calls POST /api/process-meetings for each user
Time 0:15  → First cycle completes (example: 13 seconds)
Time 0:15  → setInterval schedules next cycle in 30 minutes

Time 30:15 → Second cycle starts automatically
Time 30:30 → Second cycle completes

Time 60:30 → Third cycle starts
...continues every 30 minutes indefinitely
```

---

## 3. AI Agent Directory Structure

```
src/ai-agent/
├── components/
│   └── review/                          [Review UI components - not used by server]
│
├── config/
│   └── azure-openai.ts                  [Azure OpenAI configuration]
│
├── core/
│   ├── azure-openai/
│   │   ├── client.ts                    [Azure OpenAI API client ⭐]
│   │   └── prompts/
│   │       ├── meeting-analysis.ts      [Meeting analysis prompt templates]
│   │       ├── task-matching.ts         [Task matching prompt templates]
│   │       ├── meeting-comparison.ts    [Meeting comparison prompts]
│   │       └── report-selection.ts      [Attendance report selection prompts]
│   │
│   └── rate-limiter/
│       └── token-bucket.ts              [Token bucket rate limiting ⭐]
│
├── data/
│   └── storage/
│       ├── json/
│       │   ├── ai-agent-meetings.json   [Meeting cache (temporary storage)]
│       │   ├── reviews.json             [Meeting reviews (legacy)]
│       │   └── review-decisions.json    [User review decisions]
│       │
│       └── manager.ts                   [Storage manager ⭐]
│
├── services/
│   ├── meeting/
│   │   ├── graph-meetings.ts            [Microsoft Graph API integration ⭐]
│   │   ├── openai.ts                    [Meeting analysis with OpenAI]
│   │   ├── batch-processor.ts           [Batch processing logic ⭐]
│   │   ├── batch-example.ts             [Example batch processing]
│   │   ├── comparison.ts                [Meeting comparison logic]
│   │   ├── attendance-report-manager.ts [Attendance report processing ⭐]
│   │   └── types/
│   │       └── attendance.ts            [Attendance-related types]
│   │
│   ├── task/
│   │   ├── intervals.ts                 [Intervals API task integration ⭐]
│   │   ├── openai.ts                    [AI task matching]
│   │   └── direct-fetcher.ts            [Direct task fetching]
│   │
│   ├── time-entry/
│   │   └── intervals.ts                 [Time entry creation service ⭐]
│   │
│   ├── queue/
│   │   └── queue-manager.ts             [Meeting queue system ⭐]
│   │
│   ├── review/
│   │   ├── review-service.ts            [Review management ⭐]
│   │   └── types.ts                     [Review-related types]
│   │
│   ├── storage/
│   │   └── posted-meetings.ts           [Posted meetings storage]
│   │
│   └── prompt/
│       └── [Prompt generation utilities]
│
└── utils/
    └── file.ts                          [File system utilities]
```

**Legend:**
- ⭐ = Core files critical to AI agent operation
- Regular = Supporting files
- [Descriptions] = Purpose of each file/directory

---

### Key Files and Their Purposes

| File Path | Purpose | Used By |
|-----------|---------|---------|
| `core/azure-openai/client.ts` | Azure OpenAI API client with retry logic | All AI operations |
| `core/rate-limiter/token-bucket.ts` | Rate limiting to prevent API throttling | Queue, Batch Processor |
| `services/queue/queue-manager.ts` | Sequential meeting processing queue | Process-meetings API |
| `services/meeting/batch-processor.ts` | Parallel batch processing (5 meetings) | Process-meetings API |
| `services/meeting/graph-meetings.ts` | Fetch meetings from Microsoft Graph | Process-meetings API |
| `services/meeting/attendance-report-manager.ts` | Validate and process attendance reports | Meeting processing |
| `services/task/intervals.ts` | Fetch tasks and match to meetings | Task matching |
| `services/time-entry/intervals.ts` | Create time entries in Intervals | Automatic posting |
| `services/review/review-service.ts` | Manage review queue for unmatched meetings | Process-meetings API |
| `data/storage/manager.ts` | Unified storage interface (SQLite + JSON) | All services |

---

## 4. Queue Management System

### QueueManager Class

**File Location:** `src/ai-agent/services/queue/queue-manager.ts`

**Architecture:** Singleton pattern with internal queue array

#### Class Structure

```typescript
class QueueManager {
  private static instance: QueueManager;
  private queue: QueueItem[] = [];
  private isProcessing: boolean = false;
  private rateLimiter: RateLimiter;
  private processingInterval: number;

  private constructor() {
    // Default: 48 requests per minute (Azure OpenAI S0 tier)
    this.rateLimiter = new RateLimiter(48);
    this.processingInterval = 60000 / 48; // ~1250ms per request
  }

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }
}
```

**Location:** `src/ai-agent/services/queue/queue-manager.ts:1-25`

---

#### Queue Item Structure

```typescript
interface QueueItem {
  meeting: ProcessedMeeting;
  userId: string;
  processFunction: (
    meeting: ProcessedMeeting,
    userId: string
  ) => Promise<ProcessedMeeting>;
  resolve: (result: ProcessedMeeting) => void;
  reject: (error: Error) => void;
}
```

**Purpose:** Each queue item contains:
- **meeting** - The meeting to process
- **userId** - Owner of the meeting
- **processFunction** - Function to execute (e.g., AI analysis)
- **resolve** - Promise resolver for success
- **reject** - Promise resolver for errors

**Location:** `src/ai-agent/services/queue/queue-manager.ts:27-35`

---

#### Method 1: Queue Meeting Analysis

```typescript
public async queueMeetingAnalysis(
  meeting: ProcessedMeeting,
  userId: string,
  processFunction: (meeting, userId) => Promise<ProcessedMeeting>
): Promise<ProcessedMeeting> {
  return new Promise((resolve, reject) => {
    const queueItem: QueueItem = {
      meeting,
      userId,
      processFunction,
      resolve,
      reject
    };

    this.queue.push(queueItem);

    console.log(`📥 QUEUE: Added meeting "${meeting.subject}" [${meeting.id}]`);
    console.log(`📊 QUEUE STATUS: ${this.queue.length} items waiting`);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue();
    }
  });
}
```

**Purpose:** Adds a meeting to the queue and returns a Promise that resolves when processing completes

**Flow:**
1. Create queue item with meeting, userId, and processing function
2. Add to end of queue array
3. Log queue status
4. Start processing if not already running
5. Return promise that resolves later

**Location:** `src/ai-agent/services/queue/queue-manager.ts:37-65`

---

#### Method 2: Process Queue

```typescript
private async processQueue(): Promise<void> {
  if (this.isProcessing) {
    console.log('⏸️  Queue already processing, skipping...');
    return;
  }

  this.isProcessing = true;
  const cycleId = `queue_${Date.now()}`;

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log(`║ ⚙️  QUEUE: Starting queue processor [${cycleId}]       ║`);
  console.log(`║ 📊 QUEUE: ${this.queue.length} items to process        ║`);
  console.log('╚════════════════════════════════════════════════════════╝');

  // Set timeout to force unlock after 30 minutes
  const cycleTimeout = setTimeout(() => {
    console.error('⚠️  QUEUE TIMEOUT: Forcing unlock after 30 minutes');
    this.isProcessing = false;
  }, 30 * 60 * 1000);

  const startTime = Date.now();

  try {
    while (this.queue.length > 0) {
      // Wait for rate limiter token
      await this.rateLimiter.waitForCapacity();
      console.log('✅ RATE LIMITER: Token acquired');

      // Get next item from queue (FIFO)
      const item = this.queue.shift();
      if (!item) break;

      console.log(`🔍 PROCESSING: "${item.meeting.subject}" [${item.meeting.id}]`);

      try {
        // Execute the processing function
        const itemStartTime = Date.now();
        const result = await item.processFunction(item.meeting, item.userId);
        const itemDuration = ((Date.now() - itemStartTime) / 1000).toFixed(2);

        console.log(`✅ COMPLETED: "${item.meeting.subject}" in ${itemDuration}s`);

        // Resolve promise
        item.resolve(result);
      } catch (error) {
        console.error(`❌ ERROR: "${item.meeting.subject}":`, error.message);

        // Reject promise
        item.reject(error as Error);
      }

      // Wait processing interval before next item
      if (this.queue.length > 0) {
        console.log(`⏳ Waiting ${this.processingInterval}ms before next item...`);
        await this.sleep(this.processingInterval);
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log(`║ ✅ QUEUE: Processing cycle complete [${cycleId}]       ║`);
    console.log(`║ ⏱️  Duration: ${totalDuration}s                         ║`);
    console.log('╚════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('❌ Error in queue processing:', error);
  } finally {
    clearTimeout(cycleTimeout);
    this.isProcessing = false;
  }
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Purpose:** Main queue processing loop - processes items sequentially with rate limiting

**Flow:**
1. Check if already processing (prevent overlap)
2. Set processing flag to true
3. Create cycle timeout (30 minutes max)
4. Loop while queue has items:
   - Wait for rate limiter token
   - Shift first item from queue (FIFO)
   - Execute processing function
   - Resolve/reject promise
   - Wait processing interval
5. Clear timeout and release processing flag

**Key Features:**
- **Sequential processing** - One meeting at a time
- **Rate limiting** - Respects API limits
- **Timeout protection** - 30-minute max cycle time
- **Promise-based** - Returns results to caller
- **Error isolation** - One failure doesn't stop queue

**Location:** `src/ai-agent/services/queue/queue-manager.ts:67-150`

---

#### Method 3: Get Queue Length

```typescript
public getQueueLength(): number {
  return this.queue.length;
}
```

**Purpose:** Returns current number of items waiting in queue

**Location:** `src/ai-agent/services/queue/queue-manager.ts:152-155`

---

#### Method 4: Clear Queue

```typescript
public clearQueue(): void {
  const clearedCount = this.queue.length;

  // Reject all pending promises
  this.queue.forEach(item => {
    item.reject(new Error('Queue was cleared'));
  });

  this.queue = [];
  console.log(`🗑️  QUEUE: Cleared ${clearedCount} items`);
}
```

**Purpose:** Clears all pending queue items and rejects their promises

**Use Cases:**
- User disables AI agent
- System shutdown
- Error recovery

**Location:** `src/ai-agent/services/queue/queue-manager.ts:157-170`

---

#### Method 5: Update Rate Limit

```typescript
public updateRateLimit(requestsPerMinute: number): void {
  this.rateLimiter = new RateLimiter(requestsPerMinute);
  this.processingInterval = 60000 / requestsPerMinute;

  console.log(`📶 QUEUE: Updated rate limit to ${requestsPerMinute} req/min`);
  console.log(`⏱️  Processing interval: ${this.processingInterval}ms`);
}
```

**Purpose:** Dynamically adjust rate limiting (e.g., if Azure quota changes)

**Example:**
```typescript
// Increase to 100 requests/minute
queueManager.updateRateLimit(100);
// Now: 600ms between requests instead of 1250ms
```

**Location:** `src/ai-agent/services/queue/queue-manager.ts:172-185`

---

### Queue Usage Example

```typescript
import { QueueManager } from '@/ai-agent/services/queue/queue-manager';

// Get singleton instance
const queueManager = QueueManager.getInstance();

// Define processing function
async function analyzeMeetingWithAI(
  meeting: ProcessedMeeting,
  userId: string
): Promise<ProcessedMeeting> {
  // Call Azure OpenAI for analysis
  const analysis = await openAIClient.analyzeMeeting(meeting);
  return { ...meeting, analysis };
}

// Queue meeting for processing
const processedMeeting = await queueManager.queueMeetingAnalysis(
  meeting,
  userId,
  analyzeMeetingWithAI
);

console.log('Meeting processed:', processedMeeting.analysis);
```

---

## 5. Batch Processing Logic

### BatchProcessor Class

**File Location:** `src/ai-agent/services/meeting/batch-processor.ts`

**Architecture:** Singleton pattern, works alongside QueueManager

#### Class Structure

```typescript
class BatchProcessor {
  private static instance: BatchProcessor;
  private batchResults: Map<string, BatchResult> = new Map();
  private rateLimiter: RateLimiter;
  private readonly MAX_CONCURRENT_BATCHES = 3;
  private readonly BATCH_SIZE = 5;

  private constructor() {
    this.rateLimiter = new RateLimiter(48); // 48 req/min default
  }

  public static getInstance(): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor();
    }
    return BatchProcessor.instance;
  }
}
```

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:1-20`

---

#### Batch Result Structure

```typescript
interface BatchResult {
  batchId: string;
  totalMeetings: number;
  completedMeetings: number;
  processed: ProcessedMeeting[];
  failed: Array<{
    meeting: ProcessedMeeting;
    error: Error;
  }>;
  status: 'processing' | 'completed' | 'failed';
  startTime: number;
  endTime?: number;
}
```

**Purpose:** Tracks progress and results of batch processing

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:22-35`

---

#### Method 1: Process Meeting Batch

```typescript
public async processMeetingBatch(
  meetings: ProcessedMeeting[],
  userId: string
): Promise<string> {
  // Generate unique batch ID
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Initialize batch result
  const batchResult: BatchResult = {
    batchId,
    totalMeetings: meetings.length,
    completedMeetings: 0,
    processed: [],
    failed: [],
    status: 'processing',
    startTime: Date.now()
  };

  this.batchResults.set(batchId, batchResult);

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log(`║ 🔄 STARTING BATCH PROCESSING [${batchId}]              ║`);
  console.log(`║ 📊 Total meetings: ${meetings.length}                   ║`);
  console.log(`║ 🆔 Cycle ID: ${batchId}                                 ║`);
  console.log('╚════════════════════════════════════════════════════════╝');

  // Set timeout for batch (30 minutes max)
  const batchTimeout = setTimeout(() => {
    if (batchResult.status === 'processing') {
      console.error(`⚠️  BATCH TIMEOUT: ${batchId} exceeded 30 minutes`);
      batchResult.status = 'failed';
    }
  }, 30 * 60 * 1000);

  try {
    // Process in chunks of BATCH_SIZE (5 meetings)
    const chunks = this.chunkArray(meetings, this.BATCH_SIZE);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      console.log(`▶️ Processing batch ${i + 1}/${chunks.length} (${chunk.length} meetings)`);

      // Check if rate limiter has enough tokens for this batch
      const tokensNeeded = chunk.length;
      const hasCapacity = await this.rateLimiter.hasCapacity(tokensNeeded);

      if (!hasCapacity) {
        console.log(`⏳ Waiting for rate limiter capacity (${tokensNeeded} tokens)...`);
        await this.rateLimiter.waitForCapacity(tokensNeeded);
      }

      // Acquire tokens for the batch
      await this.rateLimiter.consume(tokensNeeded);
      console.log(`✅ Acquired ${tokensNeeded} tokens from rate limiter`);

      // Process all meetings in this chunk in parallel
      const chunkPromises = chunk.map(meeting =>
        this.processMeeting(meeting, userId, batchId)
      );

      await Promise.all(chunkPromises);

      // Wait 1 second before next batch
      if (i < chunks.length - 1) {
        console.log('⏳ Waiting 1s before next batch...');
        await this.sleep(1000);
      }

      console.log(`✅ Batch ${i + 1}/${chunks.length} completed`);
      console.log(`✓ Progress: ${batchResult.completedMeetings}/${batchResult.totalMeetings} meetings`);
    }

    // Mark batch as completed
    batchResult.status = 'completed';
    batchResult.endTime = Date.now();

    const duration = ((batchResult.endTime - batchResult.startTime) / 1000).toFixed(2);

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log(`║ ✅ BATCH COMPLETED [${batchId}]                        ║`);
    console.log(`║ ⏱️  Duration: ${duration}s                              ║`);
    console.log(`║ 📊 Processed: ${batchResult.processed.length}/${batchResult.totalMeetings} ║`);
    console.log(`║ ❌ Failed: ${batchResult.failed.length}                 ║`);
    console.log('╚════════════════════════════════════════════════════════╝');

    return batchId;
  } catch (error) {
    console.error(`❌ Error in batch processing [${batchId}]:`, error);
    batchResult.status = 'failed';
    batchResult.endTime = Date.now();
    throw error;
  } finally {
    clearTimeout(batchTimeout);
  }
}

private chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Purpose:** Process multiple meetings in batches with parallel execution

**Flow:**
1. Generate unique batch ID
2. Initialize batch result tracking
3. Set 30-minute timeout
4. Divide meetings into chunks of 5
5. For each chunk:
   - Check rate limiter capacity
   - Acquire tokens (5 for 5 meetings)
   - Process all 5 in parallel with Promise.all
   - Wait 1 second before next chunk
6. Mark batch as completed
7. Return batch ID for status tracking

**Key Difference from Queue:**
- **Queue:** Sequential (one at a time)
- **Batch:** Groups of 5 processed in parallel

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:37-150`

---

#### Method 2: Process Single Meeting

```typescript
private async processMeeting(
  meeting: ProcessedMeeting,
  userId: string,
  batchId: string
): Promise<void> {
  try {
    console.log(`  🔍 Processing: "${meeting.subject}" [${meeting.id}]`);

    // Queue the meeting for analysis (uses QueueManager internally)
    const queueManager = QueueManager.getInstance();
    const processed = await queueManager.queueMeetingAnalysis(
      meeting,
      userId,
      async (m, u) => {
        // Actual processing logic (e.g., AI analysis, task matching)
        const analysis = await analyzeMeetingWithOpenAI(m);
        return { ...m, analysis };
      }
    );

    // Add to batch results
    const batchResult = this.batchResults.get(batchId);
    if (batchResult) {
      batchResult.processed.push(processed);
      batchResult.completedMeetings++;
    }

    console.log(`  ✅ Completed: "${meeting.subject}"`);
  } catch (error) {
    console.error(`  ❌ Failed: "${meeting.subject}":`, error.message);

    // Add to failed array
    const batchResult = this.batchResults.get(batchId);
    if (batchResult) {
      batchResult.failed.push({ meeting, error: error as Error });
      batchResult.completedMeetings++;  // Still counts as processed
    }
  }
}
```

**Purpose:** Process a single meeting and update batch result

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:152-190`

---

#### Method 3: Get Batch Status

```typescript
public getBatchStatus(batchId: string): BatchResult | undefined {
  return this.batchResults.get(batchId);
}
```

**Purpose:** Retrieve batch processing status for monitoring

**Example Usage:**
```typescript
const batchId = await batchProcessor.processMeetingBatch(meetings, userId);

// Poll status
const interval = setInterval(() => {
  const status = batchProcessor.getBatchStatus(batchId);
  console.log(`Progress: ${status.completedMeetings}/${status.totalMeetings}`);

  if (status.status !== 'processing') {
    clearInterval(interval);
    console.log('Batch complete!', status);
  }
}, 1000);
```

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:192-195`

---

#### Method 4: Update Rate Limit

```typescript
public updateRateLimit(requestsPerMinute: number): void {
  this.rateLimiter = new RateLimiter(requestsPerMinute);
  console.log(`📶 BATCH: Updated rate limit to ${requestsPerMinute} req/min`);
}
```

**Purpose:** Adjust rate limiting dynamically

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:197-202`

---

### Batch Processing Example

```typescript
import { BatchProcessor } from '@/ai-agent/services/meeting/batch-processor';

// Get singleton instance
const batchProcessor = BatchProcessor.getInstance();

// Process 25 meetings
const meetings = [...]; // Array of 25 meetings
const batchId = await batchProcessor.processMeetingBatch(meetings, userId);

console.log('Batch started:', batchId);

// Check status
const status = batchProcessor.getBatchStatus(batchId);
console.log('Status:', status);
// Output:
// {
//   batchId: 'batch_1699564800_abc123',
//   totalMeetings: 25,
//   completedMeetings: 25,
//   processed: [...25 meetings...],
//   failed: [],
//   status: 'completed'
// }
```

---

## 6. JSON Storage System

### StorageManager Class

**File Location:** `src/ai-agent/data/storage/manager.ts`

**Purpose:** Unified interface for storing and retrieving data in JSON files and SQLite database

#### Storage Locations

| Data Type | Storage Format | File/Table | Purpose |
|-----------|---------------|------------|---------|
| **Processed Meetings (Cache)** | JSON | `ai-agent-meetings.json` | Temporary cache for meeting analysis |
| **Reviews** | SQLite | `reviews` table | Meeting review queue |
| **Review Decisions** | JSON | `review-decisions.json` | User review decisions |
| **User Enablement** | SQLite | `user_settings` table | Track which users enabled AI agent |

**Base Path:** `src/ai-agent/data/storage/json/`

---

#### Data Storage Strategy

**Important Notes:**

1. **ai-agent-meetings.json** - Temporary cache only
   - Used for intermediate processing and analysis
   - NOT the source of truth for posted meetings
   - Can be cleared without data loss
   - Purpose: Performance optimization during batch processing

2. **User Enablement** - Stored in SQLite `user_settings` table
   - Previously used `pm2-user-data.json` (deprecated)
   - Now fully managed via SQLite database
   - `ai-agent-server.js` queries database directly
   - More reliable and supports concurrent access

3. **Posted Meetings** - Stored in SQLite `meetings` table
   - Final source of truth
   - Includes full time entry data
   - Prevents duplicate postings via unique constraints
   - Queryable for reporting and history

4. **Reviews** - Stored in SQLite `reviews` table
   - SQLite-backed (not JSON)
   - Replaces legacy `reviews.json` file
   - Supports complex queries and status updates

---

#### Class Structure

```typescript
class StorageManager {
  private static instance: StorageManager;
  private readonly STORAGE_PATH = path.join(
    process.cwd(),
    'src/ai-agent/data/storage/json'
  );
  private db: Database;

  private constructor() {
    // Initialize SQLite database
    this.db = new Database('data/application.sqlite');
    this.db.pragma('foreign_keys = ON');

    // Ensure storage directory exists
    if (!fs.existsSync(this.STORAGE_PATH)) {
      fs.mkdirSync(this.STORAGE_PATH, { recursive: true });
    }
  }

  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }
}
```

**Location:** `src/ai-agent/data/storage/manager.ts:1-30`

---

#### Meeting Storage Methods

**1. Load All Meetings (from Cache)**
```typescript
public loadMeetings(): ProcessedMeeting[] {
  try {
    const filePath = path.join(this.STORAGE_PATH, 'ai-agent-meetings.json');

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Handle BOM (Byte Order Mark) if present
    const cleanContent = fileContent.replace(/^\uFEFF/, '');

    const data = JSON.parse(cleanContent);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error loading meetings from cache:', error);
    this.createBackup('ai-agent-meetings.json');
    return [];
  }
}
```
**Purpose:** Loads meetings from temporary JSON cache (used for intermediate processing)

**Location:** `src/ai-agent/data/storage/manager.ts:32-55`

---

**2. Save Single Meeting (to Cache)**
```typescript
public saveMeeting(meeting: ProcessedMeeting): void {
  try {
    const meetings = this.loadMeetings();

    // Check if meeting already exists (by ID)
    const existingIndex = meetings.findIndex(m => m.id === meeting.id);

    if (existingIndex >= 0) {
      // Update existing meeting in cache
      meetings[existingIndex] = meeting;
      console.log(`📝 Updated meeting in cache: ${meeting.subject}`);
    } else {
      // Add new meeting to cache
      meetings.push(meeting);
      console.log(`📝 Cached new meeting: ${meeting.subject}`);
    }

    // Write to cache file
    const filePath = path.join(this.STORAGE_PATH, 'ai-agent-meetings.json');
    fs.writeFileSync(filePath, JSON.stringify(meetings, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving meeting to cache:', error);
    throw error;
  }
}
```
**Purpose:** Saves meeting to temporary JSON cache (intermediate storage before database)

**Note:** This is a temporary cache. Final posted meetings are stored in SQLite `meetings` table.

**Location:** `src/ai-agent/data/storage/manager.ts:57-85`

---

**3. Get Meeting by ID (from Cache)**
```typescript
public getMeeting(meetingId: string): ProcessedMeeting | undefined {
  const meetings = this.loadMeetings();
  return meetings.find(m => m.id === meetingId);
}
```
**Purpose:** Retrieve specific meeting from JSON cache by ID

**Location:** `src/ai-agent/data/storage/manager.ts:87-92`

---

**4. List Meetings by User (from Cache)**
```typescript
public listMeetings(userId: string): ProcessedMeeting[] {
  const meetings = this.loadMeetings();

  // Normalize user ID (handle 'ai-agent-' prefix variations)
  const normalizedUserId = userId.replace(/^ai-agent-/, '');

  return meetings.filter(m => {
    const meetingUserId = m.userId?.replace(/^ai-agent-/, '');
    return meetingUserId === normalizedUserId;
  });
}
```
**Purpose:** Get all cached meetings for a specific user from JSON cache

**Note:** For posted meetings (final storage), query the SQLite `meetings` table instead.

**Location:** `src/ai-agent/data/storage/manager.ts:94-108`

---

#### Review Storage Methods (SQLite-backed)

**5. Store Meeting for Review**
```typescript
public storeMeetingForReview(meeting: ReviewMeeting): void {
  try {
    const stmt = this.db.prepare(`
      INSERT INTO reviews (
        id, user_id, subject, start_time, end_time, duration,
        status, confidence, reason, report_id,
        participants, key_points, suggested_tasks, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, report_id) DO NOTHING
    `);

    stmt.run(
      meeting.id,
      meeting.userId,
      meeting.subject,
      meeting.startTime,
      meeting.endTime,
      meeting.duration,
      meeting.status || 'pending',
      meeting.confidence || 0,
      meeting.reason || null,
      meeting.reportId || null,
      JSON.stringify(meeting.participants || []),
      JSON.stringify(meeting.keyPoints || []),
      JSON.stringify(meeting.suggestedTasks || [])
    );

    console.log(`📝 Stored meeting for review: ${meeting.subject}`);
  } catch (error) {
    console.error('Error storing review:', error);
    throw error;
  }
}
```
**Purpose:** Saves meeting to review queue in SQLite database

**Location:** `src/ai-agent/data/storage/manager.ts:110-145`

---

**6. Get Pending Reviews**
```typescript
public getPendingReviews(userId: string): ReviewMeeting[] {
  try {
    const stmt = this.db.prepare(`
      SELECT * FROM reviews
      WHERE user_id = ? AND status = 'pending'
      ORDER BY start_time DESC
    `);

    const rows = stmt.all(userId);

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      subject: row.subject,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      status: row.status,
      confidence: row.confidence,
      reason: row.reason,
      reportId: row.report_id,
      participants: JSON.parse(row.participants || '[]'),
      keyPoints: JSON.parse(row.key_points || '[]'),
      suggestedTasks: JSON.parse(row.suggested_tasks || '[]')
    }));
  } catch (error) {
    console.error('Error getting pending reviews:', error);
    return [];
  }
}
```
**Purpose:** Retrieves all pending reviews for a user

**Location:** `src/ai-agent/data/storage/manager.ts:147-180`

---

**7. Get All Reviews**
```typescript
public getAllReviews(userId: string): ReviewMeeting[] {
  try {
    const stmt = this.db.prepare(`
      SELECT * FROM reviews
      WHERE user_id = ?
      ORDER BY start_time DESC
    `);

    const rows = stmt.all(userId);

    return rows.map(row => ({
      // ... same mapping as getPendingReviews
    }));
  } catch (error) {
    console.error('Error getting all reviews:', error);
    return [];
  }
}
```
**Purpose:** Retrieves all reviews (any status) for a user

**Location:** `src/ai-agent/data/storage/manager.ts:182-210`

---

**8. Get Meeting for Review**
```typescript
public getMeetingForReview(
  meetingId: string,
  userId?: string
): ReviewMeeting | undefined {
  try {
    let stmt;
    let row;

    if (userId) {
      stmt = this.db.prepare(`
        SELECT * FROM reviews
        WHERE id = ? AND user_id = ?
      `);
      row = stmt.get(meetingId, userId);
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM reviews
        WHERE id = ?
      `);
      row = stmt.get(meetingId);
    }

    if (!row) return undefined;

    return {
      // ... same mapping
    };
  } catch (error) {
    console.error('Error getting meeting for review:', error);
    return undefined;
  }
}
```
**Purpose:** Get specific review meeting by ID

**Location:** `src/ai-agent/data/storage/manager.ts:212-250`

---

**9. Update Review Status**
```typescript
public updateReviewStatus(decision: ReviewDecision): void {
  try {
    const stmt = this.db.prepare(`
      UPDATE reviews
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(decision.status, decision.meetingId);

    console.log(`✅ Updated review status: ${decision.meetingId} → ${decision.status}`);

    // Also store decision in JSON file
    this.storeReviewDecision(decision);
  } catch (error) {
    console.error('Error updating review status:', error);
    throw error;
  }
}
```
**Purpose:** Update review status (approved, rejected, no_entry_needed)

**Location:** `src/ai-agent/data/storage/manager.ts:252-275`

---

#### Decision Storage Methods

**10. Store Review Decision**
```typescript
public storeReviewDecision(decision: ReviewDecision): void {
  try {
    const filePath = path.join(this.STORAGE_PATH, 'review-decisions.json');

    let decisions: ReviewDecision[] = [];

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      decisions = JSON.parse(content);
    }

    decisions.push(decision);

    fs.writeFileSync(filePath, JSON.stringify(decisions, null, 2), 'utf8');

    console.log(`📝 Stored review decision: ${decision.meetingId}`);
  } catch (error) {
    console.error('Error storing review decision:', error);
    throw error;
  }
}
```
**Purpose:** Save user's review decision for future AI learning

**Location:** `src/ai-agent/data/storage/manager.ts:277-300`

---

#### Backup Methods

**11. Create Backup**
```typescript
public createBackup(fileName: string): void {
  try {
    const sourcePath = path.join(this.STORAGE_PATH, fileName);

    if (!fs.existsSync(sourcePath)) {
      console.log(`ℹ️  No file to backup: ${fileName}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupName = `backup-${timestamp}-${fileName}`;
    const backupPath = path.join(this.STORAGE_PATH, backupName);

    fs.copyFileSync(sourcePath, backupPath);

    console.log(`✅ Backup created: ${backupName}`);
  } catch (error) {
    console.error('Error creating backup:', error);
  }
}
```
**Purpose:** Create timestamped backup of JSON file

**Location:** `src/ai-agent/data/storage/manager.ts:302-325`

---

**12. Restore from Backup**
```typescript
public restoreFromBackup(backupFileName: string): void {
  try {
    const backupPath = path.join(this.STORAGE_PATH, backupFileName);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupFileName}`);
    }

    // Extract original filename from backup name
    const originalName = backupFileName.replace(/^backup-.*?-/, '');
    const targetPath = path.join(this.STORAGE_PATH, originalName);

    // Create backup of current file before restore
    if (fs.existsSync(targetPath)) {
      this.createBackup(originalName);
    }

    fs.copyFileSync(backupPath, targetPath);

    console.log(`✅ Restored from backup: ${backupFileName} → ${originalName}`);
  } catch (error) {
    console.error('Error restoring from backup:', error);
    throw error;
  }
}
```
**Purpose:** Restore data from a previous backup

**Location:** `src/ai-agent/data/storage/manager.ts:327-355`

---

### Storage Manager Usage Example

```typescript
import { StorageManager } from '@/ai-agent/data/storage/manager';

// Get singleton instance
const storage = StorageManager.getInstance();

// ===== CACHE OPERATIONS (Temporary JSON Storage) =====

// Save processed meeting to cache (temporary)
const meeting: ProcessedMeeting = {
  id: 'meeting-123',
  subject: 'Sprint Planning',
  userId: 'user@example.com',
  startTime: '2025-01-15T10:00:00Z',
  // ... other fields
};
storage.saveMeeting(meeting);  // Saves to ai-agent-meetings.json cache

// Load all cached meetings for user
const userMeetings = storage.listMeetings('user@example.com');
console.log(`Found ${userMeetings.length} meetings in cache`);

// ===== DATABASE OPERATIONS (Permanent SQLite Storage) =====

// Queue meeting for review (SQLite)
const reviewMeeting: ReviewMeeting = {
  id: 'review-456',
  userId: 'user@example.com',
  subject: 'Client Call',
  status: 'pending',
  confidence: 0.3,
  reason: 'No matching task found',
  // ... other fields
};
storage.storeMeetingForReview(reviewMeeting);  // Saves to SQLite reviews table

// Get pending reviews (from SQLite)
const pendingReviews = storage.getPendingReviews('user@example.com');
console.log(`${pendingReviews.length} meetings need review`);

// Update review status (in SQLite)
storage.updateReviewStatus({
  meetingId: 'review-456',
  taskId: 'task-789',
  status: 'approved',
  decidedBy: 'user@example.com',
  decidedAt: new Date().toISOString()
});

// NOTE: For posted meetings (final time entries), use the SQLite meetings table
// accessed via the database.ts utility, NOT StorageManager
```

---

## 7. Azure OpenAI Integration

### Azure OpenAI Configuration

**File Location:** `src/ai-agent/config/azure-openai.ts`

```typescript
export const AzureOpenAIConfig = {
  endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT!, // e.g., 'gpt-5'

  // Rate limits (Azure OpenAI S0 tier defaults)
  tokensPerMinute: 50000,
  requestsPerMinute: 500,

  // Model settings
  defaultModel: 'gpt-4o',
  defaultTemperature: 1,  // GPT-5 only supports temperature=1
  defaultMaxTokens: 8000,

  // Retry configuration
  maxRetries: 3,
  retryDelay: 1000,  // ms
  requestTimeout: 30000,  // 30 seconds

  // Batch settings
  maxBatchSize: 10,
  batchDelayMs: 100
};
```

**Environment Variables Required:**
```bash
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_DEPLOYMENT=<deployment-name>  # e.g., gpt-4, gpt-5
```

**Location:** `src/ai-agent/config/azure-openai.ts:1-25`

---

### AzureOpenAIClient Class

**File Location:** `src/ai-agent/core/azure-openai/client.ts`

**Architecture:** Singleton pattern with integrated rate limiting

#### Class Structure

```typescript
class AzureOpenAIClient {
  private static instance: AzureOpenAIClient;
  private rateLimiter: RateLimiter;
  private config: typeof AzureOpenAIConfig;

  private constructor() {
    this.config = AzureOpenAIConfig;
    this.rateLimiter = new RateLimiter(this.config.requestsPerMinute);
  }

  public static getInstance(): AzureOpenAIClient {
    if (!AzureOpenAIClient.instance) {
      AzureOpenAIClient.instance = new AzureOpenAIClient();
    }
    return AzureOpenAIClient.instance;
  }
}
```

**Location:** `src/ai-agent/core/azure-openai/client.ts:1-20`

---

#### Method 1: Send Request

```typescript
public async sendRequest(
  prompt: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  // Wait for rate limiter capacity
  await this.rateLimiter.waitForCapacity();

  const url = `${this.config.endpoint}/openai/deployments/${this.config.deployment}/chat/completions?api-version=2024-12-01-preview`;

  const requestBody: any = {
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    max_completion_tokens: options?.maxTokens || this.config.defaultMaxTokens
  };

  // Only include temperature if explicitly set to 1 (GPT-5 requirement)
  if (options?.temperature === 1) {
    requestBody.temperature = 1;
  }

  try {
    const response = await this.retryWithExponentialBackoff(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.requestTimeout)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Azure OpenAI API error (${res.status}): ${errorText}`);
      }

      return res.json();
    });

    console.log('[Azure OpenAI] Full API Response:', JSON.stringify(response, null, 2));

    // Validate response structure
    if (!response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Invalid response structure from Azure OpenAI');
    }

    return response.choices[0].message.content;
  } catch (error) {
    console.error('[Azure OpenAI] Request failed:', error);
    throw error;
  }
}
```

**Purpose:** Core method for sending requests to Azure OpenAI API with retry logic

**Flow:**
1. Wait for rate limiter token
2. Build request URL with deployment and API version
3. Construct request body with messages and tokens
4. Retry with exponential backoff (up to 3 times)
5. Validate response structure
6. Return message content

**Location:** `src/ai-agent/core/azure-openai/client.ts:22-85`

---

#### Method 2: Retry with Exponential Backoff

```typescript
private async retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  retryCount = 0
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Check if error is rate limit (429)
    if (error.message?.includes('429')) {
      const backoffMultiplier = 2;  // 2x longer for rate limits
      const delay = this.config.retryDelay * Math.pow(2, retryCount) * backoffMultiplier;

      console.warn(`[Azure OpenAI] Rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})`);

      if (retryCount >= this.config.maxRetries) {
        throw new Error(`Max retries (${this.config.maxRetries}) exceeded due to rate limiting`);
      }

      await this.sleep(delay);
      return this.retryWithExponentialBackoff(operation, retryCount + 1);
    }

    // Other errors: standard exponential backoff
    if (retryCount >= this.config.maxRetries) {
      throw error;
    }

    const delay = this.config.retryDelay * Math.pow(2, retryCount);
    console.warn(`[Azure OpenAI] Request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})`);

    await this.sleep(delay);
    return this.retryWithExponentialBackoff(operation, retryCount + 1);
  }
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Purpose:** Implements retry logic with special handling for rate limit errors

**Backoff Strategy:**
- **Normal errors:** 1s, 2s, 4s (2^n)
- **Rate limit (429):** 2s, 4s, 8s (2^n * 2)
- **Max retries:** 3
- **Total max wait:** ~14 seconds

**Location:** `src/ai-agent/core/azure-openai/client.ts:87-130`

---

#### Method 3: Analyze Meeting

```typescript
public async analyzeMeeting(
  meetingData: {
    subject: string;
    description?: string;
    attendees?: string[];
    duration?: number;
  }
): Promise<MeetingAnalysis> {
  const prompt = generateMeetingAnalysisPrompt(meetingData);

  console.log(`[Azure OpenAI] Analyzing meeting: "${meetingData.subject}"`);

  const response = await this.sendRequest(prompt, {
    maxTokens: 5000,
    temperature: 1
  });

  try {
    const analysis = JSON.parse(response);
    return analysis;
  } catch (error) {
    console.error('[Azure OpenAI] Failed to parse meeting analysis:', error);
    throw new Error('Invalid JSON response from meeting analysis');
  }
}
```

**Purpose:** Analyze meeting content using AI

**Returns:**
```typescript
interface MeetingAnalysis {
  summary: string;
  keyTopics: string[];
  actionItems: string[];
  meetingType: string;  // e.g., "planning", "review", "client call"
  department: string;   // e.g., "engineering", "HR", "sales"
}
```

**Location:** `src/ai-agent/core/azure-openai/client.ts:132-160`

---

#### Method 4: Select Attendance Report

```typescript
public async selectAttendanceReport(
  meetingInfo: {
    subject: string;
    scheduledDate: string;
  },
  reports: AttendanceReport[]
): Promise<ReportSelection> {
  const prompt = generateReportSelectionPrompt(meetingInfo, reports);

  console.log(`[Azure OpenAI] Selecting best attendance report for: "${meetingInfo.subject}"`);

  const response = await this.sendRequest(prompt, {
    maxTokens: 1000,
    temperature: 1
  });

  try {
    const selection = JSON.parse(response);
    return selection;
  } catch (error) {
    console.error('[Azure OpenAI] Failed to parse report selection:', error);
    throw new Error('Invalid JSON response from report selection');
  }
}
```

**Purpose:** Use AI to select the best attendance report for a meeting (handles recurring meetings)

**Returns:**
```typescript
interface ReportSelection {
  selectedReportId: string;
  confidence: number;
  reasoning: string;
  metadata: {
    dateMatch: boolean;
    durationValid: boolean;
    hasAttendees: boolean;
  };
}
```

**Location:** `src/ai-agent/core/azure-openai/client.ts:162-195`

---

#### Method 5: Update Rate Limit

```typescript
public updateRateLimit(requestsPerMinute: number): void {
  this.rateLimiter = new RateLimiter(requestsPerMinute);
  console.log(`[Azure OpenAI] Updated rate limit to ${requestsPerMinute} req/min`);
}
```

**Purpose:** Dynamically adjust rate limiting

**Example:**
```typescript
// Increase to 100 requests/minute if quota upgraded
azureOpenAIClient.updateRateLimit(100);
```

**Location:** `src/ai-agent/core/azure-openai/client.ts:197-202`

---

### Azure OpenAI Usage Example

```typescript
import { AzureOpenAIClient } from '@/ai-agent/core/azure-openai/client';

// Get singleton instance
const openAIClient = AzureOpenAIClient.getInstance();

// Analyze meeting
const analysis = await openAIClient.analyzeMeeting({
  subject: 'Sprint Planning',
  description: 'Planning sprint 15 tasks and priorities',
  attendees: ['john@example.com', 'jane@example.com'],
  duration: 3600
});

console.log('Meeting Analysis:', analysis);
// Output:
// {
//   summary: 'Sprint planning session for sprint 15',
//   keyTopics: ['Task prioritization', 'Resource allocation'],
//   actionItems: ['Assign tasks', 'Set sprint goals'],
//   meetingType: 'planning',
//   department: 'engineering'
// }

// Select best attendance report
const selection = await openAIClient.selectAttendanceReport(
  { subject: 'Daily Standup', scheduledDate: '2025-01-15' },
  attendanceReports
);

console.log('Selected Report:', selection);
// Output:
// {
//   selectedReportId: 'report-123',
//   confidence: 0.95,
//   reasoning: 'Date matches and has full attendance',
//   metadata: { dateMatch: true, durationValid: true, hasAttendees: true }
// }
```

---

## 8. Microsoft Graph API with Application Permissions

### Authentication Flow (Application Permissions)

**Key Difference from Manual Workflow:**
- **Manual:** Uses delegated permissions (user must be logged in)
- **AI Agent:** Uses application permissions (no user login required)

#### Token Acquisition

**File Location:** `src/ai-agent/services/meeting/graph-meetings.ts`

```typescript
async function getGraphToken(): Promise<string> {
  const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_AD_APP_TENANT_ID}/oauth2/v2.0/token`;

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: process.env.AZURE_AD_APP_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_APP_CLIENT_SECRET!,
      grant_type: 'client_credentials',  // ⭐ Application flow (NOT delegated)
      scope: 'https://graph.microsoft.com/.default'
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to get Graph API token: ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}
```

**Environment Variables Used:**
```bash
AZURE_AD_APP_CLIENT_ID=<app-client-id>
AZURE_AD_APP_CLIENT_SECRET=<app-client-secret>
AZURE_AD_APP_TENANT_ID=<tenant-id>
```

**Grant Type:** `client_credentials` (application flow, no user interaction)

**Location:** `src/ai-agent/services/meeting/graph-meetings.ts:15-45`

---

### Graph API Endpoints Used

#### 1. Get User Information

```typescript
async function getUserInfo(userId: string, accessToken: string): Promise<UserInfo> {
  const url = `https://graph.microsoft.com/v1.0/users/${userId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get user info: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    id: data.id,
    displayName: data.displayName,
    mail: data.mail,
    userPrincipalName: data.userPrincipalName
  };
}
```

**Purpose:** Get user's display name and UPN for meeting context

**Location:** `src/ai-agent/services/meeting/graph-meetings.ts:47-75`

---

#### 2. Retrieve Meetings (Calendar Events)

```typescript
async function getMeetings(
  userId: string,
  startDate: string,  // ISO 8601 UTC
  endDate: string,    // ISO 8601 UTC
  accessToken: string
): Promise<Meeting[]> {
  const url = `https://graph.microsoft.com/v1.0/users/${userId}/events`;

  const params = new URLSearchParams({
    '$filter': `start/dateTime ge '${startDate}' and end/dateTime le '${endDate}'`,
    '$select': 'subject,start,end,onlineMeeting,bodyPreview,organizer,attendees',
    '$orderby': 'start/dateTime asc',
    '$top': '999'
  });

  const response = await fetch(`${url}?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get meetings: ${response.statusText}`);
  }

  const data = await response.json();

  return data.value.map((event: any) => ({
    id: event.id,
    subject: event.subject,
    startTime: event.start.dateTime,
    endTime: event.end.dateTime,
    isTeamsMeeting: !!event.onlineMeeting,
    joinUrl: event.onlineMeeting?.joinUrl,
    bodyPreview: event.bodyPreview,
    organizer: event.organizer?.emailAddress,
    attendees: event.attendees?.map((a: any) => a.emailAddress.address)
  }));
}
```

**Purpose:** Fetch all calendar events for a user in date range

**Filters:**
- Date range (UTC)
- Selects only needed fields (performance optimization)
- Orders by start time
- Max 999 events

**Location:** `src/ai-agent/services/meeting/graph-meetings.ts:77-125`

---

#### 3. Get Meeting Attendance Reports

**Note:** Attendance reports require additional API calls based on meeting type

```typescript
async function getAttendanceReports(
  meeting: Meeting,
  accessToken: string
): Promise<AttendanceReport[]> {
  if (!meeting.isTeamsMeeting || !meeting.joinUrl) {
    return [];
  }

  // Extract meeting ID and organizer ID from join URL
  const meetingId = extractMeetingIdFromUrl(meeting.joinUrl);
  const organizerId = meeting.organizer?.address;

  if (!meetingId || !organizerId) {
    return [];
  }

  const url = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.warn(`Failed to get attendance reports for ${meeting.subject}: ${response.statusText}`);
    return [];
  }

  const data = await response.json();
  return data.value;
}
```

**Purpose:** Get attendance reports for a Teams meeting

**Returns:**
```typescript
interface AttendanceReport {
  id: string;
  meetingStartDateTime: string;
  meetingEndDateTime: string;
  totalParticipantCount: number;
}
```

**Location:** `src/ai-agent/services/meeting/graph-meetings.ts:127-170`

---

#### 4. Get Attendance Records

```typescript
async function getAttendanceRecords(
  organizerId: string,
  meetingId: string,
  reportId: string,
  accessToken: string
): Promise<AttendanceRecord[]> {
  const url = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports/${reportId}/attendanceRecords`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get attendance records: ${response.statusText}`);
  }

  const data = await response.json();

  return data.value.map((record: any) => ({
    emailAddress: record.emailAddress,
    totalAttendanceInSeconds: record.totalAttendanceInSeconds,
    role: record.role,
    identity: {
      displayName: record.identity?.displayName
    },
    attendanceIntervals: record.attendanceIntervals?.map((interval: any) => ({
      joinDateTime: interval.joinDateTime,
      leaveDateTime: interval.leaveDateTime,
      durationInSeconds: interval.durationInSeconds
    })) || []
  }));
}
```

**Purpose:** Get detailed attendance records for a specific report

**Returns:**
```typescript
interface AttendanceRecord {
  emailAddress: string;
  totalAttendanceInSeconds: number;
  role: string;  // "Presenter", "Attendee", etc.
  identity: {
    displayName: string;
  };
  attendanceIntervals: Array<{
    joinDateTime: string;
    leaveDateTime: string;
    durationInSeconds: number;
  }>;
}
```

**Location:** `src/ai-agent/services/meeting/graph-meetings.ts:172-215`

---

### Complete Meeting Retrieval Flow

```typescript
export async function fetchMeetingsForUser(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ProcessedMeeting[]> {
  console.log(`📅 Fetching meetings for user: ${userId}`);
  console.log(`📆 Date range: ${startDate} to ${endDate}`);

  // Step 1: Get application access token
  const accessToken = await getGraphToken();
  console.log('✅ Graph API token acquired');

  // Step 2: Get user info
  const userInfo = await getUserInfo(userId, accessToken);
  console.log(`✅ User info retrieved: ${userInfo.displayName}`);

  // Step 3: Get calendar events
  const meetings = await getMeetings(userId, startDate, endDate, accessToken);
  console.log(`✅ Retrieved ${meetings.length} meetings`);

  // Step 4: Get attendance reports for each Teams meeting
  const processedMeetings: ProcessedMeeting[] = [];

  for (const meeting of meetings) {
    if (!meeting.isTeamsMeeting) {
      console.log(`⏭️  Skipping non-Teams meeting: ${meeting.subject}`);
      continue;
    }

    try {
      const reports = await getAttendanceReports(meeting, accessToken);

      if (reports.length === 0) {
        console.warn(`⚠️  No attendance reports for: ${meeting.subject}`);
        continue;
      }

      // Get attendance records for each report
      for (const report of reports) {
        const records = await getAttendanceRecords(
          meeting.organizer.address,
          extractMeetingIdFromUrl(meeting.joinUrl),
          report.id,
          accessToken
        );

        // Find user's attendance record
        const userRecord = records.find(r => r.emailAddress === userInfo.mail);

        if (userRecord && userRecord.totalAttendanceInSeconds > 0) {
          processedMeetings.push({
            id: `${meeting.id}_${report.id}`,
            subject: meeting.subject,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            duration: userRecord.totalAttendanceInSeconds,
            userId: userId,
            reportId: report.id,
            attendanceIntervals: userRecord.attendanceIntervals,
            isTeamsMeeting: true,
            meetingId: meeting.id
          });
        }
      }
    } catch (error) {
      console.error(`❌ Error processing meeting "${meeting.subject}":`, error.message);
    }
  }

  console.log(`✅ Processed ${processedMeetings.length} attended meetings`);

  return processedMeetings;
}
```

**Flow Summary:**
1. Acquire application access token (client_credentials flow)
2. Get user info (display name, email)
3. Fetch calendar events in date range
4. Filter to Teams meetings only
5. For each Teams meeting:
   - Get attendance reports
   - For each report:
     - Get attendance records
     - Find user's record
     - If attended (duration > 0): add to results
6. Return processed meetings with attendance data

**Location:** `src/ai-agent/services/meeting/graph-meetings.ts:217-290`

---

### Required Azure AD App Permissions

**Application Permissions (NOT Delegated):**
```
Calendars.Read
OnlineMeetings.Read.All
User.Read.All
```

**How to Configure:**
1. Azure Portal → Azure Active Directory → App registrations
2. Select your AI Agent app registration
3. API permissions → Add permission
4. Microsoft Graph → Application permissions
5. Select: `Calendars.Read`, `OnlineMeetings.Read.All`, `User.Read.All`
6. **Grant admin consent** (required for application permissions)

**Why Application Permissions:**
- AI agent runs as background process (no user session)
- Needs access to all users' calendars
- Operates on scheduled basis (30 minutes)
- No interactive login flow

---

## Summary of Part 1

This document (Part 1) covers the foundational infrastructure of the AI Agent:

✅ **PM2 Process Management** - How the agent runs 24/7
✅ **AI Agent Server** - Core orchestration and scheduling
✅ **Directory Structure** - Complete file organization
✅ **Queue Management** - Sequential processing with rate limiting
✅ **Batch Processing** - Parallel processing in groups of 5
✅ **JSON Storage** - Data persistence layer
✅ **Azure OpenAI Integration** - AI-powered analysis
✅ **Microsoft Graph API** - Meeting retrieval with application permissions

**Part 2 will cover:**
- Time Entry Creation Flow
- Review System
- Attendance Report Management
- Rate Limiting and Throttling
- Error Handling and Retry Logic
- Logging System
- Comparison with Manual Workflow
- User Enablement/Disablement
- Monitoring and Troubleshooting

---

**Document Maintained By:** Development Team
**For Questions or Updates:** Refer to CLAUDE.md or project README.md
**Next:** See TECHNICAL_DOCUMENTATION_AI_AGENT_PART2.md
