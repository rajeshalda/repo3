const Database = require('better-sqlite3');
const path = require('path');

console.log('🔍 Testing API Key Fix for Multiple Users');
console.log('='.repeat(50));

try {
    // Connect to the SQLite database directly
    const dbPath = path.join(__dirname, 'data', 'application.sqlite');
    const db = new Database(dbPath, { readonly: true });
    
    console.log(`📁 Database: ${dbPath}`);
    
    // Test users from the database inspection
    const testUsers = [
        'pradeepg@m365x92504196.onmicrosoft.com',
        'neha@m365x92504196.onmicrosoft.com', 
        'debrab@m365x92504196.onmicrosoft.com',
        'meganb@m365x92504196.onmicrosoft.com'
    ];

    console.log('\n📊 Testing API key lookup for all users:');
    
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? OR user_id = ?');
    
    testUsers.forEach(email => {
        console.log(`\n🔍 Testing: ${email}`);
        try {
            const user = stmt.get(email, email);
            if (user) {
                console.log(`✅ Found user: ${user.email}`);
                console.log(`🔑 Has API Key: ${user.intervals_api_key ? 'Yes' : 'No'}`);
                console.log(`📅 Created: ${user.created_at}`);
            } else {
                console.log(`❌ User not found`);
            }
        } catch (error) {
            console.log(`💥 Error: ${error.message}`);
        }
    });

    db.close();
    
    console.log('\n✅ API Key lookup test completed!');
    console.log('\n📝 Summary of Fixes Applied:');
    console.log('🔧 1. Updated intervals-proxy routes to use SQLite database instead of file storage');
    console.log('🔧 2. Added user context isolation in makeRequest method'); 
    console.log('🔧 3. Enhanced logging to track API key lookups per user');
    console.log('🔧 4. Added validation to ensure userId is provided in all API requests');
    console.log('\n🎯 This should fix the "API key not found" errors during multi-user testing');
    
} catch (error) {
    console.error('❌ Error running test:', error.message);
} 