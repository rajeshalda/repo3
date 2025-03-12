import axios, { AxiosResponse } from 'axios';

// Interface definitions
interface Config {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    targetUserId: string;
}

interface MeetingIdentity {
    displayName: string;
}

interface AttendanceRecord {
    identity?: MeetingIdentity;
    emailAddress?: string;
    totalAttendanceInSeconds: number;
}

interface OnlineMeeting {
    joinUrl: string;
}

interface MeetingDateTime {
    dateTime: string;
    timeZone?: string;
}

interface Meeting {
    subject: string;
    start: MeetingDateTime;
    end: MeetingDateTime;
    bodyPreview?: string;
    onlineMeeting?: OnlineMeeting;
}

interface User {
    id: string;
}

interface AttendanceReportResponse {
    value: Array<{ id: string }>;
}

interface AttendanceRecordsResponse {
    value: AttendanceRecord[];
}

interface MeetingsResponse {
    value: Meeting[];
}

// Configuration details
const config: Config = {
    tenantId: "a5ae9ae1-3c47-4b70-b92c-ac3a0efffc6a",
    clientId: "9ec41cd0-ae8c-4dd5-bc84-a3aeea4bda54",
    clientSecret: "r~v8Q~tlraKa35.23OEBjHFpebqEcgEYRDIp8az_",
    targetUserId: "ramesh@M365x65088219.onmicrosoft.com"
};

// Helper function to format duration in seconds to readable format
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (remainingSeconds > 0) parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);

    return parts.join(' ');
}

// Helper function to format date
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    // Convert to IST by adding 5 hours and 30 minutes offset
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    return istDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
    });
}

// Helper function to get access token for application authentication
async function getApplicationAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default'
    });

    try {
        const response: AxiosResponse<{ access_token: string }> = await axios.post(tokenUrl, params);
        return response.data.access_token;
    } catch (error) {
        console.error('❌ Authentication failed:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}

async function main(): Promise<void> {
    try {
        // Get Access Token
        const accessToken = await getApplicationAccessToken(
            config.tenantId,
            config.clientId,
            config.clientSecret
        );
        const headers = { Authorization: `Bearer ${accessToken}` };
        console.log('🔐 Successfully authenticated\n');

        // Step 1: Get user information
        const encodedUserId = encodeURIComponent(config.targetUserId);
        console.log(`👤 Getting meetings for: ${config.targetUserId}`);
        
        try {
            const userResponse: AxiosResponse<User> = await axios.get(
                `https://graph.microsoft.com/v1.0/users/${encodedUserId}`,
                { headers }
            );
            const targetUser = userResponse.data;

            // Step 2: Get meetings from the last 7 days
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            const endDate = new Date();

            const startDateString = startDate.toISOString();
            const endDateString = endDate.toISOString();
            console.log(`📅 Retrieving meetings from ${formatDate(startDateString)} to ${formatDate(endDateString)}\n`);

            const filter = encodeURIComponent(
                `start/dateTime ge '${startDateString}' and end/dateTime le '${endDateString}'`
            );
            const meetingsUrl = `https://graph.microsoft.com/v1.0/users/${targetUser.id}/events?$filter=${filter}&$select=subject,start,end,onlineMeeting,onlineMeetingUrl,bodyPreview`;

            const meetingsResponse: AxiosResponse<MeetingsResponse> = await axios.get(meetingsUrl, { headers });
            const meetings = meetingsResponse.data.value;

            if (meetings && meetings.length > 0) {
                console.log(`📊 Found ${meetings.length} meeting${meetings.length !== 1 ? 's' : ''}\n`);
                console.log('=' .repeat(80));

                for (const meeting of meetings) {
                    console.log(`\n📌 Meeting: ${meeting.subject}`);
                    console.log(`🕒 Time: ${formatDate(meeting.start.dateTime)} - ${formatDate(meeting.end.dateTime)}`);

                    if (meeting.bodyPreview) {
                        console.log(`📝 Description: ${meeting.bodyPreview}`);
                    }

                    if (meeting.onlineMeeting) {
                        const decodedJoinUrl = decodeURIComponent(meeting.onlineMeeting.joinUrl);
                        let meetingId: string | undefined;
                        let organizerOid: string | undefined;

                        const meetingMatch = decodedJoinUrl.match(/19:meeting_([^@]+)@thread\.v2/);
                        if (meetingMatch) {
                            meetingId = `19:meeting_${meetingMatch[1]}@thread.v2`;
                        }

                        const organizerMatch = decodedJoinUrl.match(/"Oid":"([^"]+)"/);
                        if (organizerMatch) {
                            organizerOid = organizerMatch[1];
                        }

                        if (!meetingId || !organizerOid) {
                            console.log('ℹ️ No attendance data available');
                            console.log('-'.repeat(80));
                            continue;
                        }

                        const formattedString = `1*${organizerOid}*0**${meetingId}`;
                        const base64MeetingId = Buffer.from(formattedString).toString('base64');

                        try {
                            const attendanceReportResponse: AxiosResponse<AttendanceReportResponse> = await axios.get(
                                `https://graph.microsoft.com/v1.0/users/${targetUser.id}/onlineMeetings/${base64MeetingId}/attendanceReports`,
                                { headers }
                            );

                            if (attendanceReportResponse.data.value && attendanceReportResponse.data.value.length > 0) {
                                const reportId = attendanceReportResponse.data.value[0].id;
                                console.log('\n👥 Attendance Report:');

                                const attendanceRecordsResponse: AxiosResponse<AttendanceRecordsResponse> = await axios.get(
                                    `https://graph.microsoft.com/v1.0/users/${targetUser.id}/onlineMeetings/${base64MeetingId}/attendanceReports/${reportId}/attendanceRecords`,
                                    { headers }
                                );

                                if (attendanceRecordsResponse.data.value) {
                                    for (const record of attendanceRecordsResponse.data.value) {
                                        const userName = record.identity?.displayName || 'Unknown User';
                                        const emailAddress = record.emailAddress || 'No Email Address';
                                        console.log(`   • ${userName}`);
                                        console.log(`     Email: ${emailAddress}`);
                                        console.log(`     Duration: ${formatDuration(record.totalAttendanceInSeconds)}`);
                                    }
                                } else {
                                    console.log('ℹ️ No attendance records found');
                                }
                            } else {
                                console.log('ℹ️ No attendance report available');
                            }
                        } catch (error) {
                            console.log('ℹ️ Could not retrieve attendance data');
                        }
                    } else {
                        console.log('ℹ️ Not a Teams meeting');
                    }
                    console.log('-'.repeat(80));
                }
            } else {
                console.log('ℹ️ No meetings found in the last 7 days');
            }
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                console.error('❌ User not found. Please check the email address and permissions');
            } else {
                console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
            }
        }
    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    }
}

main(); 