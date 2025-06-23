import { ProcessedMeeting } from '../../../interfaces/meetings';
import fs from 'fs/promises';
import path from 'path';
import { ReviewMeeting, ReviewDecision, ReviewStatus } from '../../services/review/types';
import { database } from '../../../lib/database';

export class StorageManager {
    private static instance: StorageManager;
    private storagePath: string;
    private meetingsFile: string;
    private reviewsPath: string;
    private decisionsPath: string;

    private constructor() {
        this.storagePath = path.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json');
        this.meetingsFile = path.join(this.storagePath, 'ai-agent-meetings.json');
        this.reviewsPath = path.join(this.storagePath, 'reviews.json');
        this.decisionsPath = path.join(this.storagePath, 'review-decisions.json');
        this.initializeStorage();
    }

    public static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    private async initializeStorage(): Promise<void> {
        try {
            // Create storage directory if it doesn't exist
            await fs.mkdir(this.storagePath, { recursive: true });
            
            // Create meetings file with empty array if it doesn't exist
            try {
                await fs.access(this.meetingsFile);
            } catch {
                await fs.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
            }

            // Create reviews file with empty array if it doesn't exist
            try {
                await fs.access(this.reviewsPath);
                // Validate and migrate existing reviews
                const reviews = await this.readReviews();
                const needsMigration = reviews.some(review => !review.userId);
                if (needsMigration) {
                    console.log('Migrating reviews to include userId...');
                    // Create backup of old reviews
                    const backupPath = path.join(this.storagePath, `reviews-backup-${Date.now()}.json`);
                    await fs.writeFile(backupPath, JSON.stringify(reviews, null, 2), 'utf-8');
                    // Reset reviews to empty array since old format is incompatible
                    await this.writeReviews([]);
                }
            } catch {
                await fs.writeFile(this.reviewsPath, JSON.stringify([], null, 2), 'utf-8');
            }

            // Create decisions file with empty array if it doesn't exist
            try {
                await fs.access(this.decisionsPath);
            } catch {
                await fs.writeFile(this.decisionsPath, JSON.stringify([], null, 2), 'utf-8');
            }
        } catch (error: unknown) {
            console.error('Error initializing storage:', error);
            throw new Error('Failed to initialize storage');
        }
    }

    private getFilePath(fileName: string): string {
        return path.join(this.storagePath, fileName);
    }

    public async loadMeetings(): Promise<ProcessedMeeting[]> {
        try {
            const data = await fs.readFile(this.meetingsFile, 'utf-8');
            try {
                // Clean the data before parsing
                const cleanData = data.trim().replace(/^\uFEFF/, ''); // Remove BOM if present
                const parsedData = JSON.parse(cleanData);
                return parsedData.meetings || [];
            } catch (parseError) {
                console.error('Error parsing meetings JSON:', parseError);
                // If JSON is invalid, backup the corrupted file and create a new empty one
                const backupPath = path.join(this.storagePath, `corrupted-meetings-${Date.now()}.json`);
                await fs.writeFile(backupPath, data, 'utf-8');
                await fs.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
                return [];
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // If file doesn't exist, create it with empty array
                await fs.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
                return [];
            }
            console.error('Error loading meetings:', error);
            throw new Error('Failed to load meetings');
        }
    }

    public async saveMeeting(meeting: ProcessedMeeting): Promise<void> {
        try {
            const meetings = await this.loadMeetings();
            const existingIndex = meetings.findIndex(m => m.id === meeting.id);

            if (existingIndex >= 0) {
                meetings[existingIndex] = meeting;
            } else {
                meetings.push(meeting);
            }

            // Save with the correct structure
            const data = {
                meetings: meetings
            };

            // Ensure clean JSON output
            const cleanJson = JSON.stringify(data, null, 2).trim() + '\n';
            await fs.writeFile(this.meetingsFile, cleanJson, 'utf-8');
        } catch (error: unknown) {
            console.error('Error saving meeting:', error);
            throw new Error('Failed to save meeting');
        }
    }

    public async getMeeting(id: string): Promise<ProcessedMeeting | null> {
        try {
            const meetings = await this.loadMeetings();
            return meetings.find(m => m.id === id) || null;
        } catch (error: unknown) {
            console.error('Error getting meeting:', error);
            throw new Error('Failed to get meeting');
        }
    }

    public async listMeetings(userId: string): Promise<ProcessedMeeting[]> {
        try {
            const meetings = await this.loadMeetings();
            return meetings.filter(m => m.userId === userId);
        } catch (error: unknown) {
            console.error('Error listing meetings:', error);
            throw new Error('Failed to list meetings');
        }
    }

    private async saveMeetings(meetings: ProcessedMeeting[]): Promise<void> {
        try {
            const data = {
                meetings: meetings
            };
            await fs.writeFile(this.meetingsFile, JSON.stringify(data, null, 2));
        } catch (error: unknown) {
            console.error('Error saving meetings:', error);
            throw new Error('Failed to save meetings');
        }
    }

    // Backup functionality
    public async createBackup(): Promise<void> {
        try {
            const meetings = await this.loadMeetings();
            const backupPath = this.getFilePath(`backup-${new Date().toISOString()}.json`);
            await fs.writeFile(backupPath, JSON.stringify(meetings, null, 2));
        } catch (error: unknown) {
            console.error('Error creating backup:', error);
            throw new Error('Failed to create backup');
        }
    }

    public async restoreFromBackup(backupFileName: string): Promise<void> {
        try {
            const backupPath = this.getFilePath(backupFileName);
            const backupData = await fs.readFile(backupPath, 'utf-8');
            const meetings = JSON.parse(backupData);
            await this.saveMeetings(meetings);
        } catch (error: unknown) {
            console.error('Error restoring from backup:', error);
            throw new Error('Failed to restore from backup');
        }
    }

    // Review-related methods
    public async storeMeetingForReview(meeting: ReviewMeeting): Promise<void> {
        try {
            // Check if this meeting already exists in the reviews for this user using SQLite
            const existingReview = database.getReviewById(meeting.id);
            
            if (existingReview && existingReview.user_id === meeting.userId) {
                // Meeting already exists for this user, update it
                console.log(`Meeting with ID ${meeting.id} already exists in reviews for user ${meeting.userId}, updating`);
                database.saveReview({
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
                // Meeting doesn't exist for this user, add it
                console.log(`Adding new meeting with ID ${meeting.id} for user ${meeting.userId} to reviews`);
                database.saveReview({
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

    public async getPendingReviews(userId: string): Promise<ReviewMeeting[]> {
        try {
            const reviews = database.getPendingReviews(userId);
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
                status: (review.status || 'pending') as ReviewStatus,
                confidence: review.confidence || 0,
                reason: review.reason || '',
                reportId: review.report_id
            }));
        } catch (error) {
            console.error('Error getting pending reviews from SQLite:', error);
            return [];
        }
    }

    public async getAllReviews(userId: string): Promise<ReviewMeeting[]> {
        try {
            const reviews = database.getReviewsByUser(userId);
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
                status: (review.status || 'pending') as ReviewStatus,
                confidence: review.confidence || 0,
                reason: review.reason || '',
                reportId: review.report_id
            }));
        } catch (error) {
            console.error('Error getting all reviews from SQLite:', error);
            return [];
        }
    }

    public async getMeetingForReview(meetingId: string, userId?: string): Promise<ReviewMeeting | null> {
        try {
            const review = database.getReviewById(meetingId);
            
            if (!review) {
                return null;
            }
            
            // If userId is provided, check if it matches using flexible matching
            if (userId) {
                const originalUserId = review.user_id;
                const requestingUserId = userId;
                
                // Check for exact match first
                let userMatches = originalUserId === requestingUserId;
                
                // If no exact match, check if requesting user has ai-agent prefix
                if (!userMatches && requestingUserId.startsWith('ai-agent-')) {
                    const userWithoutPrefix = requestingUserId.replace('ai-agent-', '');
                    userMatches = originalUserId === userWithoutPrefix;
                }
                
                // If no match yet, check if original user had ai-agent prefix and requesting user doesn't
                if (!userMatches && originalUserId.startsWith('ai-agent-')) {
                    const originalWithoutPrefix = originalUserId.replace('ai-agent-', '');
                    userMatches = originalWithoutPrefix === requestingUserId;
                }
                
                if (!userMatches) {
                    return null;
                }
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
                status: (review.status || 'pending') as ReviewStatus,
                confidence: review.confidence || 0,
                reason: review.reason || '',
                reportId: review.report_id
            };
        } catch (error) {
            console.error('Error getting meeting for review from SQLite:', error);
            return null;
        }
    }

    public async updateReviewStatus(decision: ReviewDecision): Promise<void> {
        try {
            const review = database.getReviewById(decision.meetingId);
            
            if (review) {
                // More flexible user matching to handle different user ID formats
                // Handle cases where review was created with user@domain but update uses ai-agent prefix
                const originalUserId = review.user_id;
                const decidedByUserId = decision.decidedBy;
                
                // Check for exact match first
                let userMatches = originalUserId === decidedByUserId;
                
                // If no exact match, check if decidedBy is the original user with ai-agent prefix
                if (!userMatches && decidedByUserId.startsWith('ai-agent-')) {
                    const userWithoutPrefix = decidedByUserId.replace('ai-agent-', '');
                    userMatches = originalUserId === userWithoutPrefix;
                }
                
                // If no match yet, check if original user had ai-agent prefix and decidedBy doesn't
                if (!userMatches && originalUserId.startsWith('ai-agent-')) {
                    const originalWithoutPrefix = originalUserId.replace('ai-agent-', '');
                    userMatches = originalWithoutPrefix === decidedByUserId;
                }
                
                if (userMatches) {
                    database.updateReviewStatus(decision.meetingId, decision.status);
                    console.log(`Successfully updated review status for meeting ${decision.meetingId} from ${originalUserId} by ${decidedByUserId}`);
                } else {
                    console.warn(`No review found for meeting ${decision.meetingId} and user ${decision.decidedBy} (original user: ${originalUserId})`);
                }
            } else {
                console.warn(`No review found for meeting ${decision.meetingId}`);
            }
        } catch (error) {
            console.error('Error updating review status in SQLite:', error);
            throw error;
        }
    }

    public async storeReviewDecision(decision: ReviewDecision): Promise<void> {
        const decisions = await this.readDecisions();
        decisions.push(decision);
        await this.writeDecisions(decisions);
    }

    // Private helper methods
    private async readReviews(): Promise<ReviewMeeting[]> {
        try {
            const content = await fs.readFile(this.reviewsPath, 'utf-8');
            const reviews = JSON.parse(content);
            
            // Validate that reviews is an array and each review has required fields
            if (!Array.isArray(reviews)) {
                console.error('Invalid reviews data structure, resetting to empty array');
                await this.writeReviews([]);
                return [];
            }

            // Filter out invalid reviews
            const validReviews = reviews.filter(review => {
                const isValid = review && 
                    typeof review === 'object' &&
                    typeof review.id === 'string' &&
                    typeof review.userId === 'string' &&
                    typeof review.subject === 'string' &&
                    typeof review.startTime === 'string' &&
                    typeof review.endTime === 'string';
                
                if (!isValid) {
                    console.warn('Found invalid review:', review);
                }
                return isValid;
            });

            if (validReviews.length !== reviews.length) {
                console.warn(`Filtered out ${reviews.length - validReviews.length} invalid reviews`);
                await this.writeReviews(validReviews);
            }

            return validReviews;
        } catch (error) {
            console.error('Error reading reviews:', error);
            return [];
        }
    }

    private async writeReviews(reviews: ReviewMeeting[]): Promise<void> {
        await fs.writeFile(this.reviewsPath, JSON.stringify(reviews, null, 2));
    }

    private async readDecisions(): Promise<ReviewDecision[]> {
        try {
            const content = await fs.readFile(this.decisionsPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            return [];
        }
    }

    private async writeDecisions(decisions: ReviewDecision[]): Promise<void> {
        await fs.writeFile(this.decisionsPath, JSON.stringify(decisions, null, 2));
    }
}

export const storageManager = StorageManager.getInstance(); 