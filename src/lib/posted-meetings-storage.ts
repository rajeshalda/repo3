import { promises as fs } from 'fs';
import path from 'path';

interface Meeting {
    subject: string;
    startTime: string;
    taskId?: string;
    taskName?: string;
}

interface AttendanceRecord {
    email: string;
    name: string;
    duration: number;
}

interface UserMeetings {
    meetings: PostedMeeting[];
    lastPostedDate: string;
}

interface PostedMeetingsData {
    [email: string]: UserMeetings;
}

interface PostedMeeting {
    id: string;
    subject: string;
    meetingDate: string;
    postedDate: string;
    taskId?: string;
    taskName?: string;
    duration: number;
}

export class PostedMeetingsStorage {
    private storagePath: string;
    private data: PostedMeetingsData = {};

    constructor() {
        this.storagePath = path.join(process.cwd(), 'storage', 'posted-meetings.json');
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.storagePath, 'utf-8');
            this.data = JSON.parse(data);
        } catch {
            // If file doesn't exist or can't be read, use empty data
            this.data = {};
        }
    }

    async saveData() {
        await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
    }

    async addPostedMeeting(email: string, meeting: Meeting, attendanceRecords: AttendanceRecord[]) {
        await this.loadData();
        console.log('Adding posted meeting:', {
            email,
            meeting,
            attendanceRecords
        });

        const meetingId = `${email.toLowerCase()}_${meeting.subject}_${meeting.startTime}`;

        if (!this.data[email]) {
            this.data[email] = {
                meetings: [],
                lastPostedDate: this.getISTFormattedDate()  // Initialize with current date
            };
        }

        // Find user's attendance record to get duration
        const userAttendance = attendanceRecords.find(record => record.email === email);
        const duration = userAttendance ? userAttendance.duration : 0;

        // Add new meeting
        this.data[email].meetings.push({
            id: meetingId,
            subject: meeting.subject,
            meetingDate: meeting.startTime,
            postedDate: this.getISTFormattedDate(),
            taskId: meeting.taskId,
            taskName: meeting.taskName,
            duration: duration  // Add duration field
        });

        // Update last posted date
        this.data[email].lastPostedDate = this.getISTFormattedDate();

        await this.saveData();
        console.log('Successfully added meeting');
        console.log('===========================\n');
    }

    // Helper method to get formatted IST date
    private getISTFormattedDate(): string {
        // Create a timestamp in IST timezone (UTC+05:30)
        const now = new Date();
        const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        
        // Format: YYYY-MM-DDTHH:MM:SS IST
        return istDate.toISOString().replace('Z', '') + ' IST';
    }

    async getPostedMeetings(email: string): Promise<PostedMeeting[]> {
        await this.loadData();
        console.log('Getting posted meetings:', {
            email,
            hasData: !!this.data[email],
            totalMeetings: this.data[email]?.meetings?.length || 0
        });
        
        if (!this.data[email]?.meetings) {
            return [];
        }

        // Sort meetings by posted date, most recent first
        return [...this.data[email].meetings].sort(
            (a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()
        );
    }

    async getLastPostedDate(email: string): Promise<string | null> {
        await this.loadData();
        return this.data[email]?.lastPostedDate || null;
    }

    async isPosted(email: string, meetingId: string): Promise<boolean> {
        await this.loadData();
        
        console.log('\n=== POSTED MEETING CHECK ===');
        console.log('Looking for meeting:', meetingId);
        
        if (!this.data[email]?.meetings) {
            console.log('No stored meetings found for user');
            console.log('=========================\n');
            return false;
        }

        // Direct ID comparison since IDs are now normalized consistently
        const isPosted = this.data[email].meetings.some(m => m.id === meetingId);

        console.log('Comparing IDs:', {
            lookingFor: meetingId,
            found: isPosted
        });
        console.log('=========================\n');
        
        return isPosted;
    }

    async filterPostedMeetings(email: string, meetingIds: string[]): Promise<string[]> {
        await this.loadData();
        const postedIds = new Set(this.data[email]?.meetings.map(m => m.id) || []);
        return meetingIds.filter(id => !postedIds.has(id));
    }

    async clearUserMeetings(userEmail: string): Promise<void> {
        await this.loadData();
        this.data[userEmail] = {
            meetings: [],
            lastPostedDate: this.getISTFormattedDate()
        };
        await this.saveData();
    }
} 