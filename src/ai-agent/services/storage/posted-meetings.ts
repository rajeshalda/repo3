import { database, type MeetingData } from '@/lib/database';

interface TimeEntryResponse {
    id?: string;
    projectid: string;
    moduleid: string;
    taskid: string;
    worktypeid: string;
    personid: string;
    date: string;
    datemodified: string;
    time: string;
    description: string;
    billable: string;
    created?: string;
    updated?: string;
    client?: string;
    project?: string;
    module?: string;
    worktype?: string;
    taskTitle?: string;
}

interface PostedMeeting {
    meetingId: string;
    userId: string;
    timeEntry: TimeEntryResponse;
    rawResponse: any;
    postedAt: string;
    taskName?: string;
    reportId?: string;
}

export class AIAgentPostedMeetingsStorage {
    constructor() {
        // No initialization needed for SQLite
    }

    async loadData(): Promise<void> {
        // SQLite handles data loading automatically
        return Promise.resolve();
    }

    async addPostedMeeting(meeting: PostedMeeting): Promise<void> {
        try {
            // Convert to database format
            const meetingData: Omit<MeetingData, 'id' | 'created_at'> = {
                meeting_id: meeting.meetingId,
                user_id: meeting.userId,
                time_entry: JSON.stringify(meeting.timeEntry),
                raw_response: JSON.stringify(meeting.rawResponse),
                posted_at: meeting.postedAt,
                task_name: meeting.taskName,
                report_id: meeting.reportId
            };

            // Save to SQLite database
            database.saveMeeting(meetingData);
            
            console.log('Meeting saved to SQLite database:', meeting.meetingId);
        } catch (error) {
            console.error('Error saving meeting to database:', error);
            throw error;
        }
    }

    async getPostedMeetings(userId: string): Promise<PostedMeeting[]> {
        try {
            // Get meetings from SQLite database
            const dbMeetings = database.getMeetingsByUser(userId);
            
            // Convert from database format to expected format
            const meetings: PostedMeeting[] = dbMeetings.map(meeting => ({
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

    async isPosted(userId: string, meetingId: string, duration?: number, startTime?: string, reportId?: string): Promise<boolean> {
        try {
            // If report ID is provided, it's the most reliable way to check for duplicates
            if (reportId) {
                console.log(`Checking if meeting with report ID ${reportId} is already posted for user ${userId}`);
                return database.isMeetingPosted('', userId, reportId); // meeting_id is not needed when report_id is provided
            } else {
                // Fallback to meeting ID check if no report ID is available
                console.log(`No report ID provided, checking if meeting ${meetingId} is posted for user ${userId}`);
                return database.isMeetingPosted(meetingId, userId);
            }
        } catch (error) {
            console.error('Error checking if meeting is posted:', error);
            return false;
        }
    }

    async clearUserMeetings(userId: string): Promise<void> {
        try {
            database.clearUserMeetings(userId);
            console.log('Cleared all meetings for user:', userId);
        } catch (error) {
            console.error('Error clearing user meetings:', error);
            throw error;
        }
    }

    // Legacy compatibility methods
    async saveDataUnsafe(): Promise<void> {
        // No-op for SQLite - data is saved immediately
        return Promise.resolve();
    }

    async saveData(): Promise<void> {
        // No-op for SQLite - data is saved immediately  
        return Promise.resolve();
    }
} 