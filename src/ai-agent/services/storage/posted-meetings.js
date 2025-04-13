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
        
        // Log meeting information for debugging
        console.log('AIAgentPostedMeetingsStorage: Adding meeting with ID:', postedMeeting.meetingId);
        console.log('Meeting time value:', postedMeeting.timeEntry?.time, 'hours');
        
        // Calculate meeting duration in seconds (for debugging purposes)
        const timeInHours = parseFloat(postedMeeting.timeEntry?.time?.toString() || '0');
        const durationInSeconds = Math.round(timeInHours * 3600);
        console.log(`Meeting duration in seconds: ${durationInSeconds}s (${timeInHours} hours)`);
        
        // Find meetings with the same ID and user
        const matchingMeetings = this.data.meetings.filter(m => 
            m.meetingId === postedMeeting.meetingId && m.userId === userId
        );
        
        // Check if this exact meeting instance already exists
        let isDuplicate = false;
        for (const meeting of matchingMeetings) {
            // Compare time values to see if it's the same meeting instance
            const storedTimeInHours = parseFloat(meeting.timeEntry?.time?.toString() || '0');
            const storedDurationInSeconds = Math.round(storedTimeInHours * 3600);
            const durationDiff = Math.abs(storedDurationInSeconds - durationInSeconds);
            
            // If durations are similar (within 1 minute), it's the same meeting instance
            if (durationDiff < 60) {
                console.log(`Meeting instance already exists with similar duration (diff: ${durationDiff}s), skipping storage`);
                isDuplicate = true;
                break;
            }
        }
        
        // If it's a duplicate, don't add it again
        if (isDuplicate) {
            return;
        }
        
        console.log(`Adding new meeting instance with duration: ${durationInSeconds}s`);
        
        // Add new meeting
        this.data.meetings.push({
            meetingId: postedMeeting.meetingId,
            userId: postedMeeting.userId,
            timeEntry: postedMeeting.timeEntry,
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
