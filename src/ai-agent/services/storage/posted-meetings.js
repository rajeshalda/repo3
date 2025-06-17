"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAgentPostedMeetingsStorage = void 0;

// Import the SQLite database
const database_1 = require("../../../lib/database");

class AIAgentPostedMeetingsStorage {
    constructor() {
        // No initialization needed for SQLite
    }

    async loadData() {
        // SQLite handles data loading automatically
        return Promise.resolve();
    }

    async addPostedMeeting(postedMeeting) {
        try {
            // Convert to database format
            const meetingData = {
                meeting_id: postedMeeting.meetingId,
                user_id: postedMeeting.userId,
                time_entry: JSON.stringify(postedMeeting.timeEntry),
                raw_response: JSON.stringify(postedMeeting.rawResponse),
                posted_at: postedMeeting.postedAt,
                task_name: postedMeeting.taskName,
                report_id: postedMeeting.reportId
            };

            // Save to SQLite database
            database_1.database.saveMeeting(meetingData);
            
            console.log('Meeting saved to SQLite database:', postedMeeting.meetingId);
        } catch (error) {
            console.error('Error saving meeting to database:', error);
            throw error;
        }
    }

    async getPostedMeetings(userId) {
        try {
            // Get meetings from SQLite database
            const dbMeetings = database_1.database.getMeetingsByUser(userId);
            
            // Convert from database format to expected format
            const meetings = dbMeetings.map(meeting => ({
                meetingId: meeting.meeting_id,
                userId: meeting.user_id,
                timeEntry: meeting.time_entry ? JSON.parse(meeting.time_entry) : {},
                rawResponse: meeting.raw_response ? JSON.parse(meeting.raw_response) : {},
                postedAt: meeting.posted_at || meeting.created_at || new Date().toISOString(),
                taskName: meeting.task_name,
                reportId: meeting.report_id
            }));

            return meetings;
        } catch (error) {
            console.error('Error fetching meetings from database:', error);
            return [];
        }
    }

    async isPosted(userId, meetingId, duration = 0, dateTime = '', reportId) {
        try {
            // For now, use simple meeting ID check
            // TODO: In the future, we could enhance this to check duration and startTime if needed
            return database_1.database.isMeetingPosted(meetingId, userId, reportId);
        } catch (error) {
            console.error('Error checking if meeting is posted:', error);
            return false;
        }
    }

    async clearUserMeetings(userId) {
        try {
            database_1.database.clearUserMeetings(userId);
            console.log('Cleared all meetings for user:', userId);
        } catch (error) {
            console.error('Error clearing user meetings:', error);
            throw error;
        }
    }

    // Legacy compatibility methods
    async saveDataUnsafe() {
        // No-op for SQLite - data is saved immediately
        return Promise.resolve();
    }

    async saveData() {
        // No-op for SQLite - data is saved immediately  
        return Promise.resolve();
    }

    getISTFormattedDate(dateStr) {
        // Return ISO string for consistency
        return new Date(dateStr).toISOString();
    }
}

exports.AIAgentPostedMeetingsStorage = AIAgentPostedMeetingsStorage;
