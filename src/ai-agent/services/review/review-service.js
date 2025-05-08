"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewService = void 0;
const manager_1 = require("../../data/storage/manager");
class ReviewService {
    constructor() {
        this.CONFIDENCE_THRESHOLD = 0.7;
    }
    static getInstance() {
        if (!ReviewService.instance) {
            ReviewService.instance = new ReviewService();
        }
        return ReviewService.instance;
    }
    async queueForReview(meeting) {
        try {
            // Store the meeting in the review queue
            await manager_1.storageManager.storeMeetingForReview(meeting);
            // Log the review request
            console.log(`Meeting queued for review: ${meeting.id} - ${meeting.subject}`);
        }
        catch (error) {
            console.error('Error queuing meeting for review:', error);
            throw error;
        }
    }
    async getPendingReviews(userId) {
        try {
            const reviews = await manager_1.storageManager.getPendingReviews(userId);
            return reviews.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        }
        catch (error) {
            console.error('Error getting pending reviews:', error);
            throw error;
        }
    }
    async submitReview(decision) {
        try {
            // Update the meeting status
            await manager_1.storageManager.updateReviewStatus(decision);
            // If approved with a task, create time entry
            if (decision.status === 'approved' && decision.taskId) {
                const meeting = await manager_1.storageManager.getMeetingForReview(decision.meetingId);
                if (meeting) {
                    // Create time entry using the selected task
                    // This would typically be handled by the time entry service
                    // timeEntryService.createTimeEntry(meeting, decision.taskId);
                }
            }
            // Store the decision for learning
            await this.storeDecisionForLearning(decision);
            console.log(`Review submitted for meeting ${decision.meetingId}`);
        }
        catch (error) {
            console.error('Error submitting review:', error);
            throw error;
        }
    }
    async getReviewStats(userId) {
        try {
            const allReviews = await manager_1.storageManager.getAllReviews(userId);
            const totalReviews = allReviews.length;
            const pendingReviews = allReviews.filter(r => r.status === 'pending');
            const reviewedMeetings = allReviews.filter(r => r.status !== 'pending');
            const approvedMeetings = allReviews.filter(r => r.status === 'approved');
            const stats = {
                totalPending: pendingReviews.length,
                totalReviewed: reviewedMeetings.length,
                approvalRate: reviewedMeetings.length > 0
                    ? (approvedMeetings.length / reviewedMeetings.length) * 100
                    : 0,
                averageConfidence: allReviews.reduce((acc, curr) => acc + curr.confidence, 0) / totalReviews || 0
            };
            return stats;
        }
        catch (error) {
            console.error('Error getting review stats:', error);
            throw error;
        }
    }
    shouldReview(confidence) {
        return confidence < this.CONFIDENCE_THRESHOLD;
    }
    async storeDecisionForLearning(decision) {
        try {
            console.log(`
╔═════════════════════ REVIEW DECISION ═════════════════════╗
║ 📝 STORING REVIEW FEEDBACK                                ║
║ 🎯 Meeting ID: ${decision.meetingId.substring(0, 15)}...  ║
║ ✍️ Decision By: ${decision.decidedBy}                     ║
║ 📊 Status: ${decision.status}                             ║
╚══════════════════════════════════════════════════════════╝`);

            await manager_1.storageManager.storeReviewDecision(decision);

            console.log(`
┌────────────────── LEARNING STATUS ──────────────────┐
│ ✅ Decision stored successfully                     │
│ 📚 Added to learning dataset                        │
└──────────────────────────────────────────────────────┘`);
        }
        catch (error) {
            console.error(`
┌────────────────── ERROR DETAILS ──────────────────┐
│ ❌ Failed to store review decision                │
│ 🔍 Error: ${error.message}                        │
└─────────────────────────────────────────────────────┘`);
            // Don't throw here as this is not critical for the main flow
        }
    }
}
exports.reviewService = ReviewService.getInstance();
