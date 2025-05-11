import { Person, TimeEntry, TimeEntryResponse, WorkType, ProjectWorkType } from '../../../interfaces/time-entries';
import { ProcessedMeeting } from '../../../interfaces/meetings';
import { Task } from '../task/intervals';
import fs from 'fs/promises';
import path from 'path';
import { AIAgentPostedMeetingsStorage } from '../storage/posted-meetings';
import { TimeEntryResponse as NewTimeEntryResponse } from '@/interfaces/time-entries';
import { DateTime } from 'luxon';

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
            
        try {
            const response = await fetch(`${apiUrl}/api/intervals-proxy`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    endpoint,
                    method: options.method || 'GET',
                    data: options.body ? JSON.parse(options.body as string) : null
                })
            });

            const responseText = await response.text();
            let responseData;
            
            try {
                responseData = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse response as JSON:', responseText);
                throw new Error(`Invalid JSON response: ${responseText}`);
            }

            if (!response.ok) {
                console.error(`API Error (${response.status}):`, responseData);
                if (responseData && responseData.error) {
                    // If error is an object, stringify it for better error messages
                    const errorMessage = typeof responseData.error === 'object' 
                        ? JSON.stringify(responseData.error)
                        : responseData.error.toString();
                    throw new Error(`API Error: ${errorMessage}`);
                }
                throw new Error(`Failed to make request: ${response.status} ${response.statusText}`);
            }

            return responseData;
        } catch (error) {
            console.error(`Error in makeRequest to ${endpoint}:`, error);
            throw error;
        }
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
            
            // Create a proper task object with all necessary fields
            const task: Task = {
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
                module: taskData.module || '',
                assigneeid: taskData.assigneeid || ''
            };
            
            // Log task detail information for debugging
            console.log('Retrieved task details:', {
                id: task.id,
                title: task.title,
                status: task.status,
                client: task.client,
                assigneeid: task.assigneeid
            });
            
            return task;
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
        // Convert the date to IST timezone (UTC+05:30) before formatting
        const date = new Date(dateString);
        
        // Add 5 hours and 30 minutes to convert to IST
        const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
        
        // Convert ISO date string to YYYY-MM-DD format in IST timezone
        return istDate.toISOString().split('T')[0];
    }

    private async savePostedMeeting(meeting: ProcessedMeeting, timeEntry: TimeEntryResponse, rawResponse: any, userId: string, taskName: string): Promise<void> {
        try {
            console.log('Saving posted meeting with time entry...');
            
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.loadData();

            // Create a timestamp in IST timezone (UTC+05:30)
            const now = new Date();
            const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
            
            // Format the date properly to remove UTC marker 'Z' and explicitly mark as IST
            // Format: YYYY-MM-DDTHH:MM:SS IST
            const istTimestamp = istDate.toISOString().replace('Z', '') + ' IST';
            
            console.log('Posted timestamp:', {
                utc: now.toISOString(),
                ist: istTimestamp
            });

            // Add taskTitle to the timeEntry object
            if (timeEntry) {
                timeEntry.taskTitle = taskName;
            }

            // Only save the meeting in the time entry format
            const postedMeeting = {
                meetingId: meeting.id,
                userId: userId,
                timeEntry: timeEntry,
                rawResponse: rawResponse,
                postedAt: istTimestamp, // Use explicitly formatted IST timestamp
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
            console.log(`
╔════════════════════════════════════════════════════════╗
║ 🚀 TIME ENTRY CREATION STARTED                         
║ 📝 Meeting: ${meeting.subject?.substring(0, 30)}${meeting.subject && meeting.subject.length > 30 ? '...' : ''} 
║ 🔄 Task: ${task.taskTitle?.substring(0, 30)}${task.taskTitle && task.taskTitle.length > 30 ? '...' : ''}
╚════════════════════════════════════════════════════════╝`);

            // Get person info and task details
            console.log(`⏳ Fetching person & task information...`);
            const [person, taskDetails] = await Promise.all([
                this.getPersonInfo(userId),
                this.getTaskDetails(task.taskId, userId)
            ]);

            console.log(`
┌─────────────────────────────────────────────────┐
│ ✓ USER & TASK INFO RETRIEVED                    │
│ 👤 User: ${person.email}                         │
│ 📋 Task: #${taskDetails.id} - ${taskDetails.title?.substring(0, 25)}${taskDetails.title && taskDetails.title.length > 25 ? '...' : ''} │
│ 🏢 Client: ${taskDetails.client || 'N/A'} | Project: ${taskDetails.project || 'N/A'} │
└─────────────────────────────────────────────────┘`);

            // Verify all required fields are present
            if (!taskDetails.projectid) {
                console.error(`❌ ERROR: Task #${taskDetails.id} is missing projectid`);
                return {
                    success: false,
                    error: 'Task is missing required project ID',
                    meetingId: meeting.id
                };
            }
            
            if (!taskDetails.moduleid) {
                console.error(`❌ ERROR: Task #${taskDetails.id} is missing moduleid`);
                return {
                    success: false,
                    error: 'Task is missing required module ID',
                    meetingId: meeting.id
                };
            }

            // Check if task is closed
            if (taskDetails.status === 'Closed') {
                console.log(`⚠️ WARNING: Task #${taskDetails.id} is closed. Cannot create time entry.`);
                return {
                    success: false,
                    error: `The selected task "${taskDetails.title}" is closed. Please select an open task.`,
                    meetingId: meeting.id
                };
            }

            // Get work types for the project
            console.log(`⏳ Fetching work types for project ${taskDetails.projectid}...`);
            const workTypes = await this.getProjectWorkTypes(taskDetails.projectid, userId);
            
            // TEMPORARY FIX: Use hardcoded worktype ID for India-Meeting
            console.log(`ℹ️ Using worktype ID 804786 for India-Meeting`);
            const worktypeId = '804786';

            // Find the current user's attendance record
            let userDuration = 0;
            if (meeting.attendance?.records) {
                console.log(`🔍 Checking attendance records for user ${userId}...`);
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord) {
                    userDuration = userRecord.duration;
                    console.log(`✅ Found user's attendance record with duration: ${Math.floor(userDuration/60)}m ${userDuration%60}s`);
                } else {
                    console.log(`❌ User ${userId} did not attend meeting "${meeting.subject}"`);
                    return {
                        success: false,
                        error: `User ${userId} did not attend this meeting. No attendance record found.`,
                        meetingId: meeting.id
                    };
                }
            } else {
                console.log(`⚠️ No attendance records found for meeting "${meeting.subject}"`);
            }

            // Calculate time in decimal hours from user's attendance record
            const timeInHours = this.convertSecondsToDecimalHours(userDuration);

            if (timeInHours <= 0) {
                console.log(`⚠️ User ${userId} has zero duration for meeting "${meeting.subject}". Skipping time entry creation.`);
                return {
                    success: false,
                    error: `User ${userId} has zero duration for this meeting. The meeting may not have been attended.`,
                    meetingId: meeting.id
                };
            }

            // Determine if the time entry should be billable based on client
            // If client is Nathcorp or Internal, it's non-billable; otherwise, it's billable
            const isNonBillableClient = taskDetails.client?.toLowerCase() === 'nathcorp' || 
                                      taskDetails.client?.toLowerCase() === 'internal';
            const isBillable = !isNonBillableClient;
            console.log(`💰 Billable status: ${isBillable ? 'YES ✓' : 'NO ✗'} (Client: ${taskDetails.client})`);

            // Prepare time entry data
            const timeEntry: TimeEntry = {
                projectid: taskDetails.projectid,
                moduleid: taskDetails.moduleid,
                taskid: taskDetails.id,
                worktypeid: worktypeId,
                personid: person.id,
                date: DateTime.fromISO(meeting.attendance?.records[0]?.attendanceIntervals[0]?.joinDateTime || '')
                    .toUTC()
                    .toFormat('yyyy-MM-dd'), // Use UTC date instead of IST
                time: timeInHours,
                description: meeting.subject,
                billable: isBillable ? 't' : 'f'
            };

            // Add debug log to show date conversion
            console.log(`
┌─────────────────────────────────────────────────┐
│ 📊 TIME ENTRY DETAILS                           │
│ 📆 Date: ${timeEntry.date} (from UTC ${meeting.start.dateTime.split('T')[0]})  │
│ ⏱️ Duration: ${timeInHours} hours (${Math.floor(userDuration/60)}m ${userDuration%60}s)  │
│ 💰 Billable: ${isBillable ? 'Yes' : 'No'}                              │
└─────────────────────────────────────────────────┘`);

            console.log(`📡 Sending time entry request to Intervals API...`);

            try {
                // Create time entry using proxy
                const rawResponse = await this.makeRequest('/time', {
                    method: 'POST',
                    body: JSON.stringify(timeEntry)
                }, userId);

                console.log(`✅ Time entry creation successful!`);

                // Parse as TimeEntryResponse
                const timeEntryResponse = rawResponse.time as TimeEntryResponse;

                // Add client and project information to the response
                const enhancedTimeEntryResponse = {
                    ...timeEntryResponse,
                    client: taskDetails.client || undefined,
                    project: taskDetails.project || undefined,
                    module: taskDetails.module || undefined,
                    taskTitle: task.taskTitle || taskDetails.title || undefined
                } as TimeEntryResponse;

                console.log(`📝 Time entry created with ID: ${enhancedTimeEntryResponse.id}`);

                // Save to posted-meetings.json
                console.log(`💾 Saving meeting details to storage...`);
                await this.savePostedMeeting(meeting, enhancedTimeEntryResponse, rawResponse, userId, task.taskTitle);
                console.log(`✅ Meeting details saved successfully`);

                console.log(`
╔════════════════════════════════════════════════════════╗
║ 🏁 TIME ENTRY CREATION COMPLETED                       
║ ✅ Time Entry ID: ${enhancedTimeEntryResponse.id}                  
║ ⏱️ Duration: ${timeInHours} hours                      
╚════════════════════════════════════════════════════════╝`);

                return enhancedTimeEntryResponse;
            } catch (apiError) {
                console.error(`❌ ERROR from Intervals API:`, apiError);
                return {
                    success: false,
                    error: apiError instanceof Error 
                        ? `Intervals API error: ${apiError.message}` 
                        : 'Unknown error from Intervals API',
                    meetingId: meeting.id
                };
            }
        } catch (error) {
            console.error(`❌ ERROR creating time entry:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                meetingId: meeting.id
            };
        }
    }
}

export const timeEntryService = IntervalsTimeEntryService.getInstance(); 