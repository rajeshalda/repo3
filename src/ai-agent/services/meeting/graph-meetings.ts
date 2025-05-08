import axios, { AxiosResponse } from 'axios';

// Configuration for Microsoft Graph API
interface GraphAPIConfig {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    targetUserId: string;
}

// Initialize configuration from environment variables
const graphConfig: GraphAPIConfig = {
    tenantId: process.env.MICROSOFT_GRAPH_TENANT_ID || '',
    clientId: process.env.MICROSOFT_GRAPH_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET || '',
    targetUserId: process.env.MICROSOFT_GRAPH_TARGET_USER_ID || ''
};

interface User {
    id: string;
    displayName: string;
    userPrincipalName: string;
}

interface MeetingsResponse {
    value: Array<{
        subject: string;
        start: { dateTime: string };
        end: { dateTime: string };
        bodyPreview?: string;
        onlineMeeting?: {
            joinUrl: string;
        };
    }>;
}

// Helper function to format date
function formatDate(dateString: string): string {
    return new Date(dateString).toISOString();
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
            graphConfig.tenantId,
            graphConfig.clientId,
            graphConfig.clientSecret
        );
        const headers = { Authorization: `Bearer ${accessToken}` };
        console.log('🔐 Successfully authenticated\n');

        // Step 1: Get user information
        const encodedUserId = encodeURIComponent(graphConfig.targetUserId);
        console.log(`👤 Getting meetings for: ${graphConfig.targetUserId}`);
        
        try {
            const userResponse: AxiosResponse<User> = await axios.get(
                `https://graph.microsoft.com/v1.0/users/${encodedUserId}`,
                { headers }
            );
            const targetUser = userResponse.data;

            // Step 2: Get meetings for the current day in UTC
            const now = new Date();
            
            // Start of day in UTC (00:00:00)
            const startDate = new Date(now);
            startDate.setUTCHours(0, 0, 0, 0);
            
            // End of day in UTC (23:59:59)
            const endDate = new Date(now);
            endDate.setUTCHours(23, 59, 59, 999);

            const startDateString = startDate.toISOString();
            const endDateString = endDate.toISOString();
            console.log(`📅 Retrieving meetings for today (UTC): ${formatDate(startDateString)} to ${formatDate(endDateString)}\n`);

            const filter = encodeURIComponent(
                `start/dateTime ge '${startDateString}' and end/dateTime le '${endDateString}'`
            );
            const meetingsUrl = `https://graph.microsoft.com/v1.0/users/${targetUser.id}/events?$filter=${filter}&$select=subject,start,end,onlineMeeting,onlineMeetingUrl,bodyPreview`;

            const meetingsResponse: AxiosResponse<MeetingsResponse> = await axios.get(meetingsUrl, { headers });
            const meetings = meetingsResponse.data.value;

            if (meetings && meetings.length > 0) {
                console.log(`📊 Found ${meetings.length} meeting${meetings.length !== 1 ? 's' : ''} (UTC)\n`);
                console.log('=' .repeat(80));

                for (const meeting of meetings) {
                    console.log(`\n📌 Meeting: ${meeting.subject}`);
                    console.log(`🕒 UTC Time: ${formatDate(meeting.start.dateTime)} - ${formatDate(meeting.end.dateTime)}`);

                    if (meeting.bodyPreview) {
                        console.log(`📝 Description: ${meeting.bodyPreview}`);
                    }

                    // ... rest of the code remains the same ...
                }
            }
        } catch (error) {
            console.error('Error getting meetings:', error);
        }
    } catch (error) {
        console.error('Error:', error);
    }
} 