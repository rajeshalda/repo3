import { promises as fs } from 'fs';
import path from 'path';
import { TimeEntryResponse } from '@/interfaces/time-entries';

interface PostedMeeting {
    meetingId: string;
    userId: string;
    timeEntry: TimeEntryResponse;
    rawResponse: any;
    postedAt: string;
    taskName?: string;
    reportId?: string;
}

interface PostedMeetingsFile {
    meetings: PostedMeeting[];
}

// Simple mutex implementation for file operations
class FileMutex {
    private locks = new Map<string, Promise<void>>();

    async acquireLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
        // Wait for any existing operation on this file to complete
        if (this.locks.has(key)) {
            await this.locks.get(key);
        }

        // Create a new promise for this operation
        let resolve: () => void;
        const lockPromise = new Promise<void>((res) => {
            resolve = res;
        });
        
        this.locks.set(key, lockPromise);

        try {
            // Execute the operation
            const result = await operation();
            return result;
        } finally {
            // Release the lock
            resolve!();
            this.locks.delete(key);
        }
    }
}

const fileMutex = new FileMutex();

export class AIAgentPostedMeetingsStorage {
    private storagePath: string;
    public data: PostedMeetingsFile = { meetings: [] };

    constructor() {
        this.storagePath = path.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json', 'ai-agent-meetings.json');
    }

    async loadData() {
        return fileMutex.acquireLock(this.storagePath, async () => {
            try {
                const fileContent = await fs.readFile(this.storagePath, 'utf-8');
                const parsedData = JSON.parse(fileContent);

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
                            taskName: m.taskName, // Preserve taskName if it exists
                            reportId: m.reportId // Preserve reportId if it exists
                        }))
                };

                // Save cleaned data back to file
                await this.saveDataUnsafe();
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    console.log('Posted meetings file not found, creating new one');
                    this.data = { meetings: [] };
                    await this.saveDataUnsafe(); // Create initial file
                } else {
                    console.error('Error loading posted meetings data:', error);
                    // If JSON is corrupted, start fresh
                    this.data = { meetings: [] };
                    await this.saveDataUnsafe(); // Create a clean file
                }
            }
        });
    }

    // Unsafe version for internal use (already locked)
    private async saveDataUnsafe() {
        try {
            const dir = path.dirname(this.storagePath);
            await fs.mkdir(dir, { recursive: true });
            
            // Ensure clean JSON structure before writing
            const cleanData = {
                meetings: Array.isArray(this.data.meetings) ? this.data.meetings : []
            };
            
            await fs.writeFile(this.storagePath, JSON.stringify(cleanData, null, 2));
        } catch (error) {
            console.error('Error saving posted meetings data:', error);
            throw error;
        }
    }

    async saveData() {
        return fileMutex.acquireLock(this.storagePath, async () => {
            await this.saveDataUnsafe();
        });
    }

    async addPostedMeeting(userId: string, postedMeeting: PostedMeeting) {
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
        
        // IMPROVED DUPLICATE DETECTION - First check for any entry with same meetingId+date
        // This will prevent duplicates when a meeting has multiple attendance reports
        const meetingDate = postedMeeting.timeEntry?.date;
        const anyExistingMeeting = this.data.meetings.find(m => {
            // Check if it's the same meeting and user
            const sameMeeting = (m.meetingId === postedMeeting.meetingId && m.userId === userId);
            if (!sameMeeting) return false;
            
            // If dates are available, compare them
            if (m.timeEntry?.date && meetingDate) {
                return m.timeEntry.date === meetingDate;
            }
            
            // If we can't compare dates, consider it a match if meetingId and userId are the same
            return true;
        });
        
        if (anyExistingMeeting) {
            console.log(`
┌─────────────────────── DUPLICATE DETECTED ───────────────────────┐
│ ⚠️ Meeting already posted on ${anyExistingMeeting.timeEntry?.date || 'unknown date'}     │
│ 🆔 Meeting ID: ${postedMeeting.meetingId.substring(0, 15)}...    │
│ 📅 Date: ${meetingDate || 'unknown'}                            │
│ 👤 User: ${userId}                                              │
└───────────────────────────────────────────────────────────────────┘`);
            return;
        }
        
        // Keep the existing reportId check for backward compatibility
        if (postedMeeting.reportId) {
            const existingMeeting = this.data.meetings.find(m => 
                m.reportId === postedMeeting.reportId && 
                m.userId === userId
            );
            
            if (existingMeeting) {
                console.log(`[${now}] Duplicate found based on report ID: ${postedMeeting.reportId}, skipping storage`);
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

    async isPosted(userId: string, meetingId: string, duration: number = 0, dateTime: string = '', reportId?: string): Promise<boolean> {
        await this.loadData();
        
        if (!this.data.meetings.some(m => m.userId === userId)) {
            return false;
        }
        
        // Format the date from the meeting date string in YYY-MM-DD format
        const meetingDate = dateTime ? dateTime.split('T')[0] : '';
        
        console.log(`
┌─────────────────────────────────────────────────┐
│ 🔍 CHECKING IF MEETING IS POSTED                │
│ 🆔 Meeting ID: ${meetingId.substring(0, 15)}...           │
│ 📅 Date: ${meetingDate || 'N/A'}                         │
│ ⏱️ Duration: ${Math.floor(duration/60)}m ${duration%60}s                    │
${reportId ? `│ 📊 Report ID: ${reportId}              │` : ''}
└─────────────────────────────────────────────────┘`);

        // IMPROVED DUPLICATE DETECTION - First check for any entry with same meetingId+date
        if (meetingDate) {
            const anyExistingMeeting = this.data.meetings.find(m => 
                m.meetingId === meetingId && 
                m.userId === userId &&
                m.timeEntry?.date === meetingDate
            );
            
            if (anyExistingMeeting) {
                console.log(`
┌─────────────────────────────────────────────────┐
│ ✅ DUPLICATE DETECTED BY MEETING ID AND DATE     │
│ 🆔 Meeting ID: ${meetingId.substring(0, 15)}... │
│ 📅 Date: ${meetingDate}                         │
│ 👤 User ID: ${userId}                           │
└─────────────────────────────────────────────────┘`);
                
                console.log(`✓ MATCH FOUND (by Meeting ID and Date) - Meeting already posted on ${anyExistingMeeting.timeEntry?.date || 'unknown date'} with duration ${anyExistingMeeting.timeEntry?.time || 'unknown'} hours`);
                return true;
            }
        }
        
        // Then check using report ID if available
        if (reportId) {
            console.log(`
╔════════════════════════ REPORT ID DEDUPLICATION ═══════════════════════╗
║ 🧪 DEVELOPER CHECK: Using ONLY report ID for duplication detection     ║ 
║ 📊 Report ID: ${reportId}                                            ║
║ 👤 User ID: ${userId.substring(0, 15)}...                            ║
╚═══════════════════════════════════════════════════════════════════════╝`);
            
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
            }
            
            console.log('❌ No match found for report ID: ' + reportId);
            return false;
        }
        
        // Legacy fallback check - check if any meeting with this ID exists for the user (any date)
        // This is the most permissive check and should only be used as a last resort
        const anyMatch = this.data.meetings.find(meeting => 
            meeting.meetingId === meetingId && 
            meeting.userId === userId
        );
        
        if (anyMatch) {
            console.log(`
┌─────────────────────────────────────────────────┐
│ ✅ DUPLICATE DETECTED BY MEETING ID (ANY DATE)   │
│ 🆔 Meeting ID: ${meetingId.substring(0, 15)}... │
│ 👤 User ID: ${userId}                           │
└─────────────────────────────────────────────────┘`);
            
            console.log(`✓ MATCH FOUND (by Meeting ID) - Meeting already posted on ${anyMatch.timeEntry?.date || 'unknown date'} with duration ${anyMatch.timeEntry?.time || 'unknown'} hours`);
            return true;
        }
        
        console.log('❌ No match found for this meeting');
        return false;
    }

    // Method to update the reportId of an existing posted meeting
    async updatePostedMeetingReportId(userId: string, meetingId: string, reportId: string): Promise<boolean> {
        await this.loadData();
        
        // Find the meeting with the matching userId and meetingId
        const meetingIndex = this.data.meetings.findIndex(m => 
            m.userId === userId && m.meetingId === meetingId
        );
        
        if (meetingIndex === -1) {
            console.log(`[${new Date().toISOString()}] No meeting found with ID ${meetingId} for user ${userId}`);
            return false;
        }
        
        // Update the reportId
        this.data.meetings[meetingIndex].reportId = reportId;
        
        // Save the updated data
        await this.saveData();
        
        console.log(`
╔════════════════════════ REPORT ID UPDATED ═══════════════════════╗
║ ✅ Successfully updated meeting with report ID                    ║ 
║ 📊 Report ID: ${reportId}                                       ║
║ 🆔 Meeting ID: ${meetingId.substring(0, 20)}...                 ║
║ 👤 User ID: ${userId}                                           ║
╚═══════════════════════════════════════════════════════════════════╝`);
        
        return true;
    }
} 