const Database = require('better-sqlite3');
const path = require('path');

// Connect to the database
const dbPath = path.join(__dirname, 'data', 'application.sqlite');
const db = new Database(dbPath);

console.log('🔍 Review Meetings Inspector');
console.log('📁 Database:', dbPath);
console.log('='.repeat(60));

try {
    // Get review statistics
    console.log('\n📊 REVIEW STATISTICS:');
    console.log('='.repeat(30));

    const totalReviews = db.prepare('SELECT COUNT(*) as count FROM reviews').get();
    const pendingReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'pending'").get();
    const approvedReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'approved'").get();
    const rejectedReviews = db.prepare("SELECT COUNT(*) as count FROM reviews WHERE status = 'rejected'").get();

    console.log(`📝 Total Reviews: ${totalReviews.count}`);
    console.log(`⏳ Pending: ${pendingReviews.count}`);
    console.log(`✅ Approved: ${approvedReviews.count}`);
    console.log(`❌ Rejected: ${rejectedReviews.count}`);

    // Show all reviews data
    console.log('\n📝 ALL REVIEWS DATA:');
    console.log('='.repeat(30));

    const reviews = db.prepare(`
        SELECT * FROM reviews
        ORDER BY created_at DESC
    `).all();

    if (reviews.length === 0) {
        console.log('❌ No reviews found');
    } else {
        console.log(`📊 Found ${reviews.length} total reviews:\n`);

        reviews.forEach((review, index) => {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`📝 Review #${index + 1}`);
            console.log(`${'='.repeat(50)}`);
            console.log(`🆔 ID: ${review.id}`);
            console.log(`👤 User ID: ${review.user_id}`);
            console.log(`📋 Subject: ${review.subject || 'N/A'}`);
            console.log(`📊 Status: ${review.status || 'pending'}`);
            console.log(`🎯 Confidence: ${review.confidence || 0}`);
            console.log(`📊 Report ID: ${review.report_id || 'N/A'}`);
            console.log(`📅 Created At: ${review.created_at}`);
            console.log(`🔄 Updated At: ${review.updated_at || 'N/A'}`);

            // Parse and show meeting data if available
            if (review.meeting_data) {
                try {
                    const meetingData = JSON.parse(review.meeting_data);
                    console.log(`\n📅 Meeting Details:`);
                    console.log(`   🎯 Meeting ID: ${meetingData.id || 'N/A'}`);
                    console.log(`   📋 Subject: ${meetingData.subject || 'N/A'}`);
                    console.log(`   ⏰ Start: ${meetingData.start || 'N/A'}`);
                    console.log(`   ⏱️ End: ${meetingData.end || 'N/A'}`);
                    console.log(`   👥 Organizer: ${meetingData.organizer?.emailAddress?.name || 'N/A'}`);

                    if (meetingData.attendees && meetingData.attendees.length > 0) {
                        console.log(`   👥 Attendees (${meetingData.attendees.length}):`);
                        meetingData.attendees.forEach(att => {
                            console.log(`      - ${att.emailAddress?.name || att.emailAddress?.address || 'N/A'}`);
                        });
                    }
                } catch (e) {
                    console.log(`\n📅 Meeting Data: [Invalid JSON - ${e.message}]`);
                }
            } else {
                console.log(`\n📅 Meeting Data: Not available`);
            }

            // Parse and show suggested task if available
            if (review.suggested_task) {
                try {
                    const suggestedTask = JSON.parse(review.suggested_task);
                    console.log(`\n💡 Suggested Task:`);
                    console.log(`   🆔 Task ID: ${suggestedTask.id || 'N/A'}`);
                    console.log(`   📋 Task Name: ${suggestedTask.task || 'N/A'}`);
                    console.log(`   🏢 Client: ${suggestedTask.client || 'N/A'}`);
                    console.log(`   📊 Project: ${suggestedTask.project || 'N/A'}`);
                } catch (e) {
                    console.log(`\n💡 Suggested Task: [Invalid JSON - ${e.message}]`);
                }
            } else {
                console.log(`\n💡 Suggested Task: Not available`);
            }

            // Parse and show AI analysis if available
            if (review.ai_analysis) {
                try {
                    const aiAnalysis = JSON.parse(review.ai_analysis);
                    console.log(`\n🤖 AI Analysis:`);
                    console.log(`   📝 Summary: ${aiAnalysis.summary || 'N/A'}`);
                    console.log(`   🎯 Reasoning: ${aiAnalysis.reasoning || 'N/A'}`);
                } catch (e) {
                    console.log(`\n🤖 AI Analysis: [Invalid JSON - ${e.message}]`);
                }
            } else {
                console.log(`\n🤖 AI Analysis: Not available`);
            }
        });
    }

    // Show reviews grouped by status
    console.log('\n\n📊 REVIEWS BY STATUS:');
    console.log('='.repeat(30));

    const statuses = ['pending', 'approved', 'rejected'];
    statuses.forEach(status => {
        const statusReviews = db.prepare(`
            SELECT id, subject, created_at, user_id
            FROM reviews
            WHERE status = ?
            ORDER BY created_at DESC
        `).all(status);

        console.log(`\n${status.toUpperCase()} (${statusReviews.length}):`);
        if (statusReviews.length > 0) {
            statusReviews.forEach((review, idx) => {
                console.log(`  ${idx + 1}. [ID: ${review.id}] ${review.subject || 'No subject'} (${review.created_at})`);
            });
        } else {
            console.log(`  No ${status} reviews`);
        }
    });

    // Show reviews grouped by user
    console.log('\n\n👥 REVIEWS BY USER:');
    console.log('='.repeat(30));

    const userReviews = db.prepare(`
        SELECT user_id, COUNT(*) as count
        FROM reviews
        GROUP BY user_id
        ORDER BY count DESC
    `).all();

    if (userReviews.length > 0) {
        userReviews.forEach(ur => {
            console.log(`\n👤 User ID: ${ur.user_id} - ${ur.count} reviews`);

            const userReviewDetails = db.prepare(`
                SELECT id, subject, status, created_at
                FROM reviews
                WHERE user_id = ?
                ORDER BY created_at DESC
            `).all(ur.user_id);

            userReviewDetails.forEach((review, idx) => {
                console.log(`  ${idx + 1}. [${review.status}] ${review.subject || 'No subject'} (${review.created_at})`);
            });
        });
    } else {
        console.log('No reviews found');
    }

    // Database file info
    console.log('\n\n📁 DATABASE FILE INFO:');
    console.log('='.repeat(30));
    const fs = require('fs');
    const stats = fs.statSync(dbPath);
    console.log(`📏 File Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`📅 Modified: ${stats.mtime}`);

    console.log('\n✅ Review inspection completed!');

} catch (error) {
    console.error('❌ Error inspecting reviews:', error);
    console.error('Stack trace:', error.stack);
} finally {
    db.close();
}
