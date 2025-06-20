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
    timeEntry: Partial<TimeEntryResponse>;
    rawResponse: any;
    postedAt: string;
    taskName?: string;
    reportId?: string;
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
        if (!userId) {
            throw new Error('User ID is required for API requests');
        }

        const headers = {
            'Content-Type': 'application/json',
            'x-user-id': userId
        };

        // Use an absolute URL format that works in both browser and Node.js environments
        const apiUrl = typeof window !== 'undefined' 
            ? window.location.origin 
            : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
            
        console.log(`Making request for user ${userId} to endpoint: ${endpoint}`);
            
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
                console.error(`Failed to parse response as JSON for user ${userId}:`, responseText);
                throw new Error(`Invalid JSON response for user ${userId}: ${responseText}`);
            }

            if (!response.ok) {
                console.error(`API Error for user ${userId} (${response.status}):`, responseData);
                if (responseData && responseData.error) {
                    // If error is an object, stringify it for better error messages
                    const errorMessage = typeof responseData.error === 'object' 
                        ? JSON.stringify(responseData.error)
                        : responseData.error.toString();
                    throw new Error(`API Error for user ${userId}: ${errorMessage}`);
                }
                throw new Error(`Failed to make request for user ${userId}: ${response.status} ${response.statusText}`);
            }

            console.log(`Successful API response for user ${userId} from endpoint: ${endpoint}`);
            return responseData;
        } catch (error) {
            console.error(`Error in makeRequest for user ${userId} to ${endpoint}:`, error);
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

    private async getGraphToken(): Promise<string> {
        try {
            const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_AD_APP_TENANT_ID}/oauth2/v2.0/token`;
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: process.env.AZURE_AD_APP_CLIENT_ID!,
                    client_secret: process.env.AZURE_AD_APP_CLIENT_SECRET!,
                    grant_type: 'client_credentials',
                    scope: 'https://graph.microsoft.com/.default'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get access token');
            }

            const data = await response.json();
            return data.access_token;
        } catch (error) {
            console.error('Error getting graph token:', error);
            throw error;
        }
    }

    private formatDate(dateString: string): string {
        // Convert the date to IST timezone (UTC+05:30) before formatting
        const date = new Date(dateString);
        
        // Add 5 hours and 30 minutes to convert to IST
        const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
        
        // Convert ISO date string to YYYY-MM-DD format in IST timezone
        return istDate.toISOString().split('T')[0];
    }

    private async savePostedMeeting(
        meeting: ProcessedMeeting, 
        timeEntry: TimeEntryResponse, 
        rawResponse: any, 
        userId: string, 
        taskName?: string
    ): Promise<void> {
        try {
            // Extract the report ID from the meeting data
            const reportId = meeting.attendance?.reportId;
            
            if (!reportId) {
                console.warn(`[${new Date().toISOString()}] No report ID found in meeting data, this may cause duplication issues`);
            } else {
                console.log(`[${new Date().toISOString()}] Found report ID in meeting data: ${reportId}`);
            }
            
            const postedTimestamp = {
                utc: new Date().toISOString(),
                ist: new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) + ' IST'
            };

            // Ensure timeEntry has all required fields
            if (timeEntry && !timeEntry.taskTitle && taskName) {
                timeEntry.taskTitle = taskName;
            }

            // Make sure meeting.id is defined
            if (!meeting.id) {
                console.warn(`Meeting ID is missing! Using subject as fallback ID: ${meeting.subject}`);
            }

            const postedMeeting = {
                meetingId: meeting.id || `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                userId: userId,
                timeEntry: timeEntry as any, // Cast to any to avoid type issues
                rawResponse: rawResponse,
                postedAt: postedTimestamp.utc,
                taskName: taskName || '',
                reportId: reportId || undefined
            };

            // Save to database
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.addPostedMeeting(postedMeeting);
            console.log('Successfully saved posted meeting with time entry');
        } catch (error) {
            console.error('Error saving posted meeting:', error);
            throw error;
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
║ 📝 Meeting: ${meeting.subject}                         
║ 🔄 Task: ${task.taskTitle}                             
╚════════════════════════════════════════════════════════╝`);

            console.log(`⏳ Fetching person & task information...`);
            
            // Get person info
            const person = await this.getPersonInfo(userId);
            
            // Get task details
            const taskDetails = await this.getTaskDetails(task.taskId, userId);
            console.log(`Retrieved task details: {
  id: '${taskDetails.id}',
  title: '${taskDetails.title}',
  status: '${taskDetails.status}',
  client: '${taskDetails.client}',
  assigneeid: '${taskDetails.assigneeid}'
}`);

            console.log(`
┌─────────────────────────────────────────────────┐
│ ✓ USER & TASK INFO RETRIEVED                    │
│ 👤 User:                          │
│ 📋 Task: #${taskDetails.id} - ${taskDetails.title} │
│ 🏢 Client: ${taskDetails.client} | Project: ${taskDetails.project} │
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
            console.log(`ℹ️ Using worktype ID 805564 for India-Meeting`);
            const worktypeId = '805564';

            // Handle specific report ID fetching for recurring meetings
            let attendanceRecords = meeting.attendance?.records || [];
            let userDuration = 0;
            const specificReportId = meeting.attendance?.reportId;
            
            // Debug: Log what report ID we're getting
            console.log(`🔧 DEBUG: Meeting reportId = ${specificReportId}, Meeting ID = ${meeting.id.substring(0, 20)}...`);
            
            // If this meeting instance has a specific report ID and we need to fetch fresh data
            if (specificReportId && meeting.onlineMeeting?.joinUrl) {
                console.log(`🔍 Fetching attendance for specific report ID: ${specificReportId}`);
                
                try {
                    // Get the access token (we'll need to create a simple version)
                    const accessToken = await this.getGraphToken();
                    const joinUrl = meeting.onlineMeeting.joinUrl;
                    
                    // Extract meeting ID and organizer ID from join URL
                    const decodedUrl = decodeURIComponent(joinUrl);
                    const meetingMatch = decodedUrl.match(/19:meeting_([^@]+)@thread\.v2/);
                    const organizerMatch = decodedUrl.match(/"Oid":"([^"]+)"/);
                    
                    if (meetingMatch && organizerMatch) {
                        const meetingId = `19:meeting_${meetingMatch[1]}@thread.v2`;
                        const organizerId = organizerMatch[1];
                        
                        // Get user info
                        const userResponse = await fetch(
                            `https://graph.microsoft.com/v1.0/users/${userId}`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json'
                                }
                            }
                        );
                        
                        if (userResponse.ok) {
                            const userData = await userResponse.json();
                            const targetUserId = userData.id;
                            
                            // Format the meeting ID for API call
                            const formattedString = `1*${organizerId}*0**${meetingId}`;
                            const base64MeetingId = Buffer.from(formattedString).toString('base64');
                            
                            // Fetch attendance records for this specific report
                            const recordsResponse = await fetch(
                                `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports/${specificReportId}/attendanceRecords`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            
                            if (recordsResponse.ok) {
                                const recordsData = await recordsResponse.json();
                                const records = recordsData.value || [];
                                
                                console.log(`📊 Fetched ${records.length} attendance records for report ${specificReportId}`);
                                
                                // Find the current user's record
                                const userRecord = records.find((record: any) => 
                                    record.emailAddress?.toLowerCase() === userId.toLowerCase()
                                );
                                
                                if (userRecord) {
                                    userDuration = userRecord.totalAttendanceInSeconds;
                                    console.log(`✅ Found specific attendance: ${Math.floor(userDuration/60)}m ${userDuration%60}s for report ${specificReportId}`);
                                    
                                    // Update attendance records with the specific report data
                                    attendanceRecords = [{
                                        name: userRecord.identity?.displayName || 'Unknown',
                                        email: userRecord.emailAddress || '',
                                        duration: userDuration,
                                        role: userRecord.role,
                                        attendanceIntervals: userRecord.attendanceIntervals || []
                                    }];
                                } else {
                                    console.log(`❌ User ${userId} not found in report ${specificReportId}`);
                                }
                            } else {
                                console.log(`⚠️ Failed to fetch records for report ${specificReportId}`);
                            }
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ Failed to fetch specific report data, using existing attendance: ${error}`);
                }
            }
            
            // If we didn't get duration from specific report, use existing logic
            if (userDuration === 0 && attendanceRecords.length > 0) {
                console.log(`🔍 Checking attendance records for user ${userId}...`);
                const userRecord = attendanceRecords.find(record => 
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

            // Determine the correct date to use for time entry
            // Priority: 1) timeEntryDate (corrected IST date), 2) joinDateTime (attendance-based), 3) scheduled time
            let timeEntryDate: string;
            let dateSource: string;

            if (meeting.timeEntryDate) {
                // Use the corrected timeEntryDate set by agent (already in YYYY-MM-DD format)
                timeEntryDate = meeting.timeEntryDate;
                dateSource = `corrected IST date (${meeting.timeEntryDate})`;
            } else if (attendanceRecords[0]?.attendanceIntervals[0]?.joinDateTime) {
                // Convert attendance joinDateTime to IST date
                const joinDateTime = attendanceRecords[0].attendanceIntervals[0].joinDateTime;
                const joinUTC = new Date(joinDateTime);
                const joinIST = new Date(joinUTC.getTime() + (5.5 * 60 * 60 * 1000));
                timeEntryDate = joinIST.toISOString().split('T')[0];
                dateSource = `attendance IST date (${timeEntryDate} from ${joinDateTime})`;
            } else {
                // Fallback to scheduled time converted to IST
                const scheduledUTC = new Date(meeting.start.dateTime);
                const scheduledIST = new Date(scheduledUTC.getTime() + (5.5 * 60 * 60 * 1000));
                timeEntryDate = scheduledIST.toISOString().split('T')[0];
                dateSource = `scheduled IST date (${timeEntryDate})`;
            }

            // Prepare time entry data
            const timeEntry: TimeEntry = {
                projectid: taskDetails.projectid,
                moduleid: taskDetails.moduleid,
                taskid: taskDetails.id,
                worktypeid: worktypeId,
                personid: person.id,
                date: timeEntryDate,
                time: timeInHours,
                description: meeting.subject,
                billable: isBillable ? 't' : 'f'
            };

            // Add debug log to show date conversion
            console.log(`
┌─────────────────────────────────────────────────┐
│ 📊 TIME ENTRY DETAILS                           │
│ 📆 Date: ${timeEntry.date} (from ${dateSource})  │
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