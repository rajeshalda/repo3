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
        
        const now = new Date().toISOString();
        
        console.log(`[${now}] AIAgentPostedMeetingsStorage: Adding meeting with ID:`, postedMeeting.meetingId);
        console.log(`[${now}] Meeting time value:`, postedMeeting.timeEntry?.time, 'hours');
        console.log(`[${now}] Meeting worktypeid:`, postedMeeting.timeEntry?.worktypeid);
        
        // Normalize the date to YYYY-MM-DD format
        const normalizeDate = (dateStr: string | undefined | null): string => {
            if (!dateStr) return '';
            try {
                return new Date(dateStr).toISOString().split('T')[0];
            } catch {
                return '';
            }
        };

        // Create a unique storage ID that includes more metadata
        const timeInHours = parseFloat(postedMeeting.timeEntry?.time?.toString() || '0');
        const durationInSeconds = Math.round(timeInHours * 3600);
        const worktypeid = postedMeeting.timeEntry?.worktypeid || '';
        const date = normalizeDate(postedMeeting.timeEntry?.date);
        const uniqueStorageId = `${postedMeeting.meetingId}_${timeInHours}_${date}_${worktypeid}`;
        
        console.log(`[${now}] Generated unique storage ID: ${uniqueStorageId}`);
        console.log(`[${now}] Meeting duration: ${durationInSeconds}s (${timeInHours} hours)`);
        console.log(`[${now}] Normalized date: ${date}`);
        
        // Enhanced duplicate detection with normalized dates
        const exactDuplicate = this.data.meetings.some(m => {
            // Basic info must match
            const sameBasicInfo = (
                m.meetingId === postedMeeting.meetingId && 
                m.userId === userId
            );
            
            if (!sameBasicInfo) return false;
            
            // Normalize stored meeting date for comparison
            const storedDate = normalizeDate(m.timeEntry?.date);
            const newDate = normalizeDate(postedMeeting.timeEntry?.date);
            
            // Time entry details must match with normalized date
            const sameTimeEntry = (
                m.timeEntry?.time === postedMeeting.timeEntry?.time &&
                storedDate === newDate
            );
            
            // If basic info and time entry match, check if it's the same type of meeting
            // or if one entry is missing worktype (for backward compatibility)
            if (sameTimeEntry) {
                const storedWorkType = m.timeEntry?.worktypeid;
                const newWorkType = postedMeeting.timeEntry?.worktypeid;
                
                // If either entry is missing worktype, consider it a match
                if (!storedWorkType || !newWorkType) {
                    console.log(`[${now}] Found duplicate with missing worktype`);
                    return true;
                }
                
                // Check if worktypes are the same
                const sameWorkType = storedWorkType === newWorkType;
                if (sameWorkType) {
                    console.log(`[${now}] Found exact duplicate with matching worktype`);
                    return true;
                }
                
                // If worktypes are different but one is US-Meeting and other is India-Meeting,
                // consider it a duplicate to prevent double posting
                const isUsMeeting = (id: string) => id === "803851";
                const isIndiaMeeting = (id: string) => id === "803850";
                
                if ((isUsMeeting(storedWorkType) && isIndiaMeeting(newWorkType)) ||
                    (isIndiaMeeting(storedWorkType) && isUsMeeting(newWorkType))) {
                    console.log(`[${now}] Found duplicate with different meeting types (US/India)`);
                    return true;
                }
            }
            
            return false;
        });
        
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

    async isPosted(userId: string, meetingId: string, duration?: number, startTime?: string): Promise<boolean> {
        await this.loadData();
        
        // If we have duration and startTime, use them to check for specific recurring meeting instances
        if (duration !== undefined) {
            // Find meetings with the same ID and user
            const matchingMeetings = this.data.meetings.filter(m => 
                m.meetingId === meetingId && m.userId === userId
            );

            // For name-based matching, also check if the description matches the meetingId
            // This helps catch manually posted meetings with the same name as AI agent posts
            const descriptionMatches = this.data.meetings.filter(m => 
                m.userId === userId && 
                m.timeEntry?.description?.toLowerCase() === meetingId.toLowerCase()
            );
            
            // Combine both sets of matches without duplicates
            const combinedMatches = [...matchingMeetings];
            for (const match of descriptionMatches) {
                if (!matchingMeetings.some(m => m.meetingId === match.meetingId)) {
                    combinedMatches.push(match);
                }
            }
            
            // If no matching meetings found at all, it's not a duplicate
            if (combinedMatches.length === 0) {
                return false;
            }
            
            // For recurring meetings, check if there's a meeting with similar duration
            // Consider it a duplicate only if there's a meeting with similar duration and on the same day (if startTime provided)
            for (const meeting of combinedMatches) {
                // Convert timeEntry.time (hours) to seconds for comparison
                const timeInHours = parseFloat(meeting.timeEntry?.time?.toString() || '0');
                const storedDuration = Math.round(timeInHours * 3600); // Convert hours to seconds
                const durationDiff = Math.abs(storedDuration - duration);
                
                // If startTime is provided, also check the date
                if (startTime) {
                    const requestDate = new Date(startTime).toISOString().split('T')[0]; // Get YYYY-MM-DD
                    const storedDate = meeting.timeEntry?.date;
                    
                    // If dates don't match, this instance is not a duplicate
                    if (storedDate !== requestDate) {
                        continue;
                    }
                }
                
                // If durations are similar (within 1 minute), consider it a duplicate
                if (durationDiff < 60) { // 1 minute = 60 seconds
                    console.log(`Found a potential duplicate meeting: ${meetingId} with similar duration (diff: ${durationDiff}s)`);
                    return true;
                }
            }
            
            console.log(`Meeting ${meetingId} has same ID but different duration/date, not considered a duplicate`);
            // If we have meetings with the same ID but different durations or dates, it's not a duplicate
            return false;
        }
        
        // Original behavior if duration is not provided - check for same ID and user
        return this.data.meetings.some(m => 
            (m.meetingId === meetingId || m.timeEntry?.description?.toLowerCase() === meetingId.toLowerCase()) && 
            m.userId === userId
        );
    }
} 