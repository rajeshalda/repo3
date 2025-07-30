"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageManager = exports.StorageManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
// Import SQLite database
const database_1 = require("../../../lib/database");

class StorageManager {
    constructor() {
        this.storagePath = path_1.default.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json');
        this.meetingsFile = path_1.default.join(this.storagePath, 'ai-agent-meetings.json');
        this.reviewsPath = path_1.default.join(this.storagePath, 'reviews.json');
        this.decisionsPath = path_1.default.join(this.storagePath, 'review-decisions.json');
        this.initializeStorage();
    }
    static getInstance() {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }
    async initializeStorage() {
        try {
            // Create storage directory if it doesn't exist
            await promises_1.default.mkdir(this.storagePath, { recursive: true });
            // Create meetings file with empty array if it doesn't exist
            try {
                await promises_1.default.access(this.meetingsFile);
            }
            catch {
                await promises_1.default.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
            }
            // Create reviews file with empty array if it doesn't exist
            try {
                await promises_1.default.access(this.reviewsPath);
            }
            catch {
                await promises_1.default.writeFile(this.reviewsPath, JSON.stringify([], null, 2), 'utf-8');
            }
            // Create decisions file with empty array if it doesn't exist
            try {
                await promises_1.default.access(this.decisionsPath);
            }
            catch {
                await promises_1.default.writeFile(this.decisionsPath, JSON.stringify([], null, 2), 'utf-8');
            }
        }
        catch (error) {
            console.error('Error initializing storage:', error);
            throw new Error('Failed to initialize storage');
        }
    }
    getFilePath(fileName) {
        return path_1.default.join(this.storagePath, fileName);
    }
    async loadMeetings() {
        try {
            const data = await promises_1.default.readFile(this.meetingsFile, 'utf-8');
            try {
                // Clean the data before parsing
                const cleanData = data.trim().replace(/^\uFEFF/, ''); // Remove BOM if present
                const parsedData = JSON.parse(cleanData);
                return parsedData.meetings || [];
            }
            catch (parseError) {
                console.error('Error parsing meetings JSON:', parseError);
                // If JSON is invalid, backup the corrupted file and create a new empty one
                const backupPath = path_1.default.join(this.storagePath, `corrupted-meetings-${Date.now()}.json`);
                await promises_1.default.writeFile(backupPath, data, 'utf-8');
                await promises_1.default.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
                return [];
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                // If file doesn't exist, create it with empty array
                await promises_1.default.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
                return [];
            }
            console.error('Error loading meetings:', error);
            throw new Error('Failed to load meetings');
        }
    }
    async saveMeeting(meeting) {
        try {
            const meetings = await this.loadMeetings();
            const existingIndex = meetings.findIndex(m => m.id === meeting.id);
            if (existingIndex >= 0) {
                meetings[existingIndex] = meeting;
            }
            else {
                meetings.push(meeting);
            }
            // Save with the correct structure
            const data = {
                meetings: meetings
            };
            // Ensure clean JSON output
            const cleanJson = JSON.stringify(data, null, 2).trim() + '\n';
            await promises_1.default.writeFile(this.meetingsFile, cleanJson, 'utf-8');
        }
        catch (error) {
            console.error('Error saving meeting:', error);
            throw new Error('Failed to save meeting');
        }
    }
    async getMeeting(id) {
        try {
            const meetings = await this.loadMeetings();
            return meetings.find(m => m.id === id) || null;
        }
        catch (error) {
            console.error('Error getting meeting:', error);
            throw new Error('Failed to get meeting');
        }
    }
    async listMeetings(userId) {
        try {
            const meetings = await this.loadMeetings();
            return meetings.filter(m => m.userId === userId);
        }
        catch (error) {
            console.error('Error listing meetings:', error);
            throw new Error('Failed to list meetings');
        }
    }
    async saveMeetings(meetings) {
        try {
            const data = {
                meetings: meetings
            };
            await promises_1.default.writeFile(this.meetingsFile, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('Error saving meetings:', error);
            throw new Error('Failed to save meetings');
        }
    }
    // Backup functionality
    async createBackup() {
        try {
            const meetings = await this.loadMeetings();
            const backupPath = this.getFilePath(`backup-${new Date().toISOString()}.json`);
            await promises_1.default.writeFile(backupPath, JSON.stringify(meetings, null, 2));
        }
        catch (error) {
            console.error('Error creating backup:', error);
            throw new Error('Failed to create backup');
        }
    }
    async restoreFromBackup(backupFileName) {
        try {
            const backupPath = this.getFilePath(backupFileName);
            const backupData = await promises_1.default.readFile(backupPath, 'utf-8');
            const meetings = JSON.parse(backupData);
            await this.saveMeetings(meetings);
        }
        catch (error) {
            console.error('Error restoring from backup:', error);
            throw new Error('Failed to restore from backup');
        }
    }
    
    // Review-related methods - NOW USING SQLITE
    async storeMeetingForReview(meeting) {
        try {
            // Check if this meeting already exists in the reviews for this user using SQLite
            // For meetings with report IDs, we need to check both meeting ID and report ID to avoid duplicates
            let existingReview = null;
            
            if (meeting.reportId) {
                // If meeting has a report ID, check for existing review with same meeting ID and report ID
                const allReviews = database_1.database.getReviewsByUser(meeting.userId);
                existingReview = allReviews.find(review => 
                    review.id === meeting.id && review.report_id === meeting.reportId
                );
            } else {
                // If no report ID, check by meeting ID only
                existingReview = database_1.database.getReviewById(meeting.id);
                if (existingReview && existingReview.user_id !== meeting.userId) {
                    existingReview = null; // Different user, so not a duplicate
                }
            }
            
            if (existingReview) {
                // Meeting already exists for this user with same report ID, update it
                console.log(`Meeting with ID ${meeting.id} and report ID ${meeting.reportId} already exists in reviews for user ${meeting.userId}, updating`);
                database_1.database.saveReview({
                    id: meeting.id,
                    user_id: meeting.userId,
                    subject: meeting.subject,
                    start_time: meeting.startTime,
                    end_time: meeting.endTime,
                    duration: meeting.duration,
                    participants: JSON.stringify(meeting.participants || []),
                    key_points: JSON.stringify(meeting.keyPoints || []),
                    suggested_tasks: JSON.stringify(meeting.suggestedTasks || []),
                    status: meeting.status,
                    confidence: meeting.confidence,
                    reason: meeting.reason,
                    report_id: meeting.reportId
                });
            } else {
                // Meeting doesn't exist for this user with this report ID, add it
                console.log(`Adding new meeting with ID ${meeting.id} for user ${meeting.userId} to reviews`);
                database_1.database.saveReview({
                    id: meeting.id,
                    user_id: meeting.userId,
                    subject: meeting.subject,
                    start_time: meeting.startTime,
                    end_time: meeting.endTime,
                    duration: meeting.duration,
                    participants: JSON.stringify(meeting.participants || []),
                    key_points: JSON.stringify(meeting.keyPoints || []),
                    suggested_tasks: JSON.stringify(meeting.suggestedTasks || []),
                    status: meeting.status,
                    confidence: meeting.confidence,
                    reason: meeting.reason,
                    report_id: meeting.reportId
                });
            }
        } catch (error) {
            console.error('Error storing meeting for review in SQLite:', error);
            throw error;
        }
    }
    
    async getPendingReviews(userId) {
        try {
            const reviews = database_1.database.getPendingReviews(userId);
            return reviews.map(review => ({
                id: review.id,
                userId: review.user_id,
                subject: review.subject || '',
                startTime: review.start_time || '',
                endTime: review.end_time || '',
                duration: review.duration || 0,
                participants: review.participants ? JSON.parse(review.participants) : [],
                keyPoints: review.key_points ? JSON.parse(review.key_points) : [],
                suggestedTasks: review.suggested_tasks ? JSON.parse(review.suggested_tasks) : [],
                status: review.status || 'pending',
                confidence: review.confidence || 0,
                reason: review.reason || '',
                reportId: review.report_id
            }));
        } catch (error) {
            console.error('Error getting pending reviews from SQLite:', error);
            return [];
        }
    }
    
    async getAllReviews(userId) {
        try {
            const reviews = database_1.database.getReviewsByUser(userId);
            return reviews.map(review => ({
                id: review.id,
                userId: review.user_id,
                subject: review.subject || '',
                startTime: review.start_time || '',
                endTime: review.end_time || '',
                duration: review.duration || 0,
                participants: review.participants ? JSON.parse(review.participants) : [],
                keyPoints: review.key_points ? JSON.parse(review.key_points) : [],
                suggestedTasks: review.suggested_tasks ? JSON.parse(review.suggested_tasks) : [],
                status: review.status || 'pending',
                confidence: review.confidence || 0,
                reason: review.reason || '',
                reportId: review.report_id
            }));
        } catch (error) {
            console.error('Error getting all reviews from SQLite:', error);
            return [];
        }
    }
    
    async getMeetingForReview(meetingId, userId) {
        try {
            const review = database_1.database.getReviewById(meetingId);
            
            if (!review) {
                return null;
            }
            
            // If userId is provided, check if it matches
            if (userId && review.user_id !== userId) {
                return null;
            }
            
            return {
                id: review.id,
                userId: review.user_id,
                subject: review.subject || '',
                startTime: review.start_time || '',
                endTime: review.end_time || '',
                duration: review.duration || 0,
                participants: review.participants ? JSON.parse(review.participants) : [],
                keyPoints: review.key_points ? JSON.parse(review.key_points) : [],
                suggestedTasks: review.suggested_tasks ? JSON.parse(review.suggested_tasks) : [],
                status: review.status || 'pending',
                confidence: review.confidence || 0,
                reason: review.reason || '',
                reportId: review.report_id
            };
        } catch (error) {
            console.error('Error getting meeting for review from SQLite:', error);
            return null;
        }
    }
    
    async updateReviewStatus(decision) {
        try {
            const review = database_1.database.getReviewById(decision.meetingId);
            
            if (review && review.user_id === decision.decidedBy) {
                database_1.database.updateReviewStatus(decision.meetingId, decision.status);
            } else {
                console.warn(`No review found for meeting ${decision.meetingId} and user ${decision.decidedBy}`);
            }
        } catch (error) {
            console.error('Error updating review status in SQLite:', error);
            throw error;
        }
    }
    
    async storeReviewDecision(decision) {
        const decisions = await this.readDecisions();
        decisions.push(decision);
        await this.writeDecisions(decisions);
    }
    
    // Private helper methods
    async readReviews() {
        try {
            const content = await promises_1.default.readFile(this.reviewsPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            return [];
        }
    }
    async writeReviews(reviews) {
        await promises_1.default.writeFile(this.reviewsPath, JSON.stringify(reviews, null, 2));
    }
    async readDecisions() {
        try {
            const content = await promises_1.default.readFile(this.decisionsPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            return [];
        }
    }
    async writeDecisions(decisions) {
        await promises_1.default.writeFile(this.decisionsPath, JSON.stringify(decisions, null, 2));
    }
}
exports.StorageManager = StorageManager;
exports.storageManager = StorageManager.getInstance();
