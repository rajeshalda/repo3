const Database = require('better-sqlite3');
const path = require('path');

// Database connection
const dbPath = path.join(__dirname, 'data', 'application.sqlite');
const db = new Database(dbPath);

console.log('🧹 Old Tenant User Cleanup Script');
console.log('📁 Database:', dbPath);
console.log('');

// Old tenant to remove
const OLD_TENANT = 'm365x92504196.onmicrosoft.com';

// Current tenant to keep
const CURRENT_TENANT = 'm365x32917266.onmicrosoft.com';

console.log(`🗑️  Removing users from old tenant: ${OLD_TENANT}`);
console.log(`✅ Keeping users from current tenant: ${CURRENT_TENANT}`);
console.log('');

// First, show what will be deleted
console.log('📊 BEFORE CLEANUP:');
console.log('');

const beforeStats = db.prepare(`
    SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE email LIKE '%${OLD_TENANT}') as old_tenant_users,
        (SELECT COUNT(*) FROM users WHERE email LIKE '%${CURRENT_TENANT}') as current_tenant_users,
        (SELECT COUNT(*) FROM user_settings) as total_settings,
        (SELECT COUNT(*) FROM meetings) as total_meetings,
        (SELECT COUNT(*) FROM reviews) as total_reviews
`).get();

console.log(`👥 Total Users: ${beforeStats.total_users}`);
console.log(`   - Old Tenant (${OLD_TENANT}): ${beforeStats.old_tenant_users}`);
console.log(`   - Current Tenant (${CURRENT_TENANT}): ${beforeStats.current_tenant_users}`);
console.log(`⚙️  User Settings: ${beforeStats.total_settings}`);
console.log(`📅 Meetings: ${beforeStats.total_meetings}`);
console.log(`📝 Reviews: ${beforeStats.total_reviews}`);
console.log('');

// Show users to be deleted
console.log(`🔍 Users from old tenant (${OLD_TENANT}) to be deleted:`);
const usersToDelete = db.prepare(`
    SELECT id, email, created_at, last_sync
    FROM users
    WHERE email LIKE ?
    ORDER BY created_at
`).all(`%${OLD_TENANT}`);

if (usersToDelete.length === 0) {
    console.log('   No users found from old tenant.');
    console.log('');
    console.log('✅ Nothing to cleanup!');
    db.close();
    process.exit(0);
}

usersToDelete.forEach((user, index) => {
    console.log(`   ${index + 1}. ${user.email} (ID: ${user.id}, Created: ${user.created_at})`);
});
console.log('');

// Show related data that will be cascade deleted
console.log('📊 Related data that will be automatically deleted (CASCADE):');

const relatedData = db.prepare(`
    SELECT
        (SELECT COUNT(*) FROM user_settings WHERE user_id IN (SELECT email FROM users WHERE email LIKE ?)) as settings_count,
        (SELECT COUNT(*) FROM meetings WHERE user_id IN (SELECT email FROM users WHERE email LIKE ?)) as meetings_count,
        (SELECT COUNT(*) FROM reviews WHERE user_id IN (SELECT email FROM users WHERE email LIKE ?)) as reviews_count
`).get(`%${OLD_TENANT}`, `%${OLD_TENANT}`, `%${OLD_TENANT}`);

console.log(`   - User Settings: ${relatedData.settings_count}`);
console.log(`   - Meetings: ${relatedData.meetings_count}`);
console.log(`   - Reviews: ${relatedData.reviews_count}`);
console.log('');

// Confirm deletion
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('⚠️  Do you want to proceed with deletion? (yes/no): ', (answer) => {
    if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Deletion cancelled.');
        rl.close();
        db.close();
        process.exit(0);
    }

    console.log('');
    console.log('🗑️  Starting deletion...');
    console.log('');

    // Start transaction
    const deleteTransaction = db.transaction(() => {
        // Delete users (this will cascade delete settings, meetings, and reviews)
        const deleteResult = db.prepare(`
            DELETE FROM users
            WHERE email LIKE ?
        `).run(`%${OLD_TENANT}`);

        return deleteResult.changes;
    });

    try {
        const deletedCount = deleteTransaction();

        console.log(`✅ Successfully deleted ${deletedCount} users from old tenant`);
        console.log('');

        // Show after stats
        console.log('📊 AFTER CLEANUP:');
        console.log('');

        const afterStats = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE email LIKE '%${OLD_TENANT}') as old_tenant_users,
                (SELECT COUNT(*) FROM users WHERE email LIKE '%${CURRENT_TENANT}') as current_tenant_users,
                (SELECT COUNT(*) FROM user_settings) as total_settings,
                (SELECT COUNT(*) FROM meetings) as total_meetings,
                (SELECT COUNT(*) FROM reviews) as total_reviews
        `).get();

        console.log(`👥 Total Users: ${afterStats.total_users}`);
        console.log(`   - Old Tenant (${OLD_TENANT}): ${afterStats.old_tenant_users}`);
        console.log(`   - Current Tenant (${CURRENT_TENANT}): ${afterStats.current_tenant_users}`);
        console.log(`⚙️  User Settings: ${afterStats.total_settings}`);
        console.log(`📅 Meetings: ${afterStats.total_meetings}`);
        console.log(`📝 Reviews: ${afterStats.total_reviews}`);
        console.log('');

        console.log('✅ Cleanup completed successfully!');

    } catch (error) {
        console.error('❌ Error during deletion:', error);
        process.exit(1);
    } finally {
        rl.close();
        db.close();
    }
});
