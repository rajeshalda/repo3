import { Meeting } from '../../../interfaces/meetings';
import { openAIClient } from '../../core/azure-openai/client';
import { DateTime } from 'luxon';
import { readJsonFile, writeJsonFile } from '../../utils/file';
import path from 'path';
import { AIAgentPostedMeetingsStorage } from '../storage/posted-meetings';

const STORAGE_FILE_PATH = path.join(__dirname, '../../data/storage/json/ai-agent-meetings.json');

async function getGraphToken(): Promise<string> {
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

interface MeetingIdentity {
    displayName: string;
    id?: string;
    tenantId?: string;
}

interface AttendanceRecord {
    identity?: MeetingIdentity;
    emailAddress?: string;
    totalAttendanceInSeconds: number;
    role?: string;
    attendanceIntervals?: {
        joinDateTime: string;
        leaveDateTime: string;
        durationInSeconds: number;
    }[];
}

interface AttendanceReport {
    totalMeetings: number;
    attendedMeetings: number;
    organizedMeetings: number;
    attendanceByPerson: { [key: string]: number };
    organizerStats: { [key: string]: number };
    detailedAttendance: {
        [meetingId: string]: {
            subject: string;
            startTime: string;
            endTime: string;
            records: {
                name: string;
                email: string;
                duration: number;
                role?: string;
                attendanceIntervals?: {
                    joinDateTime: string;
                    leaveDateTime: string;
                    durationInSeconds: number;
                }[];
            }[];
        };
    };
}

interface OnlineMeeting {
    joinUrl: string;
    conferenceId?: string;
}

function extractMeetingInfo(joinUrl: string): { meetingId: string | undefined; organizerId: string | undefined } {
    const result = {
        meetingId: undefined as string | undefined,
        organizerId: undefined as string | undefined
    };

    try {
        // First decode the URL
        const decodedUrl = decodeURIComponent(joinUrl);
        console.log('Decoded URL:', decodedUrl);

        // Extract meeting ID using regex - exactly as in graph-meetings.ts
        const meetingMatch = decodedUrl.match(/19:meeting_([^@]+)@thread\.v2/);
        if (meetingMatch) {
            result.meetingId = `19:meeting_${meetingMatch[1]}@thread.v2`;
            console.log('Extracted Meeting ID:', result.meetingId);
        }

        // Extract Organizer ID (Oid) from the context parameter
        const organizerMatch = decodedUrl.match(/"Oid":"([^"]+)"/);
        if (organizerMatch) {
            result.organizerId = organizerMatch[1];
            console.log('Extracted Organizer ID:', result.organizerId);
        }
    } catch (error) {
        console.error('Error extracting meeting info:', error);
    }

    return result;
}

async function getAttendanceRecords(userId: string, meetingId: string, organizerId: string, accessToken: string, istStartDate: Date, istEndDate: Date): Promise<AttendanceRecord[]> {
    try {
        // Format string exactly as in graph-meetings.ts
        const formattedString = `1*${organizerId}*0**${meetingId}`;
        console.log('Formatted string:', formattedString);
        const base64MeetingId = Buffer.from(formattedString).toString('base64');
        console.log('Base64 Meeting ID:', base64MeetingId);

        // First get the user info
        const userResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!userResponse.ok) {
            console.log('Failed to get user info');
            return [];
        }

        const userData = await userResponse.json();
        const targetUserId = userData.id;

        // Get attendance reports using the user's ID
        const reportsResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!reportsResponse.ok) {
            console.log(`No attendance reports. Status: ${reportsResponse.status}`);
            return [];
        }

        const reportsData = await reportsResponse.json();
        console.log('Reports data:', JSON.stringify(reportsData, null, 2));

        if (!reportsData.value || reportsData.value.length === 0) {
            return [];
        }

        // Calculate UTC time window that covers the full IST day
        const now = new Date();
        
        // Start time is previous UTC day at 18:30 (IST 00:00)
        const startOfWindow = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - 1, // Previous UTC day
            18, // 18:30 UTC = 00:00 IST
            30,
            0,
            0
        ));
        
        // End time is current UTC day at 18:29:59.999 (IST 23:59:59.999)
        const endOfWindow = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            18,
            29,
            59,
            999
        ));

        console.log(`
┌─────────────────────────────────────────────────┐
│ 🔍 ATTENDANCE REPORT TIME WINDOW                │
│ 📅 UTC: ${startOfWindow.toISOString()} to       │
│     ${endOfWindow.toISOString()}                │
│ 🕒 IST: ${new Date(startOfWindow.getTime() + 5.5 * 60 * 60 * 1000).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} to │
│     ${new Date(endOfWindow.getTime() + 5.5 * 60 * 60 * 1000).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}    │
└─────────────────────────────────────────────────┘`);

        // Find reports within our UTC window that covers the IST day
        const relevantReports = reportsData.value.filter((report: any) => {
            const reportDateIST = DateTime.fromISO(report.meetingStartDateTime, { zone: 'Asia/Kolkata' });
            const reportDateStr = reportDateIST.toISODate();
            const istTargetDateStr = DateTime.fromJSDate(istStartDate, { zone: 'Asia/Kolkata' }).toISODate();
            const isRelevant = (reportDateStr === istTargetDateStr);
            console.log('Report time check:', {
                reportTime: report.meetingStartDateTime,
                reportDateStr,
                istTargetDateStr,
                isRelevant
            });
            return isRelevant;
        });

        if (relevantReports.length === 0) {
            console.log('No attendance reports found within the IST day window');
            return [];
        }

        // Use the most recent report
        const reportId = relevantReports[0].id;
        console.log(`Found ${relevantReports.length} relevant reports, using most recent: ${reportId}`);

        // Get attendance records
        const recordsResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports/${reportId}/attendanceRecords`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!recordsResponse.ok) {
            return [];
        }

        const recordsData = await recordsResponse.json();
        console.log('Records data:', JSON.stringify(recordsData, null, 2));
        
        // Process and filter attendance records by IST day
        const records = (recordsData.value || []).map((record: any) => {
            if (!record.attendanceIntervals) return record;
            // Filter intervals to only those within the IST day
            const filteredIntervals = record.attendanceIntervals.filter((interval: any) => {
                const joinIST = new Date(new Date(interval.joinDateTime).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                return joinIST >= istStartDate && joinIST <= istEndDate;
            });
            const totalDuration = filteredIntervals.reduce((sum: number, interval: any) => sum + interval.durationInSeconds, 0);
            return {
                ...record,
                attendanceIntervals: filteredIntervals,
                totalAttendanceInSeconds: totalDuration
            };
        }).filter((record: any) => record.attendanceIntervals && record.attendanceIntervals.length > 0);
        
        if (records.length > 0) {
            console.log(`\n┌─────────────────────────────────────────────────┐\n│ ✅ ATTENDANCE RECORDS FOUND                     │\n│ 📊 Total Records: ${records.length}             │\n│ 🕒 Meeting Start: ${relevantReports[0].meetingStartDateTime} │\n└─────────────────────────────────────────────────┘`);
        }
        
        return records;
    } catch (error) {
        console.error('Error fetching attendance records:', error);
        return [];
    }
}

export async function fetchUserMeetings(userId: string): Promise<{ meetings: Meeting[], attendanceReport: AttendanceReport }> {
    try {
        console.log(`\n╔════════════════════════════════════════════════════════╗\n║ 🚀 MEETING FETCH STARTED                                \n║ 👤 User: ${userId.substring(0, 15)}...                            \n╚════════════════════════════════════════════════════════╝`);
        
        console.log(`🔑 Getting Graph API access token...`);
        const accessToken = await getGraphToken();
        console.log(`✅ Access token acquired successfully`);
        
        // Get current time in IST
        const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        
        // Start of current day in IST (00:00:00)
        const istStartDate = new Date(istNow);
        istStartDate.setHours(0, 0, 0, 0);
        
        // End of next day in IST (23:59:59.999)
        const istEndDate = new Date(istNow);
        istEndDate.setDate(istEndDate.getDate() + 1); // Add one day
        istEndDate.setHours(23, 59, 59, 999);

        // Calculate UTC window that covers the extended IST period
        const utcStart = new Date(Date.UTC(
            istStartDate.getUTCFullYear(),
            istStartDate.getUTCMonth(),
            istStartDate.getUTCDate() - 1, // Previous UTC day
            18, 30, 0, 0
        ));
        
        const utcEnd = new Date(Date.UTC(
            istEndDate.getUTCFullYear(),
            istEndDate.getUTCMonth(),
            istEndDate.getUTCDate(),
            18, 29, 59, 999
        ));

        const startDateString = utcStart.toISOString();
        const endDateString = utcEnd.toISOString();

        console.log(`\n┌─────────────────────────────────────────────────┐\n│ 📅 FETCHING MEETINGS FOR EXTENDED WINDOW         │\n│ 📆 IST range: ${istStartDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} to              │\n│             ${istEndDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}              │\n│ 🌐 UTC range: ${startDateString} to              │\n│             ${endDateString}              │\n└─────────────────────────────────────────────────┘`);
        // Using calendarView endpoint for better handling of recurring meetings
        const baseUrl = `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${startDateString}&endDateTime=${endDateString}&$select=id,subject,start,end,organizer,attendees,bodyPreview,importance,isAllDay,isCancelled,categories,onlineMeeting,type,seriesMasterId&$orderby=start/dateTime desc`;
        // Function to fetch all meetings using pagination
        async function fetchAllMeetings(url: string): Promise<Meeting[]> {
            console.log(`📡 Fetching meetings from Graph API...`);
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'outlook.timezone="India Standard Time"'
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ GRAPH API ERROR: Status ${response.status} ${response.statusText}`);
                console.error(`❌ Error details: ${errorText}`);
                throw new Error(`Failed to fetch meetings: ${response.status} ${response.statusText}\n${errorText}`);
            }
            const data = await response.json();
            console.log(`✅ Received ${data.value?.length || 0} meetings from API`);
            // Add debug logging for recurring meetings
            const recurringMeetings = data.value?.filter((m: any) => m.seriesMasterId) || [];
            if (recurringMeetings.length > 0) {
                console.log(`🔄 Found ${recurringMeetings.length} recurring meeting instances:`);
                recurringMeetings.forEach((meeting: any, index: number) => {
                    console.log(`   ${index + 1}. "${meeting.subject}" (${meeting.start.dateTime})`);
                });
            }
            const meetings = data.value;
            // Check if there's a next page of results
            if (data['@odata.nextLink']) {
                console.log(`📄 Found more meetings, fetching next page...`);
                // Recursively fetch next page and combine results
                const nextPageMeetings = await fetchAllMeetings(data['@odata.nextLink']);
                return [...meetings, ...nextPageMeetings];
            }
            return meetings;
        }
        // Fetch all meetings using pagination
        const allMeetings = await fetchAllMeetings(baseUrl);
        // Post-filter meetings based on IST day
        console.log(`\n┌─────────────────────────────────────────────────┐\n│ 🔍 FILTERING MEETINGS FOR EXTENDED WINDOW         │\n│ 📊 Total meetings before filtering: ${allMeetings.length}            │\n└─────────────────────────────────────────────────┘`);
        allMeetings.forEach((meeting: Meeting, idx: number) => {
            console.log(`\n[RAW MEETING ${idx + 1}]`);
            console.log(JSON.stringify(meeting, null, 2));
        });

        // Define UTC window boundaries based on IST window
        const istStartDateTime = DateTime.fromJSDate(istStartDate);
        const istEndDateTime = DateTime.fromJSDate(istEndDate);
        const utcStartWindow = istStartDateTime.minus({ hours: 5, minutes: 30 });
        const utcEndWindow = istEndDateTime.minus({ hours: 5, minutes: 30 });

        const filteredMeetings = allMeetings.filter((meeting: Meeting) => {
            // Parse start and end times in both UTC and IST
            const meetingStartUTC = DateTime.fromISO(meeting.start.dateTime);
            const meetingEndUTC = DateTime.fromISO(meeting.end.dateTime);
            const meetingStartIST = meetingStartUTC.setZone('Asia/Kolkata');
            
            // For recurring meetings, only include if:
            // 1. Meeting starts within the UTC window AND
            // 2. Meeting is not a future instance beyond current UTC window
            if (meeting.seriesMasterId) {
                const isInWindow = meetingStartUTC.toMillis() >= utcStartWindow.toMillis() && 
                                  meetingStartUTC.toMillis() <= utcEndWindow.toMillis();
                
                if (isInWindow) {
                    // For recurring meetings, we'll set the timeEntryDate later when we have the attendance report
                    meeting.timeEntryDate = undefined;
                }
                
                return isInWindow;
            }
            
            // For non-recurring meetings, use the original logic
            const isInDay = meetingStartIST.hasSame(istStartDateTime, 'day');
            if (isInDay) {
                // For non-recurring meetings, use the actual meeting date
                meeting.timeEntryDate = meetingStartUTC.toFormat('yyyy-MM-dd');
            }
            return isInDay;
        });

        // Deduplicate meetings by id and IST date
        const uniqueMeetingsMap = new Map();
        filteredMeetings.forEach(meeting => {
            const meetingTimeIST = new Date(meeting.start.dateTime).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
            const meetingDateIST = new Date(meetingTimeIST).toISOString().split('T')[0];
            const key = `${meeting.id}_${meetingDateIST}`;
            if (!uniqueMeetingsMap.has(key)) {
                uniqueMeetingsMap.set(key, meeting);
            }
        });
        const uniqueMeetings = Array.from(uniqueMeetingsMap.values());
        console.log(`\n┌─────────────────────────────────────────────────┐\n│ ✓ MEETINGS FILTERED                            │\n│ 📊 Total meetings after filtering: ${uniqueMeetings.length}           │\n└─────────────────────────────────────────────────┘`);
        if (uniqueMeetings.length > 0) {
            console.log(`📋 Today's meetings:`);
            uniqueMeetings.forEach((meeting, index) => {
                const startTime = new Date(meeting.start.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const endTime = new Date(meeting.end.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const truncatedSubject = meeting.subject 
                    ? `"${meeting.subject.substring(0, 40)}${meeting.subject.length > 40 ? '...' : ''}"`
                    : 'Untitled meeting';
                console.log(`   ${index + 1}. ${truncatedSubject} (${startTime} - ${endTime})`);
            });
        } else {
            console.log(`ℹ️ No meetings found for today in IST timezone`);
        }
        const attendanceReport: AttendanceReport = {
            totalMeetings: uniqueMeetings.length,
            attendedMeetings: 0,
            organizedMeetings: 0,
            attendanceByPerson: {},
            organizerStats: {},
            detailedAttendance: {}
        };
        console.log(`\n┌─────────────────────────────────────────────────┐\n│ 🔍 FETCHING ATTENDANCE RECORDS                  │\n└─────────────────────────────────────────────────┘`);
        for (const meeting of uniqueMeetings) {
            const organizerEmail = (meeting.organizer?.email || '').toLowerCase();
            attendanceReport.organizerStats[organizerEmail] = (attendanceReport.organizerStats[organizerEmail] || 0) + 1;
            
            const truncatedSubject = meeting.subject 
                ? `"${meeting.subject.substring(0, 30)}${meeting.subject.length > 30 ? '...' : ''}"`
                : 'Untitled meeting';
            
            if (meeting.onlineMeeting?.joinUrl) {
                console.log(`📝 Processing online meeting: ${truncatedSubject}`);
                const decodedJoinUrl = decodeURIComponent(meeting.onlineMeeting.joinUrl);
                const { meetingId, organizerId } = extractMeetingInfo(decodedJoinUrl);
                
                if (meetingId && organizerId) {
                    console.log(`🔍 Fetching attendance for meeting ID: ${meetingId.substring(0, 8)}...`);
                    const attendanceRecords = await getAttendanceRecords(userId, meetingId, organizerId, accessToken, istStartDate, istEndDate);
                    
                    if (attendanceRecords.length > 0) {
                        // Get report ID for this meeting instance
                        let reportId: string | undefined;
                        
                        try {
                            // Format the meeting ID for the API call
                            const formattedString = `1*${organizerId}*0**${meetingId}`;
                            const base64MeetingId = Buffer.from(formattedString).toString('base64');
                            
                            // Get the reports URL for this meeting
                            const reportsUrl = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${base64MeetingId}/attendanceReports`;
                            console.log(`Fetching attendance reports from: ${reportsUrl}`);
                            
                            // Fetch the reports
                            const reportsResponse = await fetch(reportsUrl, {
                                headers: {
                                    Authorization: `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (reportsResponse.ok) {
                                const reportsData = await reportsResponse.json();
                                
                                if (reportsData.value && reportsData.value.length > 0) {
                                    // For now, use the first report ID
                                    reportId = reportsData.value[0].id;
                                    console.log(`Found report ID: ${reportId}`);
                                    
                                    // Check if a meeting with this report ID already exists in storage
                                    const storage = new AIAgentPostedMeetingsStorage();
                                    await storage.loadData();
                                    
                                    const isPosted = await storage.isPosted(userId, meeting.id, 0, '', reportId);
                                    
                                    if (isPosted) {
                                        console.log(`⚠️ Meeting already processed: ${truncatedSubject}`);
                                        continue;
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error checking for report ID:', error);
                            // Continue processing even if we can't check for report ID
                        }

                        attendanceReport.attendedMeetings++;
                        console.log(`✅ Found ${attendanceRecords.length} attendance records for ${truncatedSubject}`);
                        
                        // Rest of the existing attendance processing code...
                        const totalDuration = attendanceRecords.reduce((sum, record) => sum + record.totalAttendanceInSeconds, 0);
                        const avgDuration = attendanceRecords.length > 0 ? Math.round(totalDuration / attendanceRecords.length) : 0;
                        const maxDuration = Math.max(...attendanceRecords.map(r => r.totalAttendanceInSeconds));
                        
                        // Calculate duration for legacy uniqueStorageId generation
                        const duration = calculateDuration(meeting);
                        const uniqueStorageId = generateUniqueStorageId(meeting, duration);
                        
                        // After successful time entry creation
                        await storeMeetingEntry({
                            meetingId: meeting.id,
                            uniqueStorageId,
                            userId: meeting.organizer.email,
                            timeEntry: attendanceRecords[0],
                            rawResponse: attendanceRecords[0].attendanceIntervals ? { intervals: attendanceRecords[0].attendanceIntervals } : null,
                            postedAt: DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd\'T\'HH:mm:ss.SSS \'IST\''),
                            reportId: reportId // Add the report ID if available
                        });
                    }
                }
            } else {
                console.log(`ℹ️ Not an online meeting: ${truncatedSubject}`);
            }
        }
        console.log(`\n╔════════════════════════════════════════════════════════╗\n║ 🏁 MEETING FETCH COMPLETED                             \n║ 📊 Total meetings: ${uniqueMeetings.length} | With attendance: ${attendanceReport.attendedMeetings}\n║ 👥 Unique attendees: ${Object.keys(attendanceReport.attendanceByPerson).length}\n╚════════════════════════════════════════════════════════╝`);
        return {
            meetings: uniqueMeetings,
            attendanceReport
        };
    } catch (error: unknown) {
        console.error('❌ ERROR fetching meetings:', error);
        throw new Error(error instanceof Error ? error.message : 'Failed to fetch meetings');
    }
}

// Test function to run the meeting fetch
export async function testMeetingFetch(userId: string): Promise<void> {
    try {
        console.log('Starting meeting fetch test for user:', userId);
        const { meetings, attendanceReport } = await fetchUserMeetings(userId);
        console.log(`Successfully fetched ${meetings.length} meetings`);
        console.log('Attendance Report:', JSON.stringify(attendanceReport, null, 2));
        
        // Log detailed attendance information
        console.log('\nDetailed Attendance Information:');
        Object.entries(attendanceReport.detailedAttendance).forEach(([meetingId, data]) => {
            console.log(`\nMeeting: ${data.subject}`);
            console.log(`Start Time: ${data.startTime}`);
            console.log('Attendees:');
            data.records.forEach(record => {
                console.log(`- ${record.name} (${record.email}): ${record.duration} seconds`);
                if (record.attendanceIntervals) {
                    record.attendanceIntervals.forEach(interval => {
                        console.log(`  Joined: ${interval.joinDateTime}`);
                        console.log(`  Left: ${interval.leaveDateTime}`);
                        console.log(`  Duration: ${interval.durationInSeconds} seconds`);
                    });
                }
            });
        });
    } catch (error) {
        console.error('Test failed:', error);
        throw error;
    }
}

// Add this test function
export async function testMeetingAnalysis() {
    const sampleMeeting = {
        id: "AAMkAGViNDU7zAC1GAAA=",
        subject: "Project Status Review - AI Agent Implementation",
        bodyPreview: "Agenda:\n1. Current progress review\n2. Technical challenges discussion\n3. Next sprint planning",
        importance: "high",
        start: {
            dateTime: "2024-03-20T10:00:00.0000000",
            timeZone: "UTC"
        },
        end: {
            dateTime: "2024-03-20T11:00:00.0000000",
            timeZone: "UTC"
        },
        attendees: [
            {
                emailAddress: { address: "organizer@example.com", name: "Meeting Organizer" },
                type: "required"
            },
            {
                emailAddress: { address: "developer1@example.com", name: "Developer One" },
                type: "required"
            }
        ],
        attendance: {
            records: [
                {
                    identity: {
                        displayName: "Meeting Organizer",
                        id: "organizer-id"
                    },
                    email: "organizer@example.com",
                    role: "Organizer",
                    totalAttendanceInSeconds: 3600,
                    intervals: [
                        {
                            joinDateTime: "2024-03-20T10:00:00.0000000",
                            leaveDateTime: "2024-03-20T11:00:00.0000000",
                            durationInSeconds: 3600
                        }
                    ]
                },
                {
                    identity: {
                        displayName: "Developer One",
                        id: "dev1-id"
                    },
                    email: "developer1@example.com",
                    role: "Attendee",
                    totalAttendanceInSeconds: 3300,
                    intervals: [
                        {
                            joinDateTime: "2024-03-20T10:05:00.0000000",
                            leaveDateTime: "2024-03-20T11:00:00.0000000",
                            durationInSeconds: 3300
                        }
                    ]
                }
            ]
        }
    };

    console.log("Testing meeting analysis with sample data:");
    console.log(JSON.stringify(sampleMeeting, null, 2));

    try {
        const formattedData = JSON.stringify(sampleMeeting, null, 2);
        const analysis = await openAIClient.analyzeMeeting(formattedData);
        
        console.log("\nAnalysis Result:");
        console.log(JSON.stringify(analysis, null, 2));
        
        return analysis;
    } catch (error) {
        console.error("Error analyzing meeting:", error);
        throw error;
    }
}

// Helper functions for parsing the analysis
function extractSections(analysisResult: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = analysisResult.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
        if (line.endsWith(':')) {
            if (currentSection) {
                sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
                currentContent = [];
            }
            currentSection = line.slice(0, -1).trim();
        } else if (currentSection && line.trim()) {
            currentContent.push(line.trim());
        }
    }

    if (currentSection) {
        sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
    }

    return sections;
}

function extractKeyPoints(keyPointsSection: string = ''): string[] {
    return keyPointsSection
        .split('\n')
        .map(point => point.replace(/^-\s*/, '').trim())
        .filter(point => point.length > 0);
}

function extractRelevanceScore(relevanceSection: string = ''): number {
    const scoreMatch = relevanceSection.match(/(\d*\.?\d+)/);
    return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
}

function extractCategories(categoriesSection: string = ''): string[] {
    return categoriesSection
        .split('\n')
        .map(category => category.replace(/^-\s*/, '').trim())
        .filter(category => category.length > 0);
}

function extractConfidenceScore(confidenceSection: string = ''): number {
    const scoreMatch = confidenceSection.match(/(\d*\.?\d+)/);
    return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
}

function extractPatterns(contextSection: string = ''): string[] {
    return contextSection
        .split('\n')
        .map(pattern => pattern.replace(/^-\s*/, '').trim())
        .filter(pattern => pattern.length > 0);
}

// Calculate meeting duration in hours
function calculateDuration(meeting: Meeting): number {
    const start = DateTime.fromISO(meeting.start.dateTime);
    const end = DateTime.fromISO(meeting.end.dateTime);
    return end.diff(start, 'hours').hours;
}

// Get existing meeting entry from storage
async function getMeetingEntry(uniqueStorageId: string): Promise<any> {
    const storage = await readJsonFile(STORAGE_FILE_PATH);
    return storage.meetings.find((entry: any) => entry.uniqueStorageId === uniqueStorageId);
}

// Store meeting entry with unique ID
async function storeMeetingEntry(entry: {
    meetingId: string;
    uniqueStorageId: string;
    userId: string;
    timeEntry: any;
    rawResponse: any;
    postedAt: string;
    reportId?: string;
}): Promise<void> {
    const storage = await readJsonFile(STORAGE_FILE_PATH);
    storage.meetings.push(entry);
    await writeJsonFile(STORAGE_FILE_PATH, storage);
}

// Generate unique storage ID for the meeting
const generateUniqueStorageId = (meeting: Meeting, duration: number): string => {
    const meetingId = meeting.id;
    const startTime = meeting.timeEntryDate || // Use actual attendance date if available
        DateTime.fromISO(meeting.start.dateTime)
            .toUTC()
            .toFormat('yyyy-MM-dd'); // Otherwise use scheduled date
    return `${meetingId}_${duration}_${startTime}`;
};

// ... existing code ... 