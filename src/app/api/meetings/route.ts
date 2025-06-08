import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getAppGraphToken } from '@/lib/graph-app-auth';
import { PostedMeetingsStorage } from '@/lib/posted-meetings-storage';
import { IST_TIMEZONE } from '@/lib/utils';
import { AIAgentPostedMeetingsStorage } from '@/ai-agent/services/storage/posted-meetings';
import path from 'path';
import fs from 'fs/promises';

// Add session type
interface ExtendedSession {
  user?: {
    email?: string | null;
    accessToken?: string;
  };
}

interface GraphMeeting {
  id: string;
  subject: string;
  start: {
    dateTime: string;
  };
  end: {
    dateTime: string;
  };
  onlineMeeting?: {
    joinUrl: string;
  };
  bodyPreview: string;
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    }
  };
  seriesMasterId?: string;
  type?: string;
}

interface AttendanceInterval {
  joinDateTime: string;
  leaveDateTime: string;
  durationInSeconds: number;
}

interface RawAttendanceRecord {
  id: string;
  emailAddress: string;
  totalAttendanceInSeconds: number;
  role: string;
  identity: {
    id: string;
    displayName: string;
    tenantId: string;
  };
  attendanceIntervals: AttendanceInterval[];
  reportId?: string;
}

interface AttendanceRecord {
  name: string;
  email: string;
  duration: number;
  intervals: AttendanceInterval[];
  rawRecord: RawAttendanceRecord;
}

interface MeetingData {
  subject: string;
  startTime: string;
  endTime: string;
  isTeamsMeeting: boolean;
  meetingInfo: ReturnType<typeof extractMeetingInfo> | null;
  attendanceRecords: AttendanceRecord[];
  rawData: GraphMeeting;
  isRecurring: boolean;
  seriesMasterId: string | null;
}

async function getAttendanceReport(organizerId: string, meetingId: string, instanceDate?: string) {
  try {
    console.log('Fetching attendance for meeting:', {
      organizerId,
      meetingId,
      instanceDate
    });
    
    // Get app-level token instead of using user's token
    const appToken = await getAppGraphToken();
    
    // Get attendance reports - use the same URL format as AI agent
    const reportsUrl = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports`;
    console.log('Fetching attendance reports from:', reportsUrl);
    
    const reportsResponse = await fetch(reportsUrl, {
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!reportsResponse.ok) {
      const errorText = await reportsResponse.text();
      console.error('Error fetching attendance reports:', {
        status: reportsResponse.status,
        statusText: reportsResponse.statusText,
        body: errorText
      });
      return null;
    }
    
    const reportsData = await reportsResponse.json();
    console.log('Reports Data:', JSON.stringify(reportsData, null, 2));
    
    if (!reportsData.value || reportsData.value.length === 0) {
      console.log('No attendance reports found for the meeting');
      return null;
    }

    // For recurring meetings, we need to fetch all reports
    const allAttendanceRecords: RawAttendanceRecord[] = [];
    
    // Process all reports, not just the first one
    for (const report of reportsData.value) {
      console.log('Processing report:', {
        reportId: report.id,
        meetingStart: report.meetingStartDateTime,
        meetingEnd: report.meetingEndDateTime
      });

      const recordsUrl = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports/${report.id}/attendanceRecords`;
      console.log('Fetching attendance records from:', recordsUrl);
      
      const recordsResponse = await fetch(recordsUrl, {
        headers: {
          Authorization: `Bearer ${appToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!recordsResponse.ok) {
        console.error('Error fetching attendance records for report:', report.id);
        continue; // Continue with next report if this one fails
      }
      
      const recordsData = await recordsResponse.json();
      
      if (recordsData.value && recordsData.value.length > 0) {
        // Add each record with its reportId without merging
        for (const record of recordsData.value) {
          // Add reportId to each record for deduplication
          record.reportId = report.id;
          
          // Don't merge - treat each reportId as a separate record
          // Add as a new record
          allAttendanceRecords.push(record);
        }
      }
    }

    console.log('Combined all attendance records:', {
      totalRecords: allAttendanceRecords.length,
      totalReports: reportsData.value.length
    });

    // If instanceDate is provided (for recurring meetings), filter the intervals
    if (instanceDate) {
      console.log('Filtering attendance records for date:', instanceDate);
      
      const filteredRecords = allAttendanceRecords.map(record => {
        // Filter intervals for the specific date
        const dateSpecificIntervals = record.attendanceIntervals.filter(interval => {
          const intervalDate = new Date(interval.joinDateTime).toISOString().split('T')[0];
          const matches = intervalDate === instanceDate;
          console.log('Interval comparison:', {
            email: record.emailAddress,
            intervalDate,
            instanceDate,
            matches,
            joinTime: interval.joinDateTime,
            leaveTime: interval.leaveDateTime
          });
          return matches;
        });

        // Recalculate total duration based on filtered intervals
        const totalDuration = dateSpecificIntervals.reduce((sum, interval) => 
          sum + interval.durationInSeconds, 0);

        console.log('Filtered record:', {
          email: record.emailAddress,
          originalIntervals: record.attendanceIntervals.length,
          filteredIntervals: dateSpecificIntervals.length,
          originalDuration: record.totalAttendanceInSeconds,
          newDuration: totalDuration,
          date: instanceDate
        });

        return {
          ...record,
          attendanceIntervals: dateSpecificIntervals,
          totalAttendanceInSeconds: totalDuration
        };
      });

      // Only return records that have intervals for this date
      return filteredRecords.filter(record => record.attendanceIntervals.length > 0);
    }
    
    return allAttendanceRecords;
  } catch (error) {
    console.error('Error in getAttendanceReport:', error);
    return null;
  }
}

function extractMeetingInfo(joinUrl: string, bodyPreview: string) {
  console.log('Extracting from:', { joinUrl, bodyPreview });
  
  // Initialize with null values
  let meetingId = null;
  let threadId = null;
  let organizerId = null;
  
  try {
    // Decode the URL first (safely)
    const decodedUrl = decodeURIComponent(joinUrl);
    console.log('Decoded URL:', decodedUrl);
    
    // Extract thread ID from join URL using improved regex
    const threadMatch = decodedUrl.match(/19:meeting_([^@]+)@thread\.v2/);
    if (threadMatch) {
      threadId = threadMatch[1];
      console.log('Extracted Thread ID:', threadId);
    }
    
    // Extract organizer ID from join URL
    const organizerMatch = decodedUrl.match(/"Oid":"([^"]+)"/);
    if (organizerMatch) {
      organizerId = organizerMatch[1];
      console.log('Extracted Organizer ID:', organizerId);
    }
    
    // Try multiple patterns to extract meeting ID from body preview
    // First try the standard "Meeting ID: 123 456 789 101" format
    let meetingIdMatch = bodyPreview.match(/Meeting ID: (\d{3} \d{3} \d{3} \d{3})/);
    if (meetingIdMatch) {
      meetingId = meetingIdMatch[1].replace(/\s/g, '');
    } else {
      // Try alternate format "Meeting ID: 123456789"
      meetingIdMatch = bodyPreview.match(/Meeting ID: (\d+)/);
      if (meetingIdMatch) {
        meetingId = meetingIdMatch[1];
      }
    }
    
    // Fallback: If no meetingId found and we have threadId, use the thread as meeting ID
    // This aligns better with how the AI agent works
    if (!meetingId && threadId) {
      meetingId = `19:meeting_${threadId}@thread.v2`;
      console.log('Using thread as meeting ID fallback');
    }
    
  } catch (error) {
    console.error('Error extracting meeting info:', error);
  }
  
  const result: {
    meetingId: string | null;
    threadId: string | null;
    organizerId: string | null;
    graphId?: string;
    reportId?: string;
    rawJoinUrl: string;
    rawBodyPreview: string;
  } = { 
    meetingId, 
    threadId, 
    organizerId,
    // Add raw data for debugging
    rawJoinUrl: joinUrl,
    rawBodyPreview: bodyPreview
  };
  
  console.log('Extracted Meeting Info:', JSON.stringify(result, null, 2));
  return result;
}

async function getMeetings(accessToken: string, startDate: Date, endDate: Date) {
  // Don't add extra day - frontend already sends properly formatted end date (23:59:59.999)
  console.log('Fetching meetings with date range:', {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString()
  });

  let allMeetings: any[] = [];
  // Using calendarView endpoint instead of events to properly handle recurring meetings
  let nextLink = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}&$select=id,subject,start,end,onlineMeeting,bodyPreview,organizer,type,seriesMasterId`;

  while (nextLink) {
    console.log('Fetching from:', nextLink);
    const response = await fetch(nextLink, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
        // Remove timezone preference - let the API use UTC and we'll handle timezone conversion
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Graph API Error:', errorData);
      throw new Error(`Failed to fetch meetings: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.value?.length || 0} meetings in this batch`);
    
    // Add debug logging for recurring meetings
    data.value?.forEach((meeting: any) => {
      if (meeting.seriesMasterId) {
        console.log('Found recurring meeting instance:', {
          subject: meeting.subject,
          start: meeting.start.dateTime,
          seriesMasterId: meeting.seriesMasterId,
          type: meeting.type
        });
      }
    });

    allMeetings = [...allMeetings, ...data.value];
    nextLink = data['@odata.nextLink'] || '';
  }

  console.log('Total meetings fetched:', allMeetings.length);
  
  // Fetch attendance for each meeting
  const meetingsWithAttendance = await Promise.all(
    allMeetings.map(async (meeting: GraphMeeting) => {
      // Log the raw meeting data for debugging
      console.log('Processing meeting:', {
        subject: meeting.subject,
        start: meeting.start.dateTime,
        id: meeting.id,
        bodyPreview: meeting.bodyPreview?.substring(0, 50) + '...',
        hasOnlineMeeting: !!meeting.onlineMeeting,
        isRecurring: !!meeting.seriesMasterId
      });

      const baseMeetingData: MeetingData = {
        subject: meeting.subject,
        startTime: meeting.start.dateTime,
        endTime: meeting.end.dateTime,
        isTeamsMeeting: false,
        meetingInfo: null,
        attendanceRecords: [],
        rawData: meeting,
        isRecurring: !!meeting.seriesMasterId,
        seriesMasterId: meeting.seriesMasterId || null
      };

      if (meeting.onlineMeeting) {
        baseMeetingData.isTeamsMeeting = true;
        const meetingInfo = extractMeetingInfo(
          meeting.onlineMeeting.joinUrl,
          meeting.bodyPreview
        );
        
        // Add the Graph API ID to the meetingInfo
        meetingInfo.graphId = meeting.id;
        console.log('Added Graph API ID to meetingInfo:', meeting.id);
        
        baseMeetingData.meetingInfo = meetingInfo;

        if (meetingInfo.threadId && meetingInfo.organizerId) {
          // Build the formatted string exactly like the AI agent does
          const formattedString = `1*${meetingInfo.organizerId}*0**19:meeting_${meetingInfo.threadId}@thread.v2`;
          const base64MeetingId = Buffer.from(formattedString).toString('base64');
          
          console.log('Attempting to fetch attendance with:', {
            organizerId: meetingInfo.organizerId,
            threadId: meetingInfo.threadId,
            graphId: meetingInfo.graphId,
            formattedString,
            base64MeetingId,
            isRecurring: baseMeetingData.isRecurring,
            instanceDate: baseMeetingData.isRecurring ? new Date(meeting.start.dateTime).toISOString().split('T')[0] : undefined
          });

          // For recurring meetings, pass the specific instance date
          const instanceDate = baseMeetingData.isRecurring ? 
            new Date(meeting.start.dateTime).toISOString().split('T')[0] : 
            undefined;

          const attendanceRecords = await getAttendanceReport(
            meetingInfo.organizerId,
            base64MeetingId,
            instanceDate
          );
          
          if (attendanceRecords && attendanceRecords.length > 0) {
            // Group attendance records by reportId
            const recordsByReportId = new Map<string, RawAttendanceRecord[]>();
            
            attendanceRecords.forEach((record: RawAttendanceRecord) => {
              const reportId = record.reportId || 'no-report';
              if (!recordsByReportId.has(reportId)) {
                recordsByReportId.set(reportId, []);
              }
              recordsByReportId.get(reportId)!.push(record);
            });
            
            // Create separate meeting instances for each report ID
            const meetingInstances: MeetingData[] = [];
            
            for (const [reportId, records] of recordsByReportId.entries()) {
              const meetingInstance = {
                ...baseMeetingData,
                meetingInfo: {
                  ...meetingInfo,
                  reportId: reportId
                },
                attendanceRecords: records.map((record: RawAttendanceRecord) => ({
                  name: record.identity?.displayName || 'Unknown',
                  email: record.emailAddress || '',
                  duration: record.totalAttendanceInSeconds,
                  intervals: record.attendanceIntervals || [],
                  rawRecord: record
                }))
              };
              
              meetingInstances.push(meetingInstance);
            }
            
            return meetingInstances;
          }
        } else {
          console.log('Skipping attendance fetch - missing threadId or organizerId:', meetingInfo);
        }
      }

      return [baseMeetingData];
    })
  );

  // Flatten the array since we now return arrays of meeting instances
  const flattenedMeetings = meetingsWithAttendance.flat();

  return {
    totalMeetings: flattenedMeetings.length,
    timeRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    meetings: flattenedMeetings
  };
}

// Helper function to format date in IST
function formatToIST(date: Date): string {
    console.log('\n=== TIME CONVERSION DEBUG ===');
    console.log('Input UTC Date:', date.toISOString());
    
    // Add 5 hours and 30 minutes to convert to IST
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    console.log('After adding 5:30 hours:', istDate.toISOString());
    
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };

    const formattedDate = new Intl.DateTimeFormat('en-IN', options).format(istDate);
    const finalResult = formattedDate + ' IST';
    console.log('Formatted IST result:', finalResult);
    console.log('===========================\n');
    return finalResult;
}

// Helper function to convert UTC to IST
function convertToIST(utcTimeString: string): string {
    console.log('\n=== UTC STRING CONVERSION DEBUG ===');
    console.log('Input UTC string:', utcTimeString);
    const utcDate = new Date(utcTimeString);
    console.log('Parsed as Date:', utcDate.toISOString());
    const result = formatToIST(utcDate);
    console.log('Final IST result:', result);
    console.log('================================\n');
    return result;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession;
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse date range from query parameters
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'Date range is required' }, { status: 400 });
    }

    // Parse the dates - they should already be properly formatted from frontend
    const startDate = new Date(from);
    const endDate = new Date(to);
    
    // Don't modify the dates - they should already have proper time boundaries from frontend

    console.log('\n=== DATE RANGE DEBUG ===');
    console.log('Original from:', from);
    console.log('Original to:', to);
    console.log('Start date with time:', startDate.toISOString());
    console.log('End date with time:', endDate.toISOString());
    console.log('======================\n');

    // Get access token
    const accessToken = session.user.accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    // Get meetings data
    const meetingsData = await getMeetings(accessToken, startDate, endDate);

    // Filter meetings by date range
    const dateFilteredMeetings = meetingsData.meetings.filter(meeting => {
        const meetingDate = new Date(meeting.startTime);
        return meetingDate >= startDate && meetingDate <= endDate;
    });

    console.log(`\nFiltered ${meetingsData.meetings.length} meetings to ${dateFilteredMeetings.length} within date range`);
    if (meetingsData.meetings.length !== dateFilteredMeetings.length) {
        console.log(`\n⚠️ WARNING: ${meetingsData.meetings.length - dateFilteredMeetings.length} meetings were filtered out for being outside the requested date range`);
    }

    // Get posted meetings storage - use AI agent storage instead of old manual storage
    // This will ensure we check against the same storage that AI agent uses
    const aiAgentStorage = new AIAgentPostedMeetingsStorage();
    await aiAgentStorage.loadData();
    
    // Access the data directly from file
    const filePath = path.join(process.cwd(), 'src/ai-agent/data/storage/json/ai-agent-meetings.json');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const aiAgentData = JSON.parse(fileContent);
    const aiPostedMeetings = aiAgentData.meetings || [];
    
    // Filter meetings for current user
    const userEmail = session.user?.email || '';
    const userPostedMeetings = aiPostedMeetings.filter((m: { userId: string }) => m.userId === userEmail);
    
    console.log('\n==== MEETINGS FILTERING DEBUG ====');
    console.log(`User Email: ${userEmail}`);
    console.log(`Total meetings fetched: ${dateFilteredMeetings.length}`);
    console.log(`Total posted meetings for user: ${userPostedMeetings.length}`);
    
    console.log('\nProcessing current meetings:');
    const filteredMeetings = [];
    for (const meeting of dateFilteredMeetings) {
        // Check if meeting is already posted using meetingId format
        const meetingId = meeting.meetingInfo?.meetingId || `${userEmail.toLowerCase()}_${meeting.subject}_${meeting.startTime}`;
        
        // Get user duration to check for recurring meetings with different durations
        let userDuration = 0;
        if (meeting.attendanceRecords?.length && userEmail) {
            const userRecord = meeting.attendanceRecords.find(record => 
                record.email.toLowerCase() === userEmail.toLowerCase()
            );
            userDuration = userRecord?.duration || 0;
        }
        
        // Check if meeting is already posted in AI agent storage
        // First get all meetings with the same ID - we'll use AIAgentPostedMeetingsStorage directly
        const storage = new AIAgentPostedMeetingsStorage();
        await storage.loadData();
        
        // Use the enhanced isPosted method that considers both duration and startTime
        const isPosted = await storage.isPosted(userEmail, meetingId, userDuration, meeting.startTime);
        
        console.log('Meeting:', meeting.subject, 'ID:', meetingId, 'Duration:', userDuration, 'Is Posted:', isPosted);
        
        if (!isPosted) {
            console.log('Adding to filtered meetings list');
            // Add isPosted flag to meeting object
            filteredMeetings.push({
                ...meeting,
                isPosted: false
            });
        } else {
            // Mark as posted if it is already in storage
            filteredMeetings.push({
                ...meeting,
                isPosted: true
            });
        }
    }

    console.log('\n=== FINAL RESPONSE DEBUG ===');
    console.log('Time range:', {
        fromIST: convertToIST(startDate.toISOString()),
        toIST: convertToIST(endDate.toISOString()),
        fromUTC: startDate.toISOString(),
        toUTC: endDate.toISOString()
    });
    console.log('First meeting times (if any):', filteredMeetings[0] ? {
        subject: filteredMeetings[0].subject,
        displayStartTime: convertToIST(filteredMeetings[0].startTime),
        displayEndTime: convertToIST(filteredMeetings[0].endTime)
    } : 'No meetings');
    console.log('===========================\n');

    return NextResponse.json({
      total: filteredMeetings.length,
      timeRange: {
        from: convertToIST(startDate.toISOString()),
        to: convertToIST(endDate.toISOString()),
        fromUTC: startDate.toISOString(),
        toUTC: endDate.toISOString()
      },
      meetings: filteredMeetings,
      totalMeetingsInPeriod: dateFilteredMeetings.length,
      totalTimeInPeriod: dateFilteredMeetings.reduce((acc, meeting) => {
        const userEmail = session?.user?.email;
        if (meeting.attendanceRecords?.length && userEmail) {
          const userRecord = meeting.attendanceRecords.find(record => 
            record.email.toLowerCase() === userEmail.toLowerCase()
          );
          return acc + (userRecord?.duration || 0);
        }
        return acc;
      }, 0)
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
}