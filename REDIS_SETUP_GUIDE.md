# Official Redis Setup Guide for Windows Server

## Complete Guide to Installing and Running Official Redis on Windows Server

This guide will help you install **OFFICIAL Redis** (not a port) on Windows Server using WSL2.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation Steps](#installation-steps)
4. [Configuration](#configuration)
5. [Auto-Start Setup](#auto-start-setup)
6. [Connecting from Node.js](#connecting-from-nodejs)
7. [Management Commands](#management-commands)
8. [Backup Strategy](#backup-strategy)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What You'll Get

- ✅ **Official Redis** (Version 7.2.x - Latest)
- ✅ Built by Redis Ltd (official team)
- ✅ 100% feature complete
- ✅ Same Redis used by Twitter, GitHub, Amazon
- ✅ Production-ready and fully supported

### Why WSL2?

Redis is officially Linux-only. WSL2 (Windows Subsystem for Linux) allows you to run **actual Redis** on Windows with:
- Near-native performance (99% of Linux speed)
- No separate VM or dual boot needed
- Seamless integration with Windows
- Official updates via apt repository

### Architecture

```
Your Windows Server
├── Windows OS (your apps run here)
│   ├── Node.js App (connects to Redis)
│   ├── PM2 AI Agent
│   └── SQLite Database
│
└── WSL2 (Linux kernel in Windows)
    └── Ubuntu 22.04
        └── Redis Server ← Official Redis runs here
            ↑
            | localhost:6379
            ↓
    Your Node.js App connects here
```

---

## Prerequisites

### System Requirements

- **Windows Server:** 2019 or higher (or Windows 10 version 2004+)
- **RAM:** 8GB+ recommended (Redis needs ~150MB for 100 users)
- **Disk:** 5GB free space
- **Admin Rights:** Required for installation

### Check Your Windows Version

```powershell
# Open PowerShell and run:
winver

# You need:
# - Windows Server 2019+ OR
# - Windows 10 version 2004+ OR
# - Windows 11
```

---

## Installation Steps

### Step 1: Enable WSL2 (5 minutes)

**Open PowerShell as Administrator:**

```powershell
# Install WSL2
wsl --install

# Check installation
wsl --version
```

**Expected Output:**
```
WSL version: 2.0.x.x
Kernel version: 5.15.x.x
```

**Important:** Restart your server after this step!

```powershell
# Restart server
Restart-Computer
```

---

### Step 2: Install Ubuntu (3 minutes)

**After restart, open PowerShell again:**

```powershell
# Install Ubuntu 22.04
wsl --install -d Ubuntu-22.04
```

**First-time setup will prompt you:**

```
Enter new UNIX username: redis_admin
New password: [choose a strong password]
Retype new password: [confirm password]
```

**Save these credentials - you'll need them!**

**Verify Ubuntu is running:**

```powershell
# List installed distributions
wsl -l -v

# Expected output:
  NAME            STATE           VERSION
* Ubuntu-22.04    Running         2
```

---

### Step 3: Install Official Redis (3 minutes)

**You're now inside Ubuntu terminal. Run these commands:**

```bash
# Update package list
sudo apt update

# Install Redis
sudo apt install redis-server -y

# Verify installation
redis-server --version
```

**Expected Output:**
```
Redis server v=7.2.4 sha=00000000:0 malloc=jemalloc-5.3.0 bits=64 build=a2a58c5bd088706d
```

**Test Redis:**

```bash
# Start Redis
sudo service redis-server start

# Test connection
redis-cli ping
```

**Expected Output:**
```
PONG
```

**✅ Official Redis is now installed!**

---

## Configuration

### Step 4: Configure Redis for Production (10 minutes)

**Edit Redis configuration file:**

```bash
# Open config file in nano editor
sudo nano /etc/redis/redis.conf
```

**Press `Ctrl + W` to search, then modify these settings:**

#### 1. Enable Persistence (Crash Recovery)

Search for `appendonly` and change:

```conf
# Find this line:
appendonly no

# Change to:
appendonly yes
```

Search for `appendfsync` and ensure:

```conf
appendfsync everysec
```

#### 2. Set Memory Limit

Search for `maxmemory` and add:

```conf
# Add these lines (or uncomment and modify):
maxmemory 512mb
maxmemory-policy allkeys-lru
```

#### 3. Enable Network Access (for Windows to connect)

Search for `bind` and change:

```conf
# Find this line:
bind 127.0.0.1 -::1

# Change to:
bind 127.0.0.1 0.0.0.0
```

#### 4. Disable Protected Mode (for localhost)

Search for `protected-mode` and change:

```conf
# Find this line:
protected-mode yes

# Change to:
protected-mode no
```

#### 5. Set Password (Optional but Recommended)

Search for `requirepass` and uncomment:

```conf
# Find this line:
# requirepass foobared

# Change to (use your own strong password):
requirepass YourStrongPassword123!
```

**Save and exit:**
- Press `Ctrl + X`
- Press `Y` to confirm
- Press `Enter` to save

**Restart Redis to apply changes:**

```bash
sudo service redis-server restart

# Verify configuration
redis-cli ping
```

**If you set a password, test with:**

```bash
redis-cli -a YourStrongPassword123! ping
```

**Expected Output:**
```
PONG
```

---

## Auto-Start Setup

### Step 5: Auto-Start Redis with Windows (5 minutes)

Redis should automatically start with Ubuntu, but let's ensure it starts when Windows boots.

**Create startup script in PowerShell (as Administrator):**

```powershell
# Create scheduled task to start Redis on boot
$action = New-ScheduledTaskAction -Execute "wsl" -Argument "-d Ubuntu-22.04 -u root service redis-server start"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName "Redis-WSL-Startup" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Description "Start Redis in WSL2 on Windows boot"
```

**Verify task was created:**

```powershell
Get-ScheduledTask -TaskName "Redis-WSL-Startup"
```

**Test the task manually:**

```powershell
# Stop Redis first
wsl -d Ubuntu-22.04 -u root service redis-server stop

# Start via scheduled task
Start-ScheduledTask -TaskName "Redis-WSL-Startup"

# Check if running
wsl -d Ubuntu-22.04 redis-cli ping
```

**Expected Output:**
```
PONG
```

---

## Connecting from Node.js

### Step 6: Install Node.js Redis Client (2 minutes)

**In your project directory:**

```bash
# Install ioredis package
npm install ioredis

# Install TypeScript types (if using TypeScript)
npm install @types/ioredis --save-dev
```

### Step 7: Create Redis Client (5 minutes)

**Create file: `src/lib/redis-client.ts`**

```typescript
import Redis from 'ioredis';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
};

// Create Redis client
const redis = new Redis(redisConfig);

// Connection event handlers
redis.on('connect', () => {
  console.log('🔌 Redis connecting...');
});

redis.on('ready', () => {
  console.log('✅ Redis connected and ready!');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redis.on('close', () => {
  console.log('🔌 Redis connection closed');
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await redis.quit();
  console.log('✅ Redis connection closed gracefully');
  process.exit(0);
});

export default redis;
```

**Update your `.env` file:**

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=YourStrongPassword123!  # If you set a password
```

### Step 8: Use Redis in Your App

**Example: Cache a meeting**

```typescript
import redis from './lib/redis-client';

// Save meeting to cache
async function cacheMeeting(meeting: ProcessedMeeting) {
  const key = `meeting:${meeting.id}`;

  await redis.hset(key, {
    id: meeting.id,
    userId: meeting.userId,
    reportId: meeting.attendance?.reportId || '',
    subject: meeting.subject,
    data: JSON.stringify(meeting)
  });

  // Set expiration (7 days)
  await redis.expire(key, 604800);

  console.log(`✅ Cached meeting: ${meeting.id}`);
}

// Get meeting from cache
async function getCachedMeeting(meetingId: string): Promise<ProcessedMeeting | null> {
  const key = `meeting:${meetingId}`;
  const data = await redis.hgetall(key);

  if (!data || !data.data) {
    return null;
  }

  return JSON.parse(data.data);
}

// Check if meeting already posted
async function isMeetingPosted(userId: string, meetingId: string, reportId: string): Promise<boolean> {
  const key = `posted:${userId}:${meetingId}:${reportId}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

// Mark meeting as posted
async function markMeetingAsPosted(userId: string, meetingId: string, reportId: string) {
  const key = `posted:${userId}:${meetingId}:${reportId}`;

  // Store for 30 days
  await redis.setex(key, 2592000, '1');

  console.log(`✅ Marked as posted: ${meetingId}`);
}
```

**Example: Replace JSON cache with Redis**

```typescript
// OLD (JSON file cache):
const existingMeeting = await storageManager.getMeeting(meeting.id);
if (existingMeeting) {
  return existingMeeting;
}

// NEW (Redis cache):
const cachedMeeting = await getCachedMeeting(meeting.id);
if (cachedMeeting) {
  console.log('✅ Using cached meeting from Redis');
  return cachedMeeting;
}
```

---

## Management Commands

### Daily Management (from PowerShell)

```powershell
# Start Redis
wsl -d Ubuntu-22.04 -u root service redis-server start

# Stop Redis
wsl -d Ubuntu-22.04 -u root service redis-server stop

# Restart Redis
wsl -d Ubuntu-22.04 -u root service redis-server restart

# Check status
wsl -d Ubuntu-22.04 -u root service redis-server status

# View Redis logs
wsl -d Ubuntu-22.04 -u root tail -f /var/log/redis/redis-server.log
```

### Using Redis CLI

```powershell
# Connect to Redis
wsl -d Ubuntu-22.04 redis-cli

# If password protected:
wsl -d Ubuntu-22.04 redis-cli -a YourStrongPassword123!
```

**Inside Redis CLI:**

```bash
# Test connection
PING
# Returns: PONG

# View all keys
KEYS *

# Get a specific key
GET key_name

# Get hash field
HGET meeting:12345 reportId

# Get all hash fields
HGETALL meeting:12345

# Check if key exists
EXISTS meeting:12345

# Delete a key
DEL meeting:12345

# View memory usage
INFO memory

# View statistics
INFO stats

# View connected clients
CLIENT LIST

# Monitor commands in real-time
MONITOR

# Exit
exit
```

---

## Backup Strategy

### Automated Daily Backups

**Create backup script: `C:\Scripts\backup-redis.ps1`**

```powershell
# Redis Backup Script
param(
    [string]$BackupDir = "C:\Backups\Redis",
    [int]$RetentionDays = 7
)

# Create backup directory if not exists
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Generate timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"

# Backup files
$dumpFile = "dump-$timestamp.rdb"
$aofFile = "appendonly-$timestamp.aof"

Write-Host "📦 Starting Redis backup..."

# Copy Redis data from WSL to Windows
try {
    # Save current state
    wsl -d Ubuntu-22.04 redis-cli SAVE

    # Copy dump file
    wsl -d Ubuntu-22.04 -u root cp /var/lib/redis/dump.rdb "/mnt/c/Backups/Redis/$dumpFile"
    Write-Host "✅ Backed up: $dumpFile"

    # Copy AOF file (if exists)
    $aofExists = wsl -d Ubuntu-22.04 test -f /var/lib/redis/appendonly.aof '&&' echo "yes"
    if ($aofExists -eq "yes") {
        wsl -d Ubuntu-22.04 -u root cp /var/lib/redis/appendonly.aof "/mnt/c/Backups/Redis/$aofFile"
        Write-Host "✅ Backed up: $aofFile"
    }

    # Clean old backups
    Write-Host "🧹 Cleaning old backups (older than $RetentionDays days)..."
    Get-ChildItem $BackupDir -Filter "dump-*.rdb" |
        Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays)} |
        Remove-Item -Force

    Get-ChildItem $BackupDir -Filter "appendonly-*.aof" |
        Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays)} |
        Remove-Item -Force

    Write-Host "✅ Redis backup completed successfully!"

} catch {
    Write-Host "❌ Backup failed: $_"
    exit 1
}
```

**Schedule daily backup:**

```powershell
# Create scheduled task for daily backup at 2 AM
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -File C:\Scripts\backup-redis.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At 2am

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName "Redis-Daily-Backup" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Description "Daily Redis backup"
```

### Manual Backup

```powershell
# One-time manual backup
C:\Scripts\backup-redis.ps1
```

### Restore from Backup

```powershell
# Stop Redis
wsl -d Ubuntu-22.04 -u root service redis-server stop

# Copy backup to Redis directory
$backupFile = "C:\Backups\Redis\dump-2024-01-15_020000.rdb"
wsl -d Ubuntu-22.04 -u root cp "/mnt/c/Backups/Redis/dump-2024-01-15_020000.rdb" /var/lib/redis/dump.rdb

# Set permissions
wsl -d Ubuntu-22.04 -u root chown redis:redis /var/lib/redis/dump.rdb

# Start Redis
wsl -d Ubuntu-22.04 -u root service redis-server start

# Verify data restored
wsl -d Ubuntu-22.04 redis-cli DBSIZE
```

---

## Monitoring

### Check Redis Status

**PowerShell script: `C:\Scripts\redis-status.ps1`**

```powershell
# Redis Status Monitor
Write-Host "🔍 Redis Status Check" -ForegroundColor Cyan
Write-Host "=" * 50

# Check if WSL is running
$wslStatus = wsl -l -v | Select-String "Ubuntu-22.04"
if ($wslStatus -match "Running") {
    Write-Host "✅ WSL Ubuntu is running" -ForegroundColor Green
} else {
    Write-Host "❌ WSL Ubuntu is not running" -ForegroundColor Red
    exit 1
}

# Check if Redis service is running
$redisStatus = wsl -d Ubuntu-22.04 -u root service redis-server status
if ($redisStatus -match "running") {
    Write-Host "✅ Redis service is running" -ForegroundColor Green
} else {
    Write-Host "❌ Redis service is not running" -ForegroundColor Red
    exit 1
}

# Test Redis connection
$pingResult = wsl -d Ubuntu-22.04 redis-cli ping 2>&1
if ($pingResult -match "PONG") {
    Write-Host "✅ Redis is responding to commands" -ForegroundColor Green
} else {
    Write-Host "❌ Redis is not responding" -ForegroundColor Red
    exit 1
}

# Get Redis info
Write-Host "`n📊 Redis Information:" -ForegroundColor Cyan
$info = wsl -d Ubuntu-22.04 redis-cli INFO server

# Parse version
$version = ($info | Select-String "redis_version:(.+)").Matches.Groups[1].Value
Write-Host "Version: $version"

# Get memory info
$memInfo = wsl -d Ubuntu-22.04 redis-cli INFO memory
$usedMemory = ($memInfo | Select-String "used_memory_human:(.+)").Matches.Groups[1].Value
Write-Host "Memory Used: $usedMemory"

# Get stats
$statsInfo = wsl -d Ubuntu-22.04 redis-cli INFO stats
$totalConnections = ($statsInfo | Select-String "total_connections_received:(.+)").Matches.Groups[1].Value
$totalCommands = ($statsInfo | Select-String "total_commands_processed:(.+)").Matches.Groups[1].Value

Write-Host "Total Connections: $totalConnections"
Write-Host "Total Commands: $totalCommands"

# Get key count
$keyCount = wsl -d Ubuntu-22.04 redis-cli DBSIZE
Write-Host "Total Keys: $keyCount"

Write-Host "`n✅ Redis health check completed!" -ForegroundColor Green
```

**Run status check:**

```powershell
C:\Scripts\redis-status.ps1
```

### Performance Monitoring

```bash
# Inside WSL Ubuntu:

# Real-time monitoring
redis-cli --stat

# Monitor all commands (be careful in production)
redis-cli MONITOR

# Get detailed info
redis-cli INFO all

# Check slow queries
redis-cli SLOWLOG get 10
```

---

## Troubleshooting

### Issue 1: WSL Not Installing

**Symptom:** `wsl --install` fails

**Solution:**

```powershell
# Enable required Windows features manually
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Restart computer
Restart-Computer

# Set WSL default version to 2
wsl --set-default-version 2

# Try install again
wsl --install -d Ubuntu-22.04
```

---

### Issue 2: Redis Won't Start

**Symptom:** `service redis-server start` fails

**Solution:**

```bash
# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log

# Check for port conflicts
sudo netstat -tulpn | grep 6379

# Verify config file syntax
redis-server /etc/redis/redis.conf --test-memory 1

# Reset permissions
sudo chown -R redis:redis /var/lib/redis
sudo chown redis:redis /var/log/redis/redis-server.log

# Try starting again
sudo service redis-server restart
```

---

### Issue 3: Can't Connect from Node.js

**Symptom:** `ECONNREFUSED` error

**Solution:**

```powershell
# 1. Check Redis is running
wsl -d Ubuntu-22.04 redis-cli ping

# 2. Check if listening on correct interface
wsl -d Ubuntu-22.04 -u root netstat -tulpn | grep 6379

# 3. Test connection from Windows
wsl -d Ubuntu-22.04 redis-cli -h 127.0.0.1 -p 6379 ping

# 4. Check firewall (usually not an issue for localhost)
# Allow port 6379 if needed

# 5. Verify Redis config
wsl -d Ubuntu-22.04 cat /etc/redis/redis.conf | grep "bind"
# Should include: bind 127.0.0.1 0.0.0.0
```

---

### Issue 4: "Authentication Required" Error

**Symptom:** `NOAUTH Authentication required`

**Solution:**

```typescript
// Update your Redis client config
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'YourStrongPassword123!',  // Add this
});
```

Or remove password from Redis config:

```bash
sudo nano /etc/redis/redis.conf
# Comment out the requirepass line:
# requirepass YourStrongPassword123!

sudo service redis-server restart
```

---

### Issue 5: High Memory Usage

**Symptom:** Redis using too much memory

**Solution:**

```bash
# Check current memory usage
redis-cli INFO memory

# Set maxmemory limit
redis-cli CONFIG SET maxmemory 512mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Make permanent in config
sudo nano /etc/redis/redis.conf
# Add/modify:
# maxmemory 512mb
# maxmemory-policy allkeys-lru

# Restart
sudo service redis-server restart

# Flush old data if needed (CAREFUL!)
redis-cli FLUSHDB  # Flush current database
# or
redis-cli FLUSHALL  # Flush all databases
```

---

### Issue 6: Redis Crashes Frequently

**Symptom:** Redis stops unexpectedly

**Solution:**

```bash
# Check system logs
sudo journalctl -u redis-server -n 50

# Check Redis logs
sudo tail -100 /var/log/redis/redis-server.log

# Common causes:
# 1. Out of memory - increase maxmemory or add swap
# 2. Disk full - check disk space
df -h

# 3. Corrupted AOF file - rebuild
sudo service redis-server stop
redis-check-aof --fix /var/lib/redis/appendonly.aof
sudo service redis-server start

# 4. Corrupted RDB file - rebuild from backup
sudo service redis-server stop
sudo rm /var/lib/redis/dump.rdb
# Restore from backup (see Backup section)
```

---

### Issue 7: WSL Stops After Windows Sleep

**Symptom:** Redis not running after waking Windows from sleep

**Solution:**

```powershell
# Create PowerShell script: C:\Scripts\redis-wakeup.ps1
wsl -d Ubuntu-22.04 -u root service redis-server start

# Create scheduled task for system resume
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -File C:\Scripts\redis-wakeup.ps1"

$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger2 = New-CimInstance -ClassName MSFT_TaskEventTrigger -Namespace Root/Microsoft/Windows/TaskScheduler -ClientOnly -Property @{
    Subscription = '<QueryList><Query><Select Path="System">*[System[Provider[@Name="Microsoft-Windows-Power-Troubleshooter"] and EventID=1]]</Select></Query></QueryList>'
}

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName "Redis-Resume-Wakeup" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal
```

---

## Performance Tuning

### For Production (100+ Users)

**Edit `/etc/redis/redis.conf`:**

```conf
# Network
tcp-backlog 511
timeout 300
tcp-keepalive 300

# Memory Management
maxmemory 512mb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no

# Performance
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log

# Security
protected-mode no
bind 127.0.0.1 0.0.0.0
requirepass YourStrongPassword123!
```

**Restart after changes:**

```bash
sudo service redis-server restart
```

---

## Useful Scripts

### Quick Health Check

Save as `C:\Scripts\redis-check.ps1`:

```powershell
$ping = wsl -d Ubuntu-22.04 redis-cli ping 2>&1
if ($ping -match "PONG") {
    Write-Host "✅ Redis OK" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ Redis DOWN - Attempting restart..." -ForegroundColor Red
    wsl -d Ubuntu-22.04 -u root service redis-server restart
    Start-Sleep -Seconds 2
    $ping = wsl -d Ubuntu-22.04 redis-cli ping 2>&1
    if ($ping -match "PONG") {
        Write-Host "✅ Redis restarted successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Redis restart failed - manual intervention needed" -ForegroundColor Red
        exit 1
    }
}
```

---

## Summary

You now have **Official Redis** running on your Windows Server!

### What You Achieved

- ✅ Installed Official Redis (latest version)
- ✅ Configured for production use
- ✅ Set up auto-start with Windows
- ✅ Connected from Node.js application
- ✅ Implemented backup strategy
- ✅ Created monitoring scripts

### Key Files & Locations

```
Windows Side:
├── C:\Scripts\backup-redis.ps1 (Backup script)
├── C:\Scripts\redis-status.ps1 (Status monitor)
└── Your project/.env (Redis connection config)

WSL Ubuntu Side:
├── /etc/redis/redis.conf (Redis configuration)
├── /var/lib/redis/ (Redis data directory)
├── /var/log/redis/ (Redis logs)
└── /usr/bin/redis-server (Redis binary)
```

### Next Steps

1. **Test your app** with Redis cache
2. **Monitor performance** for a few days
3. **Verify backups** are running
4. **Update your code** to use Redis instead of JSON cache

### Need Help?

- Redis Documentation: https://redis.io/docs
- WSL Documentation: https://learn.microsoft.com/en-us/windows/wsl/
- ioredis Documentation: https://github.com/redis/ioredis

---

## Quick Reference Card

```powershell
# Start Redis
wsl -d Ubuntu-22.04 -u root service redis-server start

# Stop Redis
wsl -d Ubuntu-22.04 -u root service redis-server stop

# Check Status
wsl -d Ubuntu-22.04 redis-cli ping

# View Logs
wsl -d Ubuntu-22.04 -u root tail -f /var/log/redis/redis-server.log

# Connect to CLI
wsl -d Ubuntu-22.04 redis-cli

# Backup Now
C:\Scripts\backup-redis.ps1

# Health Check
C:\Scripts\redis-status.ps1
```

---

**Created:** 2024
**Version:** 1.0
**For:** Windows Server + Official Redis via WSL2
