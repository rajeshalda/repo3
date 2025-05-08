import { Meeting } from '../../../interfaces/meetings';
import { openAIClient } from '../../core/azure-openai/client';

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

async function getAttendanceRecords(userId: string, meetingId: string, organizerId: string, accessToken: string): Promise<AttendanceRecord[]> {
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

        // Get the current UTC day's start and end
        const now = new Date();
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

        // Find the most recent report for the current UTC day
        const todayReports = reportsData.value.filter((report: any) => {
            const reportStartTime = new Date(report.meetingStartDateTime);
            return reportStartTime >= startOfDay && reportStartTime <= endOfDay;
        });

        if (todayReports.length === 0) {
            console.log('No attendance reports found for the current UTC day');
            return [];
        }

        // Use the most recent report
        const reportId = todayReports[0].id;
        console.log('Report ID:', reportId);

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
        return recordsData.value || [];
    } catch (error) {
        console.error('Error fetching attendance records:', error);
        return [];
    }
}

export async function fetchUserMeetings(userId: string): Promise<{ meetings: Meeting[], attendanceReport: AttendanceReport }> {
    try {
        console.log(`
╔════════════════════════════════════════════════════════╗
║ 🚀 MEETING FETCH STARTED                                
║ 👤 User: ${userId.substring(0, 15)}...                            
╚════════════════════════════════════════════════════════╝`);
        
        console.log(`🔑 Getting Graph API access token...`);
        const accessToken = await getGraphToken();
        console.log(`✅ Access token acquired successfully`);
        
        // Get meetings for the current day in UTC
        const now = new Date();
        
        // Start of day in UTC (00:00:00)
        const startDate = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0, // 00:00:00 UTC
            0,
            0,
            0
        ));
        
        // End of day in UTC (23:59:59.999)
        const endDate = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            23, // 23:59:59.999 UTC
            59,
            59,
            999
        ));

        const startDateString = startDate.toISOString();
        const endDateString = endDate.toISOString();
        
        console.log(`
┌─────────────────────────────────────────────────┐
│ 📅 FETCHING MEETINGS - UTC TIMEZONE             │
│ 📆 Date range: ${startDateString.split('T')[0]}              │
│ ⏰ Time range: ${startDateString.split('T')[1].substring(0, 8)} to ${endDateString.split('T')[1].substring(0, 8)}          │
└─────────────────────────────────────────────────┘`);
        
        // Using calendarView endpoint for better handling of recurring meetings
        const baseUrl = `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?startDateTime=${startDateString}&endDateTime=${endDateString}&$select=id,subject,start,end,organizer,attendees,bodyPreview,importance,isAllDay,isCancelled,categories,onlineMeeting,type,seriesMasterId&$orderby=start/dateTime desc`;
        
        // Function to fetch all meetings using pagination
        async function fetchAllMeetings(url: string): Promise<Meeting[]> {
            console.log(`📡 Fetching meetings from Graph API...`);
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ GRAPH API ERROR: Status ${response.status} ${response.statusText}`);
                console.error(`❌ Error details: ${errorText}`);
                throw new Error(`Failed to fetch meetings: ${response.status} ${response.statusText}\n${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ Received ${data.value?.length || 0} meetings from API (UTC)`);
            
            // Add debug logging for recurring meetings
            const recurringMeetings = data.value?.filter((m: any) => m.seriesMasterId) || [];
            if (recurringMeetings.length > 0) {
                console.log(`🔄 Found ${recurringMeetings.length} recurring meeting instances (UTC):`);
                recurringMeetings.forEach((meeting: any, index: number) => {
                    console.log(`   ${index + 1}. "${meeting.subject}" (UTC: ${meeting.start.dateTime})`);
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
        
        // Filter meetings based on UTC day
        console.log(`
┌─────────────────────────────────────────────────┐
│ 🔍 FILTERING MEETINGS FOR UTC DAY               │
│ 📊 Total meetings before filtering: ${allMeetings.length}            │
└─────────────────────────────────────────────────┘`);
        
        const filteredMeetings = allMeetings.filter((meeting: Meeting) => {
            // Parse the meeting start time in UTC
            const meetingStartTime = new Date(meeting.start.dateTime);
            
            // Check if meeting is within the UTC day
            const isIncluded = meetingStartTime >= startDate && meetingStartTime <= endDate;
            if (!isIncluded) {
                console.log(`⏩ Skipping meeting: "${meeting.subject?.substring(0, 30)}${meeting.subject && meeting.subject.length > 30 ? '...' : ''}" (outside UTC day)`);
            }

            return isIncluded;
        });
        
        console.log(`
┌─────────────────────────────────────────────────┐
│ ✓ MEETINGS FILTERED                            │
│ 📊 Total meetings after filtering: ${filteredMeetings.length}           │
└─────────────────────────────────────────────────┘`);
        
        if (filteredMeetings.length > 0) {
            console.log(`📋 Today's meetings:`);
            filteredMeetings.forEach((meeting, index) => {
                const startTime = new Date(meeting.start.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const endTime = new Date(meeting.end.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const truncatedSubject = meeting.subject 
                    ? `"${meeting.subject.substring(0, 40)}${meeting.subject.length > 40 ? '...' : ''}"`
                    : 'Untitled meeting';
                    
                console.log(`   ${index + 1}. ${truncatedSubject} (${startTime} - ${endTime})`);
            });
        } else {
            console.log(`ℹ️ No meetings found for today in UTC timezone`);
        }

        const attendanceReport: AttendanceReport = {
            totalMeetings: filteredMeetings.length,
            attendedMeetings: 0,
            organizedMeetings: 0,
            attendanceByPerson: {},
            organizerStats: {},
            detailedAttendance: {}
        };

        console.log(`
┌─────────────────────────────────────────────────┐
│ 🔍 FETCHING ATTENDANCE RECORDS                  │
└─────────────────────────────────────────────────┘`);

        for (const meeting of filteredMeetings) {
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
                    const records = await getAttendanceRecords(userId, meetingId, organizerId, accessToken);
                    
                    if (records.length > 0) {
                        attendanceReport.attendedMeetings++;
                        console.log(`✅ Found ${records.length} attendance records for ${truncatedSubject}`);
                        
                        // Calculate total meeting duration from records
                        const totalDuration = records.reduce((sum, record) => sum + record.totalAttendanceInSeconds, 0);
                        const avgDuration = records.length > 0 ? Math.round(totalDuration / records.length) : 0;
                        const maxDuration = Math.max(...records.map(r => r.totalAttendanceInSeconds));
                        
                        console.log(`⏱️ Meeting stats: Avg duration ${Math.floor(avgDuration/60)}m ${avgDuration%60}s, Max duration ${Math.floor(maxDuration/60)}m ${maxDuration%60}s`);
                        
                        attendanceReport.detailedAttendance[meeting.id] = {
                            subject: meeting.subject,
                            startTime: meeting.start.dateTime,
                            endTime: meeting.end.dateTime,
                            records: records.map(record => ({
                                name: record.identity?.displayName || 'Unknown',
                                email: record.emailAddress || '',
                                duration: record.totalAttendanceInSeconds,
                                role: record.role,
                                attendanceIntervals: record.attendanceIntervals
                            }))
                        };

                        records.forEach(record => {
                            if (record.emailAddress) {
                                const email = record.emailAddress.toLowerCase();
                                attendanceReport.attendanceByPerson[email] = 
                                    (attendanceReport.attendanceByPerson[email] || 0) + 1;
                            }
                        });
                    } else {
                        console.log(`ℹ️ No attendance records found for ${truncatedSubject}`);
                    }
                } else {
                    console.log(`⚠️ Could not extract meeting info from Teams URL for ${truncatedSubject}`);
                }
            } else {
                console.log(`ℹ️ Not an online meeting: ${truncatedSubject}`);
            }
        }

        console.log(`
╔════════════════════════════════════════════════════════╗
║ 🏁 MEETING FETCH COMPLETED                             
║ 📊 Total meetings: ${filteredMeetings.length} | With attendance: ${attendanceReport.attendedMeetings}
║ 👥 Unique attendees: ${Object.keys(attendanceReport.attendanceByPerson).length}
╚════════════════════════════════════════════════════════╝`);

        return {
            meetings: filteredMeetings,
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