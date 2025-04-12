import { promises as fs } from 'fs';
import path from 'path';
import { TimeEntryResponse } from '@/interfaces/time-entries';
import { IntervalsAPI } from './intervals-api';

interface PostedMeeting {
    meetingId: string;
    userId: string;
    timeEntry: TimeEntryResponse;
    rawResponse: any;
    postedAt: string;
    taskName?: string;
}

interface PostedMeetingsFile {
    meetings: PostedMeeting[];
}

export class PostedMeetingsStorage {
    private data: PostedMeetingsFile = { meetings: [] };
    private storagePath: string;

    constructor() {
        this.storagePath = path.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json', 'ai-agent-meetings.json');
    }

    private async loadData() {
        try {
            const fileContent = await fs.readFile(this.storagePath, 'utf-8');
            this.data = JSON.parse(fileContent);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // File doesn't exist, initialize with empty data
                this.data = { meetings: [] };
                await this.saveData();
            } else {
                throw error;
            }
        }
    }

    private async saveData() {
        const dir = path.dirname(this.storagePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
    }

    private getISTFormattedDate(date?: string | Date): string {
        const now = date ? new Date(date) : new Date();
        const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        return istDate.toISOString().replace('Z', '') + ' IST';
    }

    async addPostedMeeting(email: string, meeting: { 
        subject: string, 
        startTime: string, 
        taskId?: string, 
        taskName?: string, 
        client?: string, 
        project?: string,
        meetingId?: string  // Add meetingId parameter to accept Microsoft Graph ID
    }, attendanceRecords: { email: string, name: string, duration: number }[], apiKey: string) {
        await this.loadData();

        // Prioritize the provided meetingId (Microsoft Graph ID) if available,
        // otherwise fall back to the old custom format
        const meetingId = meeting.meetingId || `${email.toLowerCase()}_${meeting.subject}_${meeting.startTime}`;
        
        console.log('PostedMeetingsStorage: Using meetingId:', {
            providedId: meeting.meetingId,
            generatedId: `${email.toLowerCase()}_${meeting.subject}_${meeting.startTime}`,
            finalId: meetingId
        });

        // Find user's attendance record to get duration
        const userAttendance = attendanceRecords.find(record => record.email === email);
        const duration = userAttendance ? userAttendance.duration : 0;

        // Get task details from Intervals API
        const intervalsApi = new IntervalsAPI(apiKey);
        const tasks = await intervalsApi.getTasks();
        const taskDetails = tasks.find((t: { 
            id: string; 
            projectid: string; 
            moduleid: string; 
            title?: string; 
            client?: string; 
            project?: string;
            module?: string;
        }) => t.id === (meeting.taskId || "")) || {
            projectid: "",
            moduleid: "",
            title: meeting.taskName,
            client: meeting.client,
            project: meeting.project,
            module: "Design"
        };

        // Create time entry response format
        const timeEntry: any = {  // Use any temporarily to avoid type errors
            id: meeting.meetingId || meetingId, // Use the Graph ID directly if available
            projectid: taskDetails.projectid || "",
            moduleid: taskDetails.moduleid || "",
            taskid: meeting.taskId || "",
            worktypeid: "803850",  // Default worktype ID for India-Meeting
            personid: email,
            date: new Date(meeting.startTime).toISOString().split('T')[0],
            datemodified: this.getISTFormattedDate(),
            time: Number((duration / 60).toFixed(2)), // Convert seconds to hours and ensure it's a number
            description: meeting.subject,
            billable: taskDetails.client?.toLowerCase() !== 'nathcorp' ? "t" : "f", // Set billable based on client
            created: this.getISTFormattedDate(),
            updated: this.getISTFormattedDate(),
            client: taskDetails.client || null,
            project: taskDetails.project || null,
            // Add these fields for UI display
            module: taskDetails.module || "Design", // Add module display name
            worktype: "India-Meeting"  // Add worktype display name
        };

        // Create raw response format
        const rawResponse = {
            personid: email,
            status: "Created",
            code: 201,
            time: { ...timeEntry }
        };

        // Add new meeting in AI agent format
        const postedMeeting: PostedMeeting = {
            meetingId: meeting.meetingId || meetingId, // Use the provided Microsoft Graph ID if available
            userId: email,
            timeEntry,
            rawResponse,
            postedAt: this.getISTFormattedDate(),
            taskName: taskDetails.title || meeting.taskName
        };

        // Check if meeting already exists - use the same ID as we used for the postedMeeting
        const existingIndex = this.data.meetings.findIndex(m => m.meetingId === (meeting.meetingId || meetingId));
        if (existingIndex >= 0) {
            this.data.meetings[existingIndex] = postedMeeting;
        } else {
            this.data.meetings.push(postedMeeting);
        }

        await this.saveData();
    }

    async getPostedMeetings(email: string): Promise<PostedMeeting[]> {
        await this.loadData();
        return this.data.meetings.filter(m => m.userId === email);
    }

    async isPosted(email: string, meetingId: string): Promise<boolean> {
        await this.loadData();
        return this.data.meetings.some(m => m.userId === email && m.meetingId === meetingId);
    }

    async clearUserMeetings(userEmail: string): Promise<void> {
        await this.loadData();
        this.data.meetings = this.data.meetings.filter(m => m.userId !== userEmail);
        await this.saveData();
    }
} 