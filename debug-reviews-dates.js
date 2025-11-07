const Database = require('better-sqlite3');
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, 'data', 'application.sqlite');
const db = new Database(dbPath);

console.log('🔍 Debug Reviews Dates');
console.log('='.repeat(60));

try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString();

    console.log(`\n📅 Current Date/Time: ${new Date().toISOString()}`);
    console.log(`📅 3 Days Ago: ${threeDaysAgoStr}`);
    console.log(`📅 3 Days Ago (Local): ${threeDaysAgo.toString()}`);

    // Get all reviews to see their dates
    console.log('\n📝 ALL REVIEWS WITH DATES:');
    console.log('='.repeat(60));

    const allReviews = db.prepare(`
        SELECT id, subject, created_at, updated_at,
               CASE
                   WHEN created_at >= ? OR updated_at >= ? THEN 'MATCH'
                   ELSE 'NO MATCH'
               END as filter_result
        FROM reviews
        ORDER BY created_at DESC
    `).all(threeDaysAgoStr, threeDaysAgoStr);

    console.log(`\nTotal Reviews in Database: ${allReviews.length}\n`);

    allReviews.forEach((review, index) => {
        console.log(`${index + 1}. [${review.filter_result}] ID: ${review.id}`);
        console.log(`   Subject: ${review.subject || 'N/A'}`);
        console.log(`   Created: ${review.created_at}`);
        console.log(`   Updated: ${review.updated_at || 'N/A'}`);
        console.log(`   ---`);
    });

    // Count matches
    const matchCount = allReviews.filter(r => r.filter_result === 'MATCH').length;
    const noMatchCount = allReviews.filter(r => r.filter_result === 'NO MATCH').length;

    console.log(`\n📊 SUMMARY:`);
    console.log(`✅ Reviews matching last 3 days filter: ${matchCount}`);
    console.log(`❌ Reviews NOT matching last 3 days filter: ${noMatchCount}`);
    console.log(`📝 Total: ${allReviews.length}`);

    // Show the actual query being used
    console.log(`\n🔍 Query Filter:`);
    console.log(`   created_at >= '${threeDaysAgoStr}' OR updated_at >= '${threeDaysAgoStr}'`);

} catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
} finally {
    db.close();
}
