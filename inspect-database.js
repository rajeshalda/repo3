const Database = require('better-sqlite3');
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, 'data', 'application.sqlite');
const db = new Database(dbPath);

console.log('🔍 SQLite Database Inspector');
console.log('📁 Database:', dbPath);
console.log('=' * 60);

try {
    // Get database stats
    console.log('\n📊 DATABASE STATISTICS:');
    console.log('=' * 30);
    
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM user_settings').get();
    const meetingsCount = db.prepare('SELECT COUNT(*) as count FROM meetings').get();
    const reviewsCount = db.prepare('SELECT COUNT(*) as count FROM reviews').get();
    
    console.log(`👥 Users: ${userCount.count}`);
    console.log(`⚙️ User Settings: ${settingsCount.count}`);
    console.log(`📅 Meetings: ${meetingsCount.count}`);
    console.log(`📝 Reviews: ${reviewsCount.count}`);
    
    // Show all tables
    console.log('\n📋 ALL TABLES:');
    console.log('=' * 20);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    tables.forEach(table => console.log(`📄 ${table.name}`));
    
    // Show users data
    console.log('\n👥 USERS DATA:');
    console.log('=' * 20);
    const users = db.prepare('SELECT * FROM users').all();
    if (users.length === 0) {
        console.log('❌ No users found');
    } else {
        users.forEach(user => {
            console.log(`🆔 ID: ${user.id}`);
            console.log(`📧 Email: ${user.email}`);
            console.log(`🔑 Has API Key: ${user.intervals_api_key ? '✅ Yes' : '❌ No'}`);
            console.log(`📅 Created: ${user.created_at}`);
            console.log(`🔄 Last Sync: ${user.last_sync || 'Never'}`);
            console.log('---');
        });
    }
    
    // Show user settings
    console.log('\n⚙️ USER SETTINGS:');
    console.log('=' * 20);
    const settings = db.prepare('SELECT * FROM user_settings').all();
    if (settings.length === 0) {
        console.log('❌ No user settings found');
    } else {
        settings.forEach(setting => {
            console.log(`🆔 User: ${setting.user_id}`);
            console.log(`✅ Enabled: ${setting.enabled ? 'Yes' : 'No'}`);
            console.log(`📅 Created: ${setting.created_at}`);
            console.log('---');
        });
    }
    
    // Show meetings data
    console.log('\n📅 MEETINGS DATA:');
    console.log('=' * 20);
    const meetings = db.prepare('SELECT * FROM meetings ORDER BY created_at DESC LIMIT 10').all();
    if (meetings.length === 0) {
        console.log('❌ No meetings found');
    } else {
        console.log(`📊 Showing latest ${Math.min(meetings.length, 10)} meetings:`);
        meetings.forEach((meeting, index) => {
            console.log(`\n📋 Meeting ${index + 1}:`);
            console.log(`🆔 ID: ${meeting.id}`);
            console.log(`🎯 Meeting ID: ${meeting.meeting_id.substring(0, 20)}...`);
            console.log(`👤 User: ${meeting.user_id}`);
            console.log(`📅 Posted: ${meeting.posted_at || meeting.created_at}`);
            console.log(`🏷️ Task: ${meeting.task_name || 'N/A'}`);
            console.log(`📊 Report ID: ${meeting.report_id || 'N/A'}`);
            
            // Show time entry details if available
            if (meeting.time_entry) {
                try {
                    const timeEntry = JSON.parse(meeting.time_entry);
                    console.log(`⏱️ Duration: ${timeEntry.time || 'N/A'} hours`);
                    console.log(`📋 Description: ${timeEntry.description || 'N/A'}`);
                } catch (e) {
                    console.log(`⏱️ Time Entry: [Invalid JSON]`);
                }
            }
            console.log('---');
        });
    }
    
    // Show reviews data
    console.log('\n📝 REVIEWS DATA:');
    console.log('=' * 20);
    const reviews = db.prepare('SELECT * FROM reviews ORDER BY created_at DESC LIMIT 5').all();
    if (reviews.length === 0) {
        console.log('❌ No reviews found');
    } else {
        console.log(`📊 Showing latest ${Math.min(reviews.length, 5)} reviews:`);
        reviews.forEach((review, index) => {
            console.log(`\n📝 Review ${index + 1}:`);
            console.log(`🆔 ID: ${review.id}`);
            console.log(`👤 User: ${review.user_id}`);
            console.log(`📋 Subject: ${review.subject || 'N/A'}`);
            console.log(`📊 Status: ${review.status || 'pending'}`);
            console.log(`🎯 Confidence: ${review.confidence || 0}`);
            console.log(`📊 Report ID: ${review.report_id || 'N/A'}`);
            console.log(`📅 Created: ${review.created_at}`);
            console.log('---');
        });
    }
    
    // Database file info
    console.log('\n📁 DATABASE FILE INFO:');
    console.log('=' * 25);
    const fs = require('fs');
    const stats = fs.statSync(dbPath);
    console.log(`📏 File Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`📅 Modified: ${stats.mtime}`);
    
    console.log('\n✅ Database inspection completed!');
    
} catch (error) {
    console.error('❌ Error inspecting database:', error.message);
} finally {
    db.close();
} 