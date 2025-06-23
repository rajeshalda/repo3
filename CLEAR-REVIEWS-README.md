# Review Database Cleaner Scripts

This set of scripts allows you to clear review data from the SQLite database for testing purposes. The scripts provide multiple execution options and safety features.

## 📁 Files Included

- `clear-reviews.js` - Main Node.js script with full functionality
- `clear-reviews.ps1` - PowerShell wrapper for Windows
- `clear-reviews.bat` - Batch file wrapper for Windows
- `CLEAR-REVIEWS-README.md` - This documentation file

## 🚀 Quick Start

### Option 1: Direct Node.js Execution
```bash
# Show current statistics and available commands
node clear-reviews.js

# Clear all reviews (with 3-second warning)
node clear-reviews.js --all

# Clear reviews for specific user
node clear-reviews.js --user pradeepg@m365x92504196.onmicrosoft.com

# Clear reviews with specific status
node clear-reviews.js --status pending

# Show statistics only
node clear-reviews.js --stats
```

### Option 2: PowerShell (Windows)
```powershell
# Show help
.\clear-reviews.ps1

# Clear all reviews
.\clear-reviews.ps1 -Action all

# Clear reviews for specific user
.\clear-reviews.ps1 -Action user -Target "pradeepg@m365x92504196.onmicrosoft.com"

# Clear reviews with specific status
.\clear-reviews.ps1 -Action status -Target "pending"

# Show statistics only
.\clear-reviews.ps1 -Action stats
```

### Option 3: Batch File (Windows)
```cmd
REM Show help
clear-reviews.bat

REM Clear all reviews
clear-reviews.bat all

REM Clear reviews for specific user
clear-reviews.bat user pradeepg@m365x92504196.onmicrosoft.com

REM Clear reviews with specific status
clear-reviews.bat status pending

REM Show statistics only
clear-reviews.bat stats
```

## ⚡ Features

### 🛡️ Safety Features
- **3-second warning** before destructive operations
- **Graceful cancellation** with Ctrl+C
- **Database existence check** before attempting operations
- **Error handling** with detailed error messages
- **Statistics display** before and after operations

### 📊 Statistics Display
The script shows:
- Total number of reviews
- Number of pending reviews
- Breakdown by user and status

### 🎯 Selective Clearing Options
- **Clear all reviews** - Removes all review records
- **Clear by user** - Removes reviews for a specific user only
- **Clear by status** - Removes reviews with a specific status (pending, approved, rejected, etc.)
- **Statistics only** - View current data without making changes

## 📋 Prerequisites

- **Node.js** installed on your system
- **better-sqlite3** package available (should be in your project dependencies)
- **Database file** exists at `data/application.sqlite`

## 🗃️ Database Schema

The script operates on the `reviews` table with the following structure:

```sql
CREATE TABLE reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT,
    start_time DATETIME,
    end_time DATETIME,
    duration REAL,
    status TEXT DEFAULT 'pending',
    confidence INTEGER DEFAULT 0,
    reason TEXT,
    report_id TEXT,
    participants TEXT,
    key_points TEXT,
    suggested_tasks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 Usage Examples

### Scenario 1: Complete Database Reset for Testing
```bash
# Check current state
node clear-reviews.js --stats

# Clear everything
node clear-reviews.js --all

# Verify the clear
node clear-reviews.js --stats
```

### Scenario 2: Clear Pending Reviews Only
```bash
# Clear only pending reviews
node clear-reviews.js --status pending
```

### Scenario 3: Clear Reviews for Specific User
```bash
# Clear reviews for a specific user
node clear-reviews.js --user "pradeepg@m365x92504196.onmicrosoft.com"
```

## ⚠️ Important Notes

1. **Backup Recommended**: Always backup your database before running destructive operations
2. **Production Use**: Be extremely cautious when using in production environments
3. **No Undo**: Once reviews are deleted, they cannot be recovered unless you have a backup
4. **Relationships**: This script only clears the `reviews` table and doesn't affect related data in other tables

## 🐛 Troubleshooting

### "Database not found" Error
- Ensure you're running the script from the project root directory
- Check that `data/application.sqlite` exists
- Verify the database path in the script if using a custom location

### "better-sqlite3" Module Not Found
```bash
npm install better-sqlite3
```

### Permission Errors
- Ensure the database file is not locked by another process
- Check file permissions on the database file
- Close any database browser tools that might have the file open

## 🔍 Verification

After running the script, you can verify the results by:

1. **Using the stats command**:
   ```bash
   node clear-reviews.js --stats
   ```

2. **Checking the database directly** (if you have SQLite tools):
   ```sql
   SELECT COUNT(*) FROM reviews;
   ```

3. **Using your application** to see if the review queue is empty

## 📞 Support

If you encounter issues:
1. Check the console output for specific error messages
2. Verify all prerequisites are met
3. Ensure the database file exists and is accessible
4. Try running with `--stats` first to test connectivity

---

**⚠️ Warning**: These scripts perform destructive operations on your database. Always test in a development environment first and ensure you have appropriate backups. 