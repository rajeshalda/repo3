const axios = require('axios');

// Configuration details
const config = {
    tenantId: "a5ae9ae1-3c47-4b70-b92c-ac3a0efffc6a",
    clientId: "9ec41cd0-ae8c-4dd5-bc84-a3aeea4bda54",
    clientSecret: "r~v8Q~tlraKa35.23OEBjHFpebqEcgEYRDIp8az_",
    targetUserId: "vijay@M365x65088219.onmicrosoft.com"
};

// Helper function to format duration in seconds to readable format
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (remainingSeconds > 0) parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);

    return parts.join(' ');
}

// Helper function to format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Helper function to get access token for application authentication
async function getApplicationAccessToken(tenantId, clientId, clientSecret) {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default'
    });

    try {
        const response = await axios.post(tokenUrl, params);
        return response.data.access_token;
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
        throw error;
    }
}

async function main() {
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
            const userResponse = await axios.get(
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

            const meetingsResponse = await axios.get(meetingsUrl, { headers });
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
                        let meetingId, organizerOid;

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
                            const attendanceReportResponse = await axios.get(
                                `https://graph.microsoft.com/v1.0/users/${targetUser.id}/onlineMeetings/${base64MeetingId}/attendanceReports`,
                                { headers }
                            );

                            if (attendanceReportResponse.data.value && attendanceReportResponse.data.value.length > 0) {
                                const reportId = attendanceReportResponse.data.value[0].id;
                                console.log('\n👥 Attendance Report:');

                                const attendanceRecordsResponse = await axios.get(
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
            if (error.response && error.response.status === 404) {
                console.error('❌ User not found. Please check the email address and permissions');
            } else {
                console.error('❌ Error:', error.message);
            }
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main(); 