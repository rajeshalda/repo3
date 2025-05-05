"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAgentPostedMeetingsStorage = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class AIAgentPostedMeetingsStorage {
    constructor() {
        this.data = { meetings: [] };
        this.storagePath = path_1.default.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json', 'ai-agent-meetings.json');
    }
    async loadData() {
        try {
            const data = await fs_1.promises.readFile(this.storagePath, 'utf-8');
            const parsedData = JSON.parse(data);
            // Clean up the data to only keep time entry format
            this.data = {
                meetings: parsedData.meetings
                    .filter((m) => m.meetingId && m.timeEntry) // Only keep entries with time entry info
                    .map((m) => ({
                    meetingId: m.meetingId || m.id, // Handle both old and new format
                    userId: m.userId,
                    timeEntry: m.timeEntry,
                    rawResponse: m.rawResponse,
                    postedAt: m.postedAt || new Date().toISOString()
                }))
            };
            // Save cleaned data back to file
            await this.saveData();
        }
        catch (_a) {
            // If file doesn't exist or can't be read, use empty data
            this.data = { meetings: [] };
        }
    }
    async saveData() {
        try {
            const dir = path_1.default.dirname(this.storagePath);
            await fs_1.promises.mkdir(dir, { recursive: true });
            await fs_1.promises.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
        }
        catch (error) {
            console.error('Error saving posted meetings data:', error);
            throw error;
        }
    }
    async addPostedMeeting(userId, postedMeeting) {
        await this.loadData();
        
        // Calculate timestamp for log messages
        const now = new Date().toISOString();
        
        // Log meeting information for debugging
        console.log(`[${now}] AIAgentPostedMeetingsStorage: Adding meeting with ID:`, postedMeeting.meetingId);
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
            timeEntryCopy.worktypeid = "804786"; // Default worktype ID for India-Meeting
        }
        
        // We're always adding as a new entry with the unique ID
        console.log(`[${now}] Adding new meeting instance with unique ID: ${uniqueStorageId}`);
        
        // Store both the original meetingId and our unique storage ID
        this.data.meetings.push({
            meetingId: postedMeeting.meetingId, // Original meetingId for reference/lookups
            uniqueStorageId, // Our unique storage ID
            userId: postedMeeting.userId,
            timeEntry: timeEntryCopy,
            rawResponse: postedMeeting.rawResponse,
            postedAt: postedMeeting.postedAt
        });
        
        await this.saveData();
    }
    async getPostedMeetings(userId) {
        await this.loadData();
        return this.data.meetings.filter(m => m.userId === userId);
    }
    async clearUserMeetings(userId) {
        await this.loadData();
        this.data.meetings = this.data.meetings.filter(m => m.userId !== userId);
        await this.saveData();
    }
    async isPosted(userId, meetingId, duration) {
        await this.loadData();
        
        // For backward compatibility, first check if this exact meetingId exists
        const hasExactMatch = this.data.meetings.some(m => 
            m.meetingId === meetingId && m.userId === userId
        );
        
        // If we found an exact match and no duration is specified, return true
        if (hasExactMatch && duration === undefined) {
            return true;
        }
        
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
exports.AIAgentPostedMeetingsStorage = AIAgentPostedMeetingsStorage;
