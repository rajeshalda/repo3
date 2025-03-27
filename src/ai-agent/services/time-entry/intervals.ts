import { Person, TimeEntry, TimeEntryResponse, WorkType, ProjectWorkType } from '../../../interfaces/time-entries';
import { ProcessedMeeting } from '../../../interfaces/meetings';
import { Task } from '../task/intervals';
import fs from 'fs/promises';
import path from 'path';
import { AIAgentPostedMeetingsStorage } from '../storage/posted-meetings';
import { TimeEntryResponse as NewTimeEntryResponse } from '@/interfaces/time-entries';

interface UserData {
    userId: string;
    email: string;
    intervalsApiKey: string;
    lastSync: string;
}

interface UserDataFile {
    users: UserData[];
    postedMeetings: string[];
}

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

// Custom response type for error cases
interface TimeEntryErrorResponse {
    success: false;
    error: string;
    meetingId: string;
}

export class IntervalsTimeEntryService {
    private static instance: IntervalsTimeEntryService;

    private constructor() {}

    public static getInstance(): IntervalsTimeEntryService {
        if (!IntervalsTimeEntryService.instance) {
            IntervalsTimeEntryService.instance = new IntervalsTimeEntryService();
        }
        return IntervalsTimeEntryService.instance;
    }

    private async makeRequest(endpoint: string, options: RequestInit = {}, userId: string) {
        const headers = {
            'Content-Type': 'application/json',
            'x-user-id': userId
        };

        // Use an absolute URL format that works in both browser and Node.js environments
        const apiUrl = typeof window !== 'undefined' 
            ? window.location.origin 
            : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
            
        const response = await fetch(`${apiUrl}/api/intervals-proxy`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                endpoint,
                method: options.method || 'GET',
                data: options.body ? JSON.parse(options.body as string) : null
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to make request: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    private async getPersonInfo(userId: string): Promise<Person> {
        try {
            const data = await this.makeRequest('/me/', {}, userId);
            
            if (!data.personid) {
                throw new Error('Person ID not found in response');
            }

            return {
                id: data.personid,
                firstname: data.firstname || '',
                lastname: data.lastname || '',
                email: data.email || ''
            };
        } catch (error) {
            console.error('Error fetching person info:', error);
            throw error;
        }
    }

    private async getTaskDetails(taskId: string, userId: string): Promise<Task> {
        try {
            const data = await this.makeRequest(`/task/${taskId}`, {}, userId);

            if (!data.task || data.status !== 'OK') {
                throw new Error('Invalid task response format or task not found');
            }

            const taskData = data.task;
            return {
                id: taskData.id,
                title: taskData.title || '',
                description: taskData.summary || '',
                projectid: taskData.projectid,
                project: taskData.project || '',
                status: taskData.status || '',
                priority: taskData.priority || '',
                clientid: taskData.clientid || '',
                client: taskData.client || '',
                moduleid: taskData.moduleid || '',
                module: taskData.module || ''
            };
        } catch (error) {
            console.error('Error fetching task details:', error);
            throw error;
        }
    }

    private async getProjectWorkTypes(projectId: string, userId: string): Promise<WorkType[]> {
        try {
            const data = await this.makeRequest('/projectworktype/', {}, userId);

            if (!data.projectworktype || !Array.isArray(data.projectworktype)) {
                throw new Error('Invalid work types response format');
            }

            // Filter work types for the specific project and map with correct IDs
            const projectWorkTypes = data.projectworktype
                .filter((wt: ProjectWorkType) => wt.projectid === projectId && wt.active === 't')
                .map((wt: ProjectWorkType) => ({
                    id: wt.worktypeid,
                    name: wt.worktype,
                    projectId: wt.projectid,
                    workTypeId: wt.worktypeid,
                    projectWorkTypeId: wt.id
                }));

            console.log(`Found ${projectWorkTypes.length} work types for project ${projectId}:`, projectWorkTypes);
            return projectWorkTypes;
        } catch (error) {
            console.error('Error fetching project work types:', error);
            throw error;
        }
    }

    private convertSecondsToDecimalHours(seconds: number): number {
        // Convert seconds to decimal hours with 2 decimal places
        // Formula: seconds / (60 * 60) = hours
        return Number((seconds / 3600).toFixed(2));
    }

    private formatDate(dateString: string): string {
        // Convert ISO date string to YYYY-MM-DD format
        return dateString.split('T')[0];
    }

    private async savePostedMeeting(meeting: ProcessedMeeting, timeEntry: TimeEntryResponse, rawResponse: any, userId: string, taskName: string): Promise<void> {
        try {
            console.log('Saving posted meeting with time entry...');
            
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.loadData();

            // Only save the meeting in the time entry format
            const postedMeeting = {
                meetingId: meeting.id,
                userId: userId,
                timeEntry: timeEntry,
                rawResponse: rawResponse,
                postedAt: new Date().toISOString(),
                taskName: taskName
            };

            await storage.addPostedMeeting(userId, postedMeeting);
            
            console.log('Successfully saved posted meeting with time entry');
        } catch (error) {
            console.error('Error saving posted meeting:', error);
            throw new Error('Failed to save posted meeting data');
        }
    }

    public async createTimeEntry(
        meeting: ProcessedMeeting,
        task: { taskId: string; taskTitle: string },
        userId: string
    ): Promise<TimeEntryResponse | TimeEntryErrorResponse> {
        try {
            // Get person info and task details
            const [person, taskDetails] = await Promise.all([
                this.getPersonInfo(userId),
                this.getTaskDetails(task.taskId, userId)
            ]);

            console.log('Person info:', { id: person.id, email: person.email });
            console.log('Task details:', {
                id: taskDetails.id,
                projectid: taskDetails.projectid,
                moduleid: taskDetails.moduleid,
                assignees: taskDetails.assigneeid
            });

            if (!taskDetails.projectid || !taskDetails.moduleid) {
                throw new Error('Task is missing required project ID or module ID');
            }

            // Get work types for the project
            const workTypes = await this.getProjectWorkTypes(taskDetails.projectid, userId);
            
            // TEMPORARY FIX: Use hardcoded worktype ID for India-Meeting
            console.log('Using hardcoded worktype ID 802279 for India-Meeting');
            const worktypeId = '802279';

            // Find the current user's attendance record
            let userDuration = 0;
            if (meeting.attendance?.records) {
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord) {
                    userDuration = userRecord.duration;
                    console.log(`Found user's attendance record with duration: ${userDuration} seconds`);
                } else {
                    console.log(`User ${userId} did not attend meeting "${meeting.subject}"`);
                    return {
                        success: false,
                        error: `User ${userId} did not attend this meeting. No attendance record found.`,
                        meetingId: meeting.id
                    };
                }
            } else {
                console.log(`No attendance records found for meeting "${meeting.subject}"`);
            }

            // Calculate time in decimal hours from user's attendance record
            const timeInHours = this.convertSecondsToDecimalHours(userDuration);

            if (timeInHours <= 0) {
                console.log(`User ${userId} has zero duration for meeting "${meeting.subject}". Skipping time entry creation.`);
                return {
                    success: false,
                    error: `User ${userId} has zero duration for this meeting. The meeting may not have been attended.`,
                    meetingId: meeting.id
                };
            }

            // Prepare time entry data
            const timeEntry: TimeEntry = {
                projectid: taskDetails.projectid,
                moduleid: taskDetails.moduleid,
                taskid: taskDetails.id,
                worktypeid: worktypeId,
                personid: person.id,
                date: this.formatDate(meeting.start.dateTime),
                time: timeInHours,
                description: meeting.subject,
                billable: true
            };

            console.log('Creating time entry with data:', JSON.stringify(timeEntry, null, 2));

            // Create time entry using proxy
            const rawResponse = await this.makeRequest('/time', {
                method: 'POST',
                body: JSON.stringify(timeEntry)
            }, userId);

            console.log('Time entry creation successful. Response:', JSON.stringify(rawResponse, null, 2));

            // Parse as TimeEntryResponse
            const timeEntryResponse = rawResponse.time as TimeEntryResponse;

            // Save to posted-meetings.json
            await this.savePostedMeeting(meeting, timeEntryResponse, rawResponse, userId, task.taskTitle);

            return timeEntryResponse;
        } catch (error) {
            console.error('Error creating time entry:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                meetingId: meeting.id
            };
        }
    }
}

export const timeEntryService = IntervalsTimeEntryService.getInstance(); 