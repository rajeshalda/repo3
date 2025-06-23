#!/usr/bin/env node

/**
 * Clear Reviews Script
 * This script clears review data from the SQLite database for testing purposes
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ReviewCleaner {
    constructor() {
        // Database path
        const dataDir = path.join(process.cwd(), 'data');
        const dbPath = path.join(dataDir, 'application.sqlite');
        
        // Check if database exists
        if (!fs.existsSync(dbPath)) {
            console.error('❌ Database not found at:', dbPath);
            process.exit(1);
        }
        
        this.db = new Database(dbPath);
        console.log('✅ Connected to database:', dbPath);
    }
    
    /**
     * Get current review statistics
     */
    getReviewStats() {
        try {
            const totalReviews = this.db.prepare('SELECT COUNT(*) as count FROM reviews').get();
            const pendingReviews = this.db.prepare('SELECT COUNT(*) as count FROM reviews WHERE status = "pending"').get();
            const userBreakdown = this.db.prepare(`
                SELECT user_id, COUNT(*) as count, status 
                FROM reviews 
                GROUP BY user_id, status 
                ORDER BY user_id, status
            `).all();
            
            return {
                total: totalReviews.count,
                pending: pendingReviews.count,
                userBreakdown
            };
        } catch (error) {
            console.error('❌ Error getting review stats:', error.message);
            return null;
        }
    }
    
    /**
     * Display current review statistics
     */
    displayStats() {
        const stats = this.getReviewStats();
        if (!stats) return;
        
        console.log('\n📊 Current Review Statistics:');
        console.log('═'.repeat(50));
        console.log(`Total Reviews: ${stats.total}`);
        console.log(`Pending Reviews: ${stats.pending}`);
        
        if (stats.userBreakdown.length > 0) {
            console.log('\n👥 User Breakdown:');
            console.log('-'.repeat(50));
            stats.userBreakdown.forEach(row => {
                console.log(`${row.user_id} (${row.status}): ${row.count}`);
            });
        }
        console.log('═'.repeat(50));
    }
    
    /**
     * Clear all reviews from the database
     */
    clearAllReviews() {
        try {
            const deleteStmt = this.db.prepare('DELETE FROM reviews');
            const result = deleteStmt.run();
            
            console.log(`✅ Successfully deleted ${result.changes} reviews from the database`);
            return result.changes;
        } catch (error) {
            console.error('❌ Error clearing all reviews:', error.message);
            return 0;
        }
    }
    
    /**
     * Clear reviews for a specific user
     */
    clearUserReviews(userId) {
        try {
            const deleteStmt = this.db.prepare('DELETE FROM reviews WHERE user_id = ?');
            const result = deleteStmt.run(userId);
            
            console.log(`✅ Successfully deleted ${result.changes} reviews for user: ${userId}`);
            return result.changes;
        } catch (error) {
            console.error(`❌ Error clearing reviews for user ${userId}:`, error.message);
            return 0;
        }
    }
    
    /**
     * Clear reviews with specific status
     */
    clearReviewsByStatus(status) {
        try {
            const deleteStmt = this.db.prepare('DELETE FROM reviews WHERE status = ?');
            const result = deleteStmt.run(status);
            
            console.log(`✅ Successfully deleted ${result.changes} reviews with status: ${status}`);
            return result.changes;
        } catch (error) {
            console.error(`❌ Error clearing reviews with status ${status}:`, error.message);
            return 0;
        }
    }
    
    /**
     * Reset auto-increment for reviews table (if needed)
     */
    resetAutoIncrement() {
        try {
            // Note: Reviews table uses TEXT PRIMARY KEY, so no auto-increment to reset
            console.log('ℹ️ Reviews table uses TEXT PRIMARY KEY, no auto-increment to reset');
        } catch (error) {
            console.error('❌ Error resetting auto-increment:', error.message);
        }
    }
    
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            console.log('✅ Database connection closed');
        }
    }
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    const cleaner = new ReviewCleaner();
    
    console.log('🧹 Review Database Cleaner');
    console.log('═'.repeat(50));
    
    // Show current stats before any action
    cleaner.displayStats();
    
    if (args.length === 0) {
        console.log('\n📋 Available Commands:');
        console.log('  node clear-reviews.js --all                    # Clear all reviews');
        console.log('  node clear-reviews.js --user <email>           # Clear reviews for specific user');
        console.log('  node clear-reviews.js --status <status>        # Clear reviews with specific status');
        console.log('  node clear-reviews.js --stats                  # Show current statistics only');
        console.log('\nExamples:');
        console.log('  node clear-reviews.js --all');
        console.log('  node clear-reviews.js --user pradeepg@m365x92504196.onmicrosoft.com');
        console.log('  node clear-reviews.js --status pending');
        
        cleaner.close();
        return;
    }
    
    // Parse command line arguments
    const command = args[0];
    
    switch (command) {
        case '--all':
            console.log('\n🚨 WARNING: This will delete ALL reviews from the database!');
            console.log('Press Ctrl+C within 3 seconds to cancel...\n');
            
            setTimeout(() => {
                const deleted = cleaner.clearAllReviews();
                if (deleted > 0) {
                    console.log('\n📊 Updated Statistics:');
                    cleaner.displayStats();
                }
                cleaner.close();
            }, 3000);
            break;
            
        case '--user':
            if (args.length < 2) {
                console.error('❌ Please specify a user ID/email');
                console.log('Usage: node clear-reviews.js --user <email>');
                cleaner.close();
                return;
            }
            
            const userId = args[1];
            console.log(`\n🚨 WARNING: This will delete ALL reviews for user: ${userId}`);
            console.log('Press Ctrl+C within 3 seconds to cancel...\n');
            
            setTimeout(() => {
                const deleted = cleaner.clearUserReviews(userId);
                if (deleted > 0) {
                    console.log('\n📊 Updated Statistics:');
                    cleaner.displayStats();
                }
                cleaner.close();
            }, 3000);
            break;
            
        case '--status':
            if (args.length < 2) {
                console.error('❌ Please specify a status');
                console.log('Usage: node clear-reviews.js --status <status>');
                console.log('Common statuses: pending, approved, rejected');
                cleaner.close();
                return;
            }
            
            const status = args[1];
            console.log(`\n🚨 WARNING: This will delete ALL reviews with status: ${status}`);
            console.log('Press Ctrl+C within 3 seconds to cancel...\n');
            
            setTimeout(() => {
                const deleted = cleaner.clearReviewsByStatus(status);
                if (deleted > 0) {
                    console.log('\n📊 Updated Statistics:');
                    cleaner.displayStats();
                }
                cleaner.close();
            }, 3000);
            break;
            
        case '--stats':
            // Stats already displayed above
            console.log('\n✅ Current statistics displayed above');
            cleaner.close();
            break;
            
        default:
            console.error(`❌ Unknown command: ${command}`);
            console.log('Use: node clear-reviews.js (without arguments) to see available commands');
            cleaner.close();
            break;
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⚠️ Operation cancelled by user');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n⚠️ Operation terminated');
    process.exit(0);
});

// Run the script
if (require.main === module) {
    main();
}

module.exports = ReviewCleaner; 