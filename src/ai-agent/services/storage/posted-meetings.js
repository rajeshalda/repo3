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
                    postedAt: m.postedAt || new Date().toISOString(),
                    taskName: m.taskName, // Preserve taskName if it exists
                    reportId: m.reportId // Preserve reportId if it exists
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
        
        // Ensure we're using the GraphID if it's available
        const isGraphIdFormat = typeof postedMeeting.meetingId === 'string' && 
                                postedMeeting.meetingId.startsWith('AAMkA') && 
                                postedMeeting.meetingId.includes('=');

        console.log(`
╔════════════════════════ STORAGE OPERATION ════════════════════════╗
║ 💾 STORING POSTED MEETING                                         ║
║ 👤 User: ${userId}                                               ║
║ 🔑 Meeting ID: ${postedMeeting.meetingId.substring(0, 15)}...    ║
║ ⏱️ Duration: ${postedMeeting.timeEntry?.time || 0} hours         ║
║ 🏷️ Work Type: ${postedMeeting.timeEntry?.worktypeid || 'N/A'}   ║
${postedMeeting.reportId ? `║ 📊 Report ID: ${postedMeeting.reportId.substring(0, 15)}...   ║` : ''}
╚═══════════════════════════════════════════════════════════════════╝`);
        
        // Get time in hours for logging
        const timeInHours = parseFloat(postedMeeting.timeEntry?.time?.toString() || '0');
        const durationInSeconds = Math.round(timeInHours * 3600);
        
        console.log(`
┌─────────────────────── STORAGE DETAILS ───────────────────────┐
│ ⏱️ Duration: ${durationInSeconds}s (${timeInHours} hours)     │
${postedMeeting.reportId ? `│ 📊 Attendance Report ID: ${postedMeeting.reportId}     │` : ''}
└───────────────────────────────────────────────────────────────┘`);
        
        // Check if a meeting with this report ID already exists
        // Only apply this check if a reportId is available
        if (postedMeeting.reportId) {
            const existingMeeting = this.data.meetings.find(m => 
                m.reportId === postedMeeting.reportId && 
                m.userId === userId
            );
            
            if (existingMeeting) {
                console.log(`[${now}] Duplicate found based on report ID: ${postedMeeting.reportId}, skipping storage`);
                return;
            }
        } else {
            // If no reportId, fall back to checking meetingId, userId, and date
            const existingMeeting = this.data.meetings.find(m => {
                const sameBasicInfo = (
                    m.meetingId === postedMeeting.meetingId && 
                    m.userId === userId
                );
                
                // If basic info doesn't match, it's not a duplicate
                if (!sameBasicInfo) return false;
                
                // Check if the dates match (if date is available)
                if (m.timeEntry?.date && postedMeeting.timeEntry?.date) {
                    return m.timeEntry.date === postedMeeting.timeEntry.date;
                }
                
                // If we can't compare dates, consider it a duplicate if all other info matches
                return true;
            });
            
            if (existingMeeting) {
                console.log(`[${now}] Duplicate found based on meeting ID and date, skipping storage`);
                return;
            }
        }
        
        // Create a proper copy of the timeEntry object
        const timeEntryCopy = { ...postedMeeting.timeEntry };
        
        // Ensure default worktypeid value if missing
        if (!timeEntryCopy.worktypeid) {
            timeEntryCopy.worktypeid = "805564"; // Default worktype ID for India-Meeting
        }
        
        // Convert postedAt to IST time format
        const postedAtIST = this.getISTFormattedDate(postedMeeting.postedAt);
        
        console.log(`[${now}] Adding new meeting with ${postedMeeting.reportId ? `report ID: ${postedMeeting.reportId}` : `meeting ID: ${postedMeeting.meetingId}`}`);
        
        // Store both the original meetingId and report ID
        this.data.meetings.push({
            meetingId: postedMeeting.meetingId,
            userId: postedMeeting.userId,
            timeEntry: timeEntryCopy,
            rawResponse: postedMeeting.rawResponse,
            postedAt: postedAtIST,
            taskName: postedMeeting.taskName,
            reportId: postedMeeting.reportId
        });

        await this.saveData();
        
        // DEVELOPER CHECK - Log a more prominent marker for stored report ID
        if (postedMeeting.reportId) {
            console.log(`
╔════════════════════════ REPORT ID STORAGE ═══════════════════════╗
║ 🧪 DEVELOPER CHECK: Successfully stored meeting with report ID   ║ 
║ 📊 Report ID: ${postedMeeting.reportId}                        ║
║ 🆔 Meeting ID: ${postedMeeting.meetingId.substring(0, 20)}...  ║
╚═══════════════════════════════════════════════════════════════════╝`);
        }

        console.log(`
┌─────────────────────── STORAGE STATUS ───────────────────────┐
│ ✅ Meeting added to storage                                  │
│ 📊 Total meetings for user: ${this.data.meetings.length}     │
${postedMeeting.reportId ? `│ 📑 Report ID saved: ${postedMeeting.reportId}              │` : ''}
│ 💾 Storage data saved successfully                           │
└───────────────────────────────────────────────────────────────┘`);
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
    async isPosted(userId, meetingId, duration = 0, dateTime = '', reportId) {
        await this.loadData();
        
        if (!this.data.meetings.some(m => m.userId === userId)) {
            return false;
        }
        
        // Format the date from the meeting date string in YYY-MM-DD format
        const meetingDate = dateTime ? dateTime.split('T')[0] : '';
        
        // DEVELOPER CHECK - Log a more prominent marker when using report ID
        if (reportId) {
            console.log(`
╔════════════════════════ REPORT ID DEDUPLICATION ═══════════════════════╗
║ 🧪 DEVELOPER CHECK: Using ONLY report ID for duplication detection     ║ 
║ 📊 Report ID: ${reportId}                                            ║
║ 👤 User ID: ${userId.substring(0, 15)}...                            ║
╚═══════════════════════════════════════════════════════════════════════╝`);
        }
        
        console.log(`
┌─────────────────────────────────────────────────┐
│ 🔍 CHECKING IF MEETING IS POSTED                │
│ 🆔 Meeting ID: ${meetingId.substring(0, 15)}...           │
│ 📅 Date: ${meetingDate || 'N/A'}                         │
│ ⏱️ Duration: ${Math.floor(duration/60)}m ${duration%60}s                    │
${reportId ? `│ 📊 Report ID: ${reportId}              │` : ''}
└─────────────────────────────────────────────────┘`);
        
        // Only check using report ID - never fall back to old method
        if (reportId) {
            const reportMatch = this.data.meetings.find(meeting => 
                meeting.reportId === reportId && meeting.userId === userId
            );
            
            if (reportMatch) {
                console.log(`
┌─────────────────────────────────────────────────┐
│ ✅ DUPLICATE DETECTED BY REPORT ID               │
│ 📊 Report ID: ${reportId}                       │
│ 👤 User ID: ${userId}                           │
│ 📝 Matched meeting: ${reportMatch.meetingId}    │
└─────────────────────────────────────────────────┘`);
                
                console.log(`✓ MATCH FOUND (by Report ID) - Meeting already posted on ${reportMatch.timeEntry?.date || 'unknown date'} with duration ${reportMatch.timeEntry?.time || 'unknown'} hours`);
                if (reportMatch.taskName) {
                    console.log(`📋 Task: ${reportMatch.taskName}`);
                }
                return true;
            } else {
                console.log(`
┌─────────────────────────────────────────────────┐
│ ℹ️ REPORT ID CHECK RESULT                       │
│ 📊 Report ID: ${reportId}                       │
│ 🔍 Status: No matching report ID found          │
│ ✅ Conclusion: New meeting                      │
└─────────────────────────────────────────────────┘`);
            }
        } else {
            console.log(`
┌─────────────────────────────────────────────────┐
│ ⚠️ NO REPORT ID PROVIDED                        │
│ 🔍 Status: Cannot check for duplicates by report ID │
│ ✅ Conclusion: Treating as new meeting          │
└─────────────────────────────────────────────────┘`);
        }
        
        // No report ID match - consider it a new meeting
        // We no longer fall back to the old method
        console.log(`✅ Meeting not yet posted - can proceed with creating time entry`);
        return false;
    }
    // Helper method to get formatted IST date
    getISTFormattedDate(dateStr) {
        // Always use current time to make sure we're displaying PM instead of AM
        const now = new Date();
        
        // Add 5.5 hours to convert from UTC to IST
        const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        
        // Format: YYYY-MM-DDTHH:MM:SS IST
        return istDate.toISOString().replace('Z', '') + ' IST';
    }
}
exports.AIAgentPostedMeetingsStorage = AIAgentPostedMeetingsStorage;
