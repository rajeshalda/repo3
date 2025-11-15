import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Types
interface UserData {
    id?: number;
    user_id: string;
    email: string;
    intervals_api_key?: string;
    last_sync?: string;
    created_at?: string;
    updated_at?: string;
}

interface UserSettings {
    id?: number;
    user_id: string;
    enabled: boolean;
    created_at?: string;
    updated_at?: string;
}

interface MeetingData {
    id?: number;
    meeting_id: string;
    user_id: string;
    time_entry?: string; // JSON string
    raw_response?: string; // JSON string
    posted_at?: string;
    task_name?: string;
    report_id?: string;
    created_at?: string;
}

interface ReviewData {
    id: string;
    user_id: string;
    subject?: string;
    start_time?: string;
    end_time?: string;
    duration?: number;
    status?: string;
    confidence?: number;
    reason?: string;
    report_id?: string;
    participants?: string; // JSON string
    key_points?: string; // JSON string
    suggested_tasks?: string; // JSON string
    created_at?: string;
    updated_at?: string;
}

interface MeetingCacheData {
    id?: number;
    meeting_id: string;
    user_id: string;
    full_meeting_data: string; // JSON string of complete meeting object
    report_count?: number;
    has_attendance?: boolean;
    cached_at?: string;
    updated_at?: string;
}

export class AppDatabase {
    private db: Database.Database;
    private static instance: AppDatabase;
    
    private constructor() {
        // Ensure data directory exists
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const dbPath = path.join(dataDir, 'application.sqlite');
        this.db = new Database(dbPath);
        this.initializeSchema();
        
        console.log('✅ SQLite database initialized:', dbPath);
    }
    
    public static getInstance(): AppDatabase {
        if (!AppDatabase.instance) {
            AppDatabase.instance = new AppDatabase();
        }
        return AppDatabase.instance;
    }
    
    private initializeSchema() {
        // Enable foreign keys
        this.db.exec('PRAGMA foreign_keys = ON');
        
        // Create tables
        this.db.exec(`
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                intervals_api_key TEXT,
                last_sync DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            -- User settings table
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                enabled BOOLEAN DEFAULT false,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            );
            
            -- Posted meetings table
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                time_entry TEXT,
                raw_response TEXT,
                posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                task_name TEXT,
                report_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                UNIQUE(user_id, report_id)
            );
            
            -- Reviews table
            CREATE TABLE IF NOT EXISTS reviews (
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
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                UNIQUE(user_id, report_id)
            );
            
            -- Meeting cache table (for AI-processed meetings with attendance data)
            CREATE TABLE IF NOT EXISTS meeting_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                full_meeting_data TEXT NOT NULL,
                report_count INTEGER DEFAULT 0,
                has_attendance BOOLEAN DEFAULT 0,
                cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(meeting_id, user_id)
            );

            -- Create indexes for performance
            CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON meetings(user_id);
            CREATE INDEX IF NOT EXISTS idx_meetings_meeting_id ON meetings(meeting_id);
            CREATE INDEX IF NOT EXISTS idx_meetings_report_id ON meetings(report_id);
            CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
            CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
            CREATE INDEX IF NOT EXISTS idx_reviews_report_id ON reviews(report_id);
            CREATE INDEX IF NOT EXISTS idx_meeting_cache_lookup ON meeting_cache(meeting_id, user_id);
            CREATE INDEX IF NOT EXISTS idx_meeting_cache_user ON meeting_cache(user_id);
        `);
        
        // Add unique constraint to reviews table if it doesn't exist
        try {
            this.db.exec(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_report_unique 
                ON reviews(user_id, report_id) 
                WHERE report_id IS NOT NULL
            `);
            console.log('✅ Added unique constraint to reviews table');
        } catch (error) {
            console.log('ℹ️ Unique constraint already exists or could not be added');
        }
        
        console.log('✅ Database schema initialized');
    }
    
    // ===================== USER METHODS =====================
    
    createUser(userData: Omit<UserData, 'id' | 'created_at' | 'updated_at'>): UserData {
        const stmt = this.db.prepare(`
            INSERT INTO users (user_id, email, intervals_api_key, last_sync)
            VALUES (?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            userData.user_id,
            userData.email,
            userData.intervals_api_key || null,
            userData.last_sync || new Date().toISOString()
        );
        
        return this.getUserById(result.lastInsertRowid as number)!;
    }
    
    getUserById(id: number): UserData | null {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id) as UserData | null;
    }
    
    getUserByEmail(email: string): UserData | null {
        console.log(`Database: Looking up user by email: ${email}`);
        const stmt = this.db.prepare('SELECT * FROM users WHERE email = ? OR user_id = ?');
        const user = stmt.get(email, email) as UserData | null;
        
        if (user) {
            console.log(`Database: Found user ${email} with API key: ${user.intervals_api_key ? 'Yes' : 'No'}`);
        } else {
            console.log(`Database: No user found for email: ${email}`);
        }
        
        return user;
    }
    
    updateUserApiKey(userId: string, apiKey: string): void {
        const stmt = this.db.prepare(`
            UPDATE users 
            SET intervals_api_key = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ? OR email = ?
        `);
        stmt.run(apiKey, userId, userId);
    }
    
    updateUserLastSync(userId: string): void {
        const stmt = this.db.prepare(`
            UPDATE users 
            SET last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ? OR email = ?
        `);
        stmt.run(userId, userId);
    }
    
    getAllUsers(): UserData[] {
        const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC');
        return stmt.all() as UserData[];
    }
    
    // ===================== USER SETTINGS METHODS =====================
    
    getUserSettings(userId: string): UserSettings | null {
        const stmt = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
        return stmt.get(userId) as UserSettings | null;
    }
    
    createUserSettings(settings: Omit<UserSettings, 'id' | 'created_at' | 'updated_at'>): UserSettings {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_settings (user_id, enabled)
            VALUES (?, ?)
        `);
        
        stmt.run(settings.user_id, settings.enabled);
        return this.getUserSettings(settings.user_id)!;
    }
    
    updateUserSettings(userId: string, enabled: boolean): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_settings (user_id, enabled, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(userId, enabled);
    }
    
    // ===================== MEETING METHODS =====================
    
    saveMeeting(meeting: Omit<MeetingData, 'id' | 'created_at'>): MeetingData {
        const stmt = this.db.prepare(`
            INSERT INTO meetings (meeting_id, user_id, time_entry, raw_response, posted_at, task_name, report_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            meeting.meeting_id,
            meeting.user_id,
            meeting.time_entry || null,
            meeting.raw_response || null,
            meeting.posted_at || new Date().toISOString(),
            meeting.task_name || null,
            meeting.report_id || null
        );
        
        const newMeeting = this.db.prepare('SELECT * FROM meetings WHERE id = ?').get(result.lastInsertRowid as number);
        return newMeeting as MeetingData;
    }
    
    getMeetingsByUser(userId: string): MeetingData[] {
        const stmt = this.db.prepare(`
            SELECT * FROM meetings 
            WHERE user_id = ? 
            ORDER BY posted_at DESC
        `);
        return stmt.all(userId) as MeetingData[];
    }
    
    isMeetingPosted(meetingId: string, userId: string, reportId?: string): boolean {
        if (reportId) {
            const stmt = this.db.prepare(`
                SELECT COUNT(*) as count FROM meetings 
                WHERE user_id = ? AND report_id = ?
            `);
            const params = [userId, reportId];
            const result = stmt.get(...params) as { count: number };
            return result.count > 0;
        } else {
            const stmt = this.db.prepare(`
                SELECT COUNT(*) as count FROM meetings 
                WHERE meeting_id = ? AND user_id = ?
            `);
            const params = [meetingId, userId];
            const result = stmt.get(...params) as { count: number };
            return result.count > 0;
        }
    }
    
    clearUserMeetings(userId: string): void {
        const stmt = this.db.prepare('DELETE FROM meetings WHERE user_id = ?');
        stmt.run(userId);
    }
    
    // ===================== REVIEW METHODS =====================
    
    saveReview(review: ReviewData): ReviewData {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO reviews (
                id, user_id, subject, start_time, end_time, duration, 
                status, confidence, reason, report_id, participants, 
                key_points, suggested_tasks, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        
        stmt.run(
            review.id,
            review.user_id,
            review.subject || null,
            review.start_time || null,
            review.end_time || null,
            review.duration || null,
            review.status || 'pending',
            review.confidence || 0,
            review.reason || null,
            review.report_id || null,
            review.participants || null,
            review.key_points || null,
            review.suggested_tasks || null
        );
        
        return this.getReviewById(review.id)!;
    }
    
    getReviewById(id: string): ReviewData | null {
        const stmt = this.db.prepare('SELECT * FROM reviews WHERE id = ?');
        return stmt.get(id) as ReviewData | null;
    }
    
    getReviewsByUser(userId: string): ReviewData[] {
        const stmt = this.db.prepare(`
            SELECT * FROM reviews 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `);
        return stmt.all(userId) as ReviewData[];
    }
    
    getPendingReviews(userId: string): ReviewData[] {
        const stmt = this.db.prepare(`
            SELECT * FROM reviews 
            WHERE user_id = ? AND status = 'pending'
            ORDER BY created_at DESC
        `);
        return stmt.all(userId) as ReviewData[];
    }
    
    updateReviewStatus(reviewId: string, status: string): void {
        const stmt = this.db.prepare(`
            UPDATE reviews 
            SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        stmt.run(status, reviewId);
    }
    
    deleteReview(reviewId: string): void {
        const stmt = this.db.prepare('DELETE FROM reviews WHERE id = ?');
        stmt.run(reviewId);
    }

    // ===================== MEETING CACHE METHODS =====================

    saveMeetingCache(meetingId: string, userId: string, meetingData: any, reportCount: number = 0): void {
        try {
            const hasAttendance = meetingData.attendance ? 1 : 0;
            const fullData = JSON.stringify(meetingData);

            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO meeting_cache
                (meeting_id, user_id, full_meeting_data, report_count, has_attendance, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

            stmt.run(meetingId, userId, fullData, reportCount, hasAttendance);
            console.log(`✅ Saved meeting cache: ${meetingId.substring(0, 15)}... (reports: ${reportCount}, attendance: ${hasAttendance})`);
        } catch (error) {
            console.error('❌ Error saving meeting cache:', error);
            // Don't throw - let JSON fallback handle it
        }
    }

    getMeetingCache(meetingId: string, userId: string): any | null {
        try {
            const stmt = this.db.prepare(`
                SELECT full_meeting_data, report_count, has_attendance, cached_at
                FROM meeting_cache
                WHERE meeting_id = ? AND user_id = ?
            `);

            const row = stmt.get(meetingId, userId) as MeetingCacheData | undefined;

            if (row) {
                const meetingData = JSON.parse(row.full_meeting_data);
                console.log(`✅ Loaded meeting from cache: ${meetingId.substring(0, 15)}... (reports: ${row.report_count}, cached: ${row.cached_at})`);
                return {
                    meeting: meetingData,
                    reportCount: row.report_count || 0,
                    hasAttendance: Boolean(row.has_attendance)
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Error loading meeting cache:', error);
            return null; // Fallback to JSON
        }
    }

    getMeetingCacheById(meetingId: string): any | null {
        try {
            const stmt = this.db.prepare(`
                SELECT full_meeting_data FROM meeting_cache
                WHERE meeting_id = ?
                LIMIT 1
            `);
            const row = stmt.get(meetingId) as MeetingCacheData | undefined;
            return row ? JSON.parse(row.full_meeting_data) : null;
        } catch (error) {
            console.error('❌ Error getting meeting cache by ID:', error);
            return null;
        }
    }

    listMeetingCacheByUser(userId: string): any[] {
        try {
            const stmt = this.db.prepare(`
                SELECT full_meeting_data FROM meeting_cache
                WHERE user_id = ?
                ORDER BY updated_at DESC
            `);
            const rows = stmt.all(userId) as MeetingCacheData[];
            return rows.map(row => JSON.parse(row.full_meeting_data));
        } catch (error) {
            console.error('❌ Error listing meeting cache:', error);
            return [];
        }
    }

    clearMeetingCache(userId?: string): void {
        try {
            if (userId) {
                const stmt = this.db.prepare('DELETE FROM meeting_cache WHERE user_id = ?');
                stmt.run(userId);
                console.log(`🧹 Cleared meeting cache for user: ${userId}`);
            } else {
                const stmt = this.db.prepare('DELETE FROM meeting_cache');
                stmt.run();
                console.log('🧹 Cleared all meeting cache');
            }
        } catch (error) {
            console.error('❌ Error clearing meeting cache:', error);
        }
    }

    // ===================== UTILITY METHODS =====================

    close(): void {
        this.db.close();
    }
    
    // Get database statistics
    getStats(): any {
        const userCount = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
        const meetingCount = this.db.prepare('SELECT COUNT(*) as count FROM meetings').get() as { count: number };
        const reviewCount = this.db.prepare('SELECT COUNT(*) as count FROM reviews').get() as { count: number };
        
        return {
            users: userCount.count,
            meetings: meetingCount.count,
            reviews: reviewCount.count,
            dbPath: this.db.name
        };
    }
}

// Export singleton instance
export const database = AppDatabase.getInstance();

// Export types
export type { UserData, UserSettings, MeetingData, ReviewData, MeetingCacheData }; 