import { ProcessedMeeting } from '../../../interfaces/meetings';
import { ReviewMeeting, ReviewDecision, ReviewStatus } from '../../services/review/types';
import { database } from '../../../lib/database';

export class StorageManager {
    private static instance: StorageManager;

    private constructor() {
        // All storage now uses SQLite database - no JSON files
        console.log('✅ StorageManager initialized - using SQLite database only');
    }

    public static getInstance(): StorageManager {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }

    // DEPRECATED: All meeting cache operations now use SQLite via database.ts
    // These methods are kept for backward compatibility but are no-ops
    public async loadMeetings(): Promise<ProcessedMeeting[]> {
        console.warn('⚠️ loadMeetings() is deprecated - use database.listMeetingCacheByUser() instead');
        return [];
    }

    public async saveMeeting(meeting: ProcessedMeeting): Promise<void> {
        console.warn('⚠️ saveMeeting() is deprecated - use database.saveMeetingCache() instead');
        // No-op - all meeting caching is done via SQLite in the MeetingService
    }

    public async getMeeting(id: string): Promise<ProcessedMeeting | null> {
        console.warn('⚠️ getMeeting() is deprecated - use database.getMeetingCacheById() instead');
        return database.getMeetingCacheById(id);
    }

    public async listMeetings(userId: string): Promise<ProcessedMeeting[]> {
        console.warn('⚠️ listMeetings() is deprecated - use database.listMeetingCacheByUser() instead');
        return database.listMeetingCacheByUser(userId);
    }

    // Backup functionality removed - SQLite database is backed up via database file
    public async createBackup(): Promise<void> {
        console.warn('⚠️ createBackup() is deprecated - SQLite database is automatically persisted');
    }

    public async restoreFromBackup(backupFileName: string): Promise<void> {
        console.warn('⚠️ restoreFromBackup() is deprecated - restore SQLite database file directly');
    }

    // Review-related methods
    public async storeMeetingForReview(meeting: ReviewMeeting): Promise<void> {
        try {
            // Check if this meeting already exists in the reviews for this user using SQLite
            // For meetings with report IDs, we need to check both meeting ID and report ID to avoid duplicates
            let existingReview = null;

            if (meeting.reportId) {
                // If meeting has a report ID, check for existing review with same meeting ID and report ID
                const allReviews = database.getReviewsByUser(meeting.userId);
                existingReview = allReviews.find(review =>
                    review.id === meeting.id && review.report_id === meeting.reportId
                );
            } else {
                // If no report ID, check by meeting ID only
                existingReview = database.getReviewById(meeting.id);
                if (existingReview && existingReview.user_id !== meeting.userId) {
                    existingReview = null; // Different user, so not a duplicate
                }
            }

            if (existingReview) {
                // Meeting already exists for this user with same report ID, update it
                console.log(`Meeting with ID ${meeting.id} and report ID ${meeting.reportId} already exists in reviews for user ${meeting.userId}, updating`);
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
                // Meeting doesn't exist for this user with this report ID, add it
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

}

export const storageManager = StorageManager.getInstance(); 