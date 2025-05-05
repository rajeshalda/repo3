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
    uniqueStorageId?: string;
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
            worktypeid: "804786",  // Default worktype ID for India-Meeting
            personid: email,
            date: new Date(meeting.startTime).toISOString().split('T')[0],
            datemodified: this.getISTFormattedDate(),
            time: (duration / 3600).toFixed(2), // Convert seconds to hours but keep as string
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

        // Generate unique timestamp for this meeting instance to differentiate recurring entries
        const now = new Date().toISOString();
        const timeInHours = parseFloat((duration / 3600).toFixed(2));
        
        // Add new meeting in AI agent format
        const postedMeeting: PostedMeeting = {
            meetingId: meetingId, // Store original meetingId for reference
            uniqueStorageId: `${meetingId}_${timeInHours}_${now}`, // Create a unique ID for this instance
            userId: email,
            timeEntry,
            rawResponse,
            postedAt: this.getISTFormattedDate(),
            taskName: taskDetails.title || meeting.taskName
        };

        // Always add as a new entry instead of replacing existing ones with the same meetingId
        this.data.meetings.push(postedMeeting);

        await this.saveData();
    }

    async getPostedMeetings(email: string): Promise<PostedMeeting[]> {
        await this.loadData();
        return this.data.meetings.filter(m => m.userId === email);
    }

    async isPosted(email: string, meetingId: string, duration?: number, startTime?: string): Promise<boolean> {
        await this.loadData();
        
        // If we have duration and startTime, use them to check for specific recurring meeting instances
        if (duration !== undefined && startTime) {
            const date = new Date(startTime).toISOString().split('T')[0]; // Get YYYY-MM-DD
            const timeInHours = (duration / 3600).toFixed(2); // Convert seconds to hours
            
            // Check if there's a matching meeting with the same ID, user, date and similar duration
            return this.data.meetings.some(m => {
                if (m.userId !== email || m.meetingId !== meetingId) {
                    return false;
                }
                
                // Get the date from the entry's timeEntry
                const entryDate = m.timeEntry?.date;
                
                // If dates don't match (not the same day), it's a different instance
                if (entryDate !== date) {
                    return false;
                }
                
                // Check if durations are similar (within 1 minute tolerance)
                const entryTimeHours = parseFloat(m.timeEntry?.time?.toString() || '0');
                const entryDuration = Math.round(entryTimeHours * 3600); // Convert hours to seconds
                const targetDuration = duration;
                const durationDiff = Math.abs(entryDuration - targetDuration);
                
                // Consider it a match if duration is within 1 minute
                return durationDiff < 60;
            });
        }
        
        // If no duration/date info provided, fall back to the original behavior
        // but still avoid counting recurring meetings as posted
        if (startTime) {
            const date = new Date(startTime).toISOString().split('T')[0]; // Get YYYY-MM-DD
            return this.data.meetings.some(m => 
                m.userId === email && 
                m.meetingId === meetingId && 
                m.timeEntry?.date === date
            );
        }
        
        // Most basic check - just ID and user (not recommended for recurring meetings)
        return this.data.meetings.some(m => m.userId === email && m.meetingId === meetingId);
    }

    async clearUserMeetings(userEmail: string): Promise<void> {
        await this.loadData();
        this.data.meetings = this.data.meetings.filter(m => m.userId !== userEmail);
        await this.saveData();
    }
} 