import { promises as fs } from 'fs';
import path from 'path';
import { TimeEntryResponse } from '@/interfaces/time-entries';

interface PostedMeeting {
    meetingId: string;
    uniqueStorageId?: string;
    userId: string;
    timeEntry: TimeEntryResponse;
    rawResponse: any;
    postedAt: string;
    taskName?: string;
}

interface PostedMeetingsFile {
    meetings: PostedMeeting[];
}

export class AIAgentPostedMeetingsStorage {
    private storagePath: string;
    public data: PostedMeetingsFile = { meetings: [] };

    constructor() {
        this.storagePath = path.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json', 'ai-agent-meetings.json');
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.storagePath, 'utf-8');
            const parsedData = JSON.parse(data);

            // Clean up the data to only keep time entry format
            this.data = {
                meetings: parsedData.meetings
                    .filter((m: any) => m.meetingId && m.timeEntry) // Only keep entries with time entry info
                    .map((m: any) => ({
                        meetingId: m.meetingId || m.id, // Handle both old and new format
                        userId: m.userId,
                        timeEntry: m.timeEntry,
                        rawResponse: m.rawResponse,
                        postedAt: m.postedAt || new Date().toISOString(),
                        taskName: m.taskName // Preserve taskName if it exists
                    }))
            };

            // Save cleaned data back to file
            await this.saveData();
        } catch {
            // If file doesn't exist or can't be read, use empty data
            this.data = { meetings: [] };
        }
    }

    async saveData() {
        try {
            const dir = path.dirname(this.storagePath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving posted meetings data:', error);
            throw error;
        }
    }

    async addPostedMeeting(userId: string, postedMeeting: PostedMeeting) {
        await this.loadData();
        
        // Calculate timestamp for log messages
        const now = new Date().toISOString();
        
        // Ensure we're using the GraphID if it's available
        const isGraphIdFormat = typeof postedMeeting.meetingId === 'string' && 
                                postedMeeting.meetingId.startsWith('AAMkA') && 
                                postedMeeting.meetingId.includes('=');

        console.log(`[${now}] AIAgentPostedMeetingsStorage: Adding meeting with ID:`, postedMeeting.meetingId);
        console.log(`[${now}] Is ID in Graph format?`, isGraphIdFormat);
        console.log(`[${now}] Meeting time value:`, postedMeeting.timeEntry?.time, 'hours');
        console.log(`[${now}] Meeting worktypeid:`, postedMeeting.timeEntry?.worktypeid);
        
        // Create a unique storage ID that includes time and timestamp to ensure uniqueness
        // This ensures each instance of a recurring meeting gets its own unique entry
        const timeInHours = parseFloat(postedMeeting.timeEntry?.time?.toString() || '0');
        const durationInSeconds = Math.round(timeInHours * 3600);
        const uniqueStorageId = `${postedMeeting.meetingId}_${timeInHours}_${now}`;
        
        console.log(`[${now}] Generated unique storage ID: ${uniqueStorageId}`);
        console.log(`[${now}] Meeting duration: ${durationInSeconds}s (${timeInHours} hours)`);
        
        // Check if this EXACT entry already exists (shouldn't happen with the unique ID)
        const exactDuplicate = this.data.meetings.some(m => 
            m.meetingId === uniqueStorageId && 
            m.userId === userId && 
            m.timeEntry?.time === postedMeeting.timeEntry?.time
        );
        
        if (exactDuplicate) {
            console.log(`[${now}] Exact duplicate found, skipping storage`);
            return;
        }
        
        // Create a proper copy of the timeEntry object
        const timeEntryCopy = { ...postedMeeting.timeEntry };
        
        // Ensure default worktypeid value if missing
        if (!timeEntryCopy.worktypeid) {
            timeEntryCopy.worktypeid = "803850"; // Default worktype ID for India-Meeting
        }
        
        // Convert postedAt to IST time format
        const postedAtIST = this.getISTFormattedDate(postedMeeting.postedAt);
        
        // We're always adding as a new entry with the unique ID
        console.log(`[${now}] Adding new meeting instance with unique ID: ${uniqueStorageId}`);
        
        // Store both the original meetingId and our unique storage ID
        this.data.meetings.push({
            meetingId: postedMeeting.meetingId, // Original meetingId for reference/lookups
            uniqueStorageId, // Our unique storage ID
            userId: postedMeeting.userId,
            timeEntry: timeEntryCopy,
            rawResponse: postedMeeting.rawResponse,
            postedAt: postedAtIST,
            taskName: postedMeeting.taskName
        });

        await this.saveData();
    }

    // Helper method to get formatted IST date
    private getISTFormattedDate(dateStr?: string): string {
        // Always use current time to make sure we're displaying PM instead of AM
        const now = new Date();
        
        // Add 5.5 hours to convert from UTC to IST
        const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        
        // Format: YYYY-MM-DDTHH:MM:SS IST
        return istDate.toISOString().replace('Z', '') + ' IST';
    }

    async getPostedMeetings(userId: string): Promise<PostedMeeting[]> {
        await this.loadData();
        return this.data.meetings.filter(m => m.userId === userId);
    }

    async clearUserMeetings(userId: string) {
        await this.loadData();
        this.data.meetings = this.data.meetings.filter(m => m.userId !== userId);
        await this.saveData();
    }

    async isPosted(userId: string, meetingId: string, duration?: number): Promise<boolean> {
        await this.loadData();
        
        // If duration is provided, use it as part of the duplicate check
        if (duration !== undefined) {
            // Find meetings with the same ID and user
            const matchingMeetings = this.data.meetings.filter(m => 
                m.meetingId === meetingId && m.userId === userId
            );
            
            // If no matching meetings found, it's not a duplicate
            if (matchingMeetings.length === 0) {
                return false;
            }
            
            // For recurring meetings, check if there's a meeting with similar duration
            // Consider it a duplicate only if there's a meeting with similar duration (within 1 minute)
            for (const meeting of matchingMeetings) {
                // Convert timeEntry.time (hours) to seconds for comparison
                // Note: timeEntry.time could be a string like "0.05" or a number
                const timeInHours = parseFloat(meeting.timeEntry?.time?.toString() || '0');
                const storedDuration = Math.round(timeInHours * 3600); // Convert hours to seconds
                const durationDiff = Math.abs(storedDuration - duration);
                
                // If durations are similar (within 1 minute), consider it a duplicate
                if (durationDiff < 60) { // 1 minute = 60 seconds
                    console.log(`Found a potential duplicate meeting: ${meetingId} with similar duration (diff: ${durationDiff}s)`);
                    return true;
                }
            }
            
            console.log(`Meeting ${meetingId} has same ID but different duration, not considered a duplicate`);
            // If we have meetings with the same ID but different durations, it's not a duplicate
            return false;
        }
        
        // Original behavior if duration is not provided
        return this.data.meetings.some(m => m.meetingId === meetingId && m.userId === userId);
    }
} 