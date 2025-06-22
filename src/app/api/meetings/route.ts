import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getAppGraphToken } from '@/lib/graph-app-auth';
import { PostedMeetingsStorage } from '@/lib/posted-meetings-storage';
import { IST_TIMEZONE } from '@/lib/utils';
import { AIAgentPostedMeetingsStorage } from '@/ai-agent/services/storage/posted-meetings';
import { database } from '@/lib/database';
import { 
  convertDateRangeToUTC, 
  isMeetingInISTDateRange, 
  formatToIST as formatToISTNew,
  filterAttendanceByISTDate,
  filterMeetingsByISTDate 
} from '@/lib/timezone-utils';
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
        // Add each record with its reportId and meetingStartDateTime without merging
        for (const record of recordsData.value) {
          // Add reportId and meetingStartDateTime to each record for filtering
          record.reportId = report.id;
          record.meetingStartDateTime = report.meetingStartDateTime;
          record.meetingEndDateTime = report.meetingEndDateTime;
          
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

    // If instanceDate is provided (for recurring meetings), filter the intervals with IST date matching
    if (instanceDate) {
      console.log('Filtering attendance records for IST date:', instanceDate);
      
      const filteredRecords = allAttendanceRecords.map(record => {
        // Filter intervals using IST timezone conversion instead of UTC
        const dateSpecificIntervals = record.attendanceIntervals.filter(interval => {
          const joinTime = new Date(interval.joinDateTime);
          
          // Convert UTC time to IST for proper date comparison
          const joinTimeIST = new Date(joinTime.getTime() + (5.5 * 60 * 60 * 1000));
          const intervalDateIST = joinTimeIST.toISOString().split('T')[0];
          
          // Match against IST date, not UTC date
          const istDateMatch = intervalDateIST === instanceDate;
          
          console.log('IST interval comparison:', {
            email: record.emailAddress,
            intervalDateUTC: joinTime.toISOString().split('T')[0],
            intervalDateIST,
            instanceDate,
            istDateMatch,
            joinTime: interval.joinDateTime,
            leaveTime: interval.leaveDateTime
          });
          
          return istDateMatch;
        });

        // Recalculate total duration based on filtered intervals
        const totalDuration = dateSpecificIntervals.reduce((sum, interval) => 
          sum + interval.durationInSeconds, 0);

        console.log('IST filtered record:', {
          email: record.emailAddress,
          originalIntervals: record.attendanceIntervals.length,
          filteredIntervals: dateSpecificIntervals.length,
          originalDuration: record.totalAttendanceInSeconds,
          newDuration: totalDuration,
          targetDate: instanceDate
        });

        return {
          ...record,
          attendanceIntervals: dateSpecificIntervals,
          totalAttendanceInSeconds: totalDuration
        };
      });

      // Only return records that have intervals for this exact IST date
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

async function getMeetings(accessToken: string, startDate: Date, endDate: Date, istDateRange?: {startISTDate: string, endISTDate: string}) {
  // Use the properly calculated IST dates if provided, otherwise fallback to old method
  let startViewingDate: string;
  let endViewingDate: string;
  
  if (istDateRange) {
    startViewingDate = istDateRange.startISTDate;
    endViewingDate = istDateRange.endISTDate;
  } else {
    // Fallback to old calculation method
  const startIST = new Date(startDate.getTime() + (5.5 * 60 * 60 * 1000));
  const endIST = new Date(endDate.getTime() + (5.5 * 60 * 60 * 1000));
    startViewingDate = startIST.toISOString().split('T')[0];
    endViewingDate = endIST.toISOString().split('T')[0];
  }
  
  const isMultiDayRange = startViewingDate !== endViewingDate;
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

      // Convert Microsoft Graph date format to standard ISO format
      const cleanStartTime = meeting.start.dateTime.includes('.0000000') 
        ? meeting.start.dateTime.replace('.0000000', '.000Z')
        : meeting.start.dateTime.endsWith('Z') ? meeting.start.dateTime : meeting.start.dateTime + 'Z';
      
      const cleanEndTime = meeting.end.dateTime.includes('.0000000')
        ? meeting.end.dateTime.replace('.0000000', '.000Z') 
        : meeting.end.dateTime.endsWith('Z') ? meeting.end.dateTime : meeting.end.dateTime + 'Z';

      const baseMeetingData: MeetingData = {
        subject: meeting.subject,
        startTime: cleanStartTime,
        endTime: cleanEndTime,
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
          
          // For recurring meetings, use the specific meeting instance date for filtering attendance records
          // This ensures that each recurring meeting instance only shows attendance from its own date
          let instanceDateForFiltering: string | undefined;
          if (baseMeetingData.isRecurring) {
            // For recurring meetings, always use the specific instance date for filtering
            // Convert meeting's start time to IST date to match attendance records
            const meetingUTCDate = new Date(baseMeetingData.startTime);
            const meetingISTDate = new Date(meetingUTCDate.getTime() + (5.5 * 60 * 60 * 1000));
            instanceDateForFiltering = meetingISTDate.toISOString().split('T')[0]; // YYYY-MM-DD
            
            console.log('Setting instance date for recurring meeting:', {
              meetingSubject: baseMeetingData.subject,
              meetingUTCTime: baseMeetingData.startTime,
              meetingISTTime: meetingISTDate.toISOString(),
              instanceDateForFiltering
            });
          } else {
            // Non-recurring meetings don't need instance date filtering
            instanceDateForFiltering = undefined;
          }

          console.log('Attempting to fetch attendance with:', {
            organizerId: meetingInfo.organizerId,
            threadId: meetingInfo.threadId,
            graphId: meetingInfo.graphId,
            formattedString,
            base64MeetingId,
            isRecurring: baseMeetingData.isRecurring,
            isMultiDayRange: isMultiDayRange,
            startViewingDate: startViewingDate,
            endViewingDate: endViewingDate,
            instanceDate: instanceDateForFiltering
          });

          const attendanceRecords = await getAttendanceReport(
            meetingInfo.organizerId,
            base64MeetingId,
            instanceDateForFiltering
          );
          
          if (attendanceRecords && attendanceRecords.length > 0) {
            // First, filter out attendance records that don't belong to the requested IST date range
            // We need to check the meetingStartDateTime of each attendance report
            const filteredAttendanceRecords = attendanceRecords.filter((record: RawAttendanceRecord) => {
              if (!record.reportId) return true; // Keep records without reportId for safety
              
              // Get the attendance report's meetingStartDateTime from the rawRecord
              const attendanceStartTime = (record as any).meetingStartDateTime;
              if (!attendanceStartTime) return true; // Keep if no start time info
              
              try {
                // Convert attendance start time to IST date
                const attendanceUTC = new Date(attendanceStartTime);
                const attendanceIST = new Date(attendanceUTC.getTime() + (5.5 * 60 * 60 * 1000));
                const attendanceISTDate = attendanceIST.toISOString().split('T')[0];
                
                // Check if this attendance session belongs to our requested date range
                const belongsToDateRange = attendanceISTDate >= startViewingDate && attendanceISTDate <= endViewingDate;
                
                console.log('🕐 ATTENDANCE REPORT DATE FILTER:', {
                  reportId: record.reportId,
                  attendanceStartTime,
                  attendanceISTDate,
                  requestedRange: `${startViewingDate} to ${endViewingDate}`,
                  belongsToDateRange
                });
                
                return belongsToDateRange;
              } catch (error) {
                console.error('Error filtering attendance record:', error);
                return true; // Keep on error for safety
              }
            });
            
            console.log(`📊 ATTENDANCE FILTERING: ${attendanceRecords.length} total reports, ${filteredAttendanceRecords.length} after IST date filtering`);
            
            // Group filtered attendance records by reportId
            const recordsByReportId = new Map<string, RawAttendanceRecord[]>();
            
            filteredAttendanceRecords.forEach((record: RawAttendanceRecord) => {
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
                  intervals: (record.attendanceIntervals || []).map(interval => ({
                    joinDateTime: interval.joinDateTime,
                    leaveDateTime: interval.leaveDateTime,
                    durationInSeconds: interval.durationInSeconds
                  })),
                  rawRecord: record
                }))
              };
              
              meetingInstances.push(meetingInstance);
            }
            
            return meetingInstances;
          } else {
            // No attendance records found - include meeting with empty attendance
            console.log('No attendance records found for meeting:', meeting.subject);
            baseMeetingData.attendanceRecords = [];
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
    
    // Use Intl.DateTimeFormat with IST timezone instead of manual offset calculation
    // This is more reliable and handles DST automatically
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
    };

    const formattedDate = new Intl.DateTimeFormat('en-IN', options).format(date);
    const finalResult = formattedDate + ' IST';
    console.log('Formatted IST result:', finalResult);
    console.log('===========================\n');
    return finalResult;
}

// Helper function to convert UTC to IST but keep as UTC ISO string for frontend
function convertToISTISOString(utcTimeString: string): string {
    console.log('\n=== UTC TO IST ISO CONVERSION DEBUG ===');
    console.log('Input UTC string:', utcTimeString);
    
    // Handle Microsoft Graph date format (2025-06-08T18:30:00.0000000)
    // Remove extra zeros and ensure proper ISO format
    let cleanedDateString = utcTimeString;
    if (utcTimeString.includes('.0000000')) {
        cleanedDateString = utcTimeString.replace('.0000000', '.000Z');
    } else if (!utcTimeString.endsWith('Z') && !utcTimeString.includes('+')) {
        // If no timezone info, assume it's UTC
        cleanedDateString = utcTimeString + 'Z';
    }
    
    console.log('Cleaned date string:', cleanedDateString);
    const utcDate = new Date(cleanedDateString);
    console.log('Parsed as Date:', utcDate.toISOString());
    
    // Convert to IST by adding 5.5 hours, but return as UTC ISO string
    // This way frontend will display the correct IST time
    const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
    
    // Format as if it's UTC but it's actually IST time
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
    const ms = String(istDate.getUTCMilliseconds()).padStart(3, '0');
    
    const istAsUTCString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`;
    
    console.log('IST time as UTC ISO result:', istAsUTCString);
    console.log('================================\n');
    return istAsUTCString;
}

// Helper function to convert UTC to IST
function convertToIST(utcTimeString: string): string {
    console.log('\n=== UTC STRING CONVERSION DEBUG ===');
    console.log('Input UTC string:', utcTimeString);
    
    // Handle Microsoft Graph date format (2025-06-08T18:30:00.0000000)
    // Remove extra zeros and ensure proper ISO format
    let cleanedDateString = utcTimeString;
    if (utcTimeString.includes('.0000000')) {
        cleanedDateString = utcTimeString.replace('.0000000', '.000Z');
    } else if (!utcTimeString.endsWith('Z') && !utcTimeString.includes('+')) {
        // If no timezone info, assume it's UTC
        cleanedDateString = utcTimeString + 'Z';
    }
    
    console.log('Cleaned date string:', cleanedDateString);
    const utcDate = new Date(cleanedDateString);
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

    // Parse the dates and properly convert to UTC using our timezone utilities
    const startDate = new Date(from);
    const endDate = new Date(to);
    
    // Use proper timezone conversion
    const utcRange = convertDateRangeToUTC({ from: startDate, to: endDate });
    if (!utcRange) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }

    // Use the corrected UTC range for Graph API calls
    const correctedStartDate = new Date(utcRange.start);
    const correctedEndDate = new Date(utcRange.end);

    // Get the IST date range for strict filtering
    const startISTDate = formatToISTNew(utcRange.start, 'yyyy-MM-dd').replace(/ IST$/, ''); // Remove IST suffix
    const endISTDate = formatToISTNew(utcRange.end, 'yyyy-MM-dd').replace(/ IST$/, ''); // Remove IST suffix

    // Get access token
    const accessToken = session.user.accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    // For early morning attendance sessions, we need to also check meetings from the previous day
    // Extend the search range backwards by 24 hours to catch meetings from previous day with early morning attendance
    const extendedStartDate = new Date(correctedStartDate.getTime() - (24 * 60 * 60 * 1000)); // 24 hours earlier (full previous day)
    
    console.log('🔍 EXTENDED MEETING SEARCH RANGE:', {
      originalStart: correctedStartDate.toISOString(),
      extendedStart: extendedStartDate.toISOString(),
      endDate: correctedEndDate.toISOString(),
      reason: 'Including full previous day meetings for early morning attendance sessions'
    });

    // Get meetings data using extended UTC range to catch previous day meetings with early morning attendance
    const meetingsData = await getMeetings(accessToken, extendedStartDate, correctedEndDate, {
      startISTDate,
      endISTDate
    });

    console.log('📅 IST DATE RANGE FOR FILTERING:', {
      startISTDate,
      endISTDate,
      utcRangeStart: utcRange.start,
      utcRangeEnd: utcRange.end
    });

    // Enhanced date filtering: Include meetings scheduled on the date OR attended on the date
    console.log('🚀 ENHANCED DATE FILTERING - Including scheduled meetings for the date AND attended meetings');
    const dateFilteredMeetings = meetingsData.meetings.filter(meeting => {
        // Use proper timezone utility for meeting scheduled time
        const meetingUTCDate = new Date(meeting.startTime);
        const meetingISTDate = new Date(meetingUTCDate.getTime() + (5.5 * 60 * 60 * 1000));
        const meetingDateStr = meetingISTDate.toISOString().split('T')[0];
        
        // Check if meeting is scheduled within the requested date range
        const isScheduledInRange = meetingDateStr >= startISTDate && meetingDateStr <= endISTDate;
        
        // Check if meeting has attendance within the requested date range using proper IST conversion
        let hasAttendanceInRange = false;
        if (meeting.attendanceRecords?.length > 0) {
            const userEmail = session?.user?.email;
            if (userEmail) {
                const userRecords = meeting.attendanceRecords.filter((record: AttendanceRecord) => 
                    record.email.toLowerCase() === userEmail.toLowerCase()
                );
                
                // Check ALL intervals for any that fall within the IST date range
                if (userRecords.length > 0) {
                    for (const record of userRecords) {
                        if (record.intervals && record.intervals.length > 0) {
                            for (const interval of record.intervals) {
                                const joinTime = new Date(interval.joinDateTime);
                                // Convert to IST using proper timezone conversion
                                const joinISTDate = new Date(joinTime.getTime() + (5.5 * 60 * 60 * 1000));
                                const joinDateStr = joinISTDate.toISOString().split('T')[0];
                                
                                if (joinDateStr >= startISTDate && joinDateStr <= endISTDate) {
                                    hasAttendanceInRange = true;
                                    break;
                                }
                            }
                            if (hasAttendanceInRange) break;
                        }
                    }
                }
            }
        }
        
        const includeInResults = isScheduledInRange || hasAttendanceInRange;
        
        console.log(`📅 DATE FILTER: ${meeting.subject}`, {
            scheduled: meetingDateStr,
            isScheduledInRange,
            hasAttendanceInRange,
            includeInResults,
            requestedRange: `${startISTDate} to ${endISTDate}`
        });
        
        return includeInResults;
    });

    console.log(`\nFiltered ${meetingsData.meetings.length} meetings to ${dateFilteredMeetings.length} within date range`);
    if (meetingsData.meetings.length !== dateFilteredMeetings.length) {
        console.log(`\n⚠️ WARNING: ${meetingsData.meetings.length - dateFilteredMeetings.length} meetings were filtered out for being outside the requested date range`);
    }

    // Process meetings but avoid incorrect deduplication of separate sessions
    console.log('\n==== PROCESSING MEETINGS (PRESERVING ALL SESSIONS) ====');
    const processedMeetings: MeetingData[] = [];
    
    dateFilteredMeetings.forEach(meeting => {
        const threadId = meeting.meetingInfo?.threadId;
        const reportId = meeting.meetingInfo?.reportId;
        const isRecurring = meeting.isRecurring;
        
        // Create a unique identifier that includes reportId to distinguish different sessions
        const meetingUTCDate = new Date(meeting.startTime);
        const meetingISTDate = new Date(meetingUTCDate.getTime() + (5.5 * 60 * 60 * 1000));
        const meetingDateStr = meetingISTDate.toISOString().split('T')[0];
        
        // Always add the meeting - don't merge different sessions
        processedMeetings.push({ ...meeting });
        
        console.log(`Added meeting: ${meeting.subject}`, {
            threadId: threadId || 'no-thread',
            reportId: reportId || 'no-report',
            isRecurring,
            date: meetingDateStr,
            attendanceRecords: meeting.attendanceRecords?.length || 0,
            hasAttendance: (meeting.attendanceRecords?.length || 0) > 0
        });
    });
    
    console.log(`Total meetings processed: ${processedMeetings.length} (preserving all sessions)`);
    console.log('===============================================\n');

    // Store the original count before processing for the total count display
    const totalMeetingsBeforeProcessing = dateFilteredMeetings.length;

    // Get posted meetings from SQLite database
    const userEmail = session.user?.email || '';
    const userPostedMeetings = database.getMeetingsByUser(userEmail);
    
    console.log('\n==== MEETINGS FILTERING DEBUG ====');
    console.log(`User Email: ${userEmail}`);
    console.log(`Total meetings fetched: ${processedMeetings.length}`);
    console.log(`Total posted meetings for user: ${userPostedMeetings.length}`);
    
    console.log('\nProcessing current meetings:');
    const filteredMeetings = [];
    for (const meeting of processedMeetings) {
        // Check if meeting is already posted using meetingId format
        const meetingId = meeting.meetingInfo?.meetingId || `${userEmail.toLowerCase()}_${meeting.subject}_${meeting.startTime}`;
        
        // Get user duration to check for recurring meetings with different durations
        // Sum ALL user records for this meeting (handles merged meetings with multiple attendance records)
        let userDuration = 0;
        if (meeting.attendanceRecords?.length && userEmail) {
            const userRecords = meeting.attendanceRecords.filter(record => 
                record.email.toLowerCase() === userEmail.toLowerCase()
            );
            userDuration = userRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
        }
        
        // Check if meeting is already posted in SQLite database
        const isPosted = database.isMeetingPosted(meetingId, userEmail);
        
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

    console.log('\n=== FINAL RESPONSE DEBUG (ATTENDANCE-BASED TIMEZONE) ===');
    console.log('Time range:', {
        fromIST: formatToISTNew(utcRange.start),
        toIST: formatToISTNew(utcRange.end),
        fromUTC: utcRange.start,
        toUTC: utcRange.end
    });
    
    // Debug the first meeting with attendance-based timing
    if (filteredMeetings[0]) {
        const firstMeeting = filteredMeetings[0];
        const userEmail = session?.user?.email;
        let displayTimes = {
            subject: firstMeeting.subject,
            scheduledStartTime: formatToISTNew(firstMeeting.startTime),
            scheduledEndTime: formatToISTNew(firstMeeting.endTime),
            actualAttendanceTime: 'No attendance data'
        };
        
        // Check if this meeting has attendance data
        if (firstMeeting.attendanceRecords && firstMeeting.attendanceRecords.length > 0 && userEmail) {
            const userRecords = firstMeeting.attendanceRecords.filter((record: AttendanceRecord) => 
                record.email.toLowerCase() === userEmail.toLowerCase()
            );
            
            if (userRecords.length > 0 && userRecords[0].intervals && userRecords[0].intervals.length > 0) {
                const earliestJoinTime = userRecords[0].intervals[0].joinDateTime;
                displayTimes.actualAttendanceTime = formatToISTNew(earliestJoinTime);
            }
        }
        
        console.log('First meeting times (attendance-corrected):', displayTimes);
    } else {
        console.log('First meeting times: No meetings');
    }
    console.log('===========================\n');

    return NextResponse.json({
      total: filteredMeetings.length,
      timeRange: {
        from: formatToISTNew(utcRange.start),
        to: formatToISTNew(utcRange.end),
        fromUTC: utcRange.start,
        toUTC: utcRange.end
      },
      meetings: filteredMeetings.map(meeting => {
        // If meeting has attendance records, use the earliest attendance time for display
        // This ensures meetings are shown on the date the user actually attended
        if (meeting.attendanceRecords && meeting.attendanceRecords.length > 0) {
          const userEmail = session?.user?.email;
          if (userEmail) {
            const userRecords = meeting.attendanceRecords.filter((record: AttendanceRecord) => 
              record.email.toLowerCase() === userEmail.toLowerCase()
            );
            
            if (userRecords.length > 0 && userRecords[0].intervals && userRecords[0].intervals.length > 0) {
              // Use the earliest join time as the meeting start time for display
              const earliestJoinTime = userRecords[0].intervals[0].joinDateTime;
              
              // Calculate duration from intervals instead of using scheduled end time
              const totalAttendanceDuration = userRecords.reduce((sum, record) => 
                sum + (record.duration || 0), 0
              );
              
              // Calculate end time based on join time + attendance duration
              const attendanceStartTime = new Date(earliestJoinTime);
              const attendanceEndTime = new Date(attendanceStartTime.getTime() + (totalAttendanceDuration * 1000));
              
              return {
                ...meeting,
                startTime: earliestJoinTime, // Use actual attendance time
                endTime: attendanceEndTime.toISOString(), // Use calculated end time based on attendance
                displayNote: `Attended on ${formatToISTNew(earliestJoinTime, 'dd/MM/yyyy')}`
              };
            }
          }
        }
        
        // Fallback to scheduled time if no attendance data
        return meeting;
      }),
      totalMeetingsInPeriod: totalMeetingsBeforeProcessing,
      totalTimeInPeriod: processedMeetings.reduce((acc: number, meeting: MeetingData) => {
        const userEmail = session?.user?.email;
        if (meeting.attendanceRecords?.length && userEmail) {
          // Sum ALL user records for this meeting (handles merged meetings with multiple attendance records)
          const userRecords = meeting.attendanceRecords.filter((record: AttendanceRecord) => 
            record.email.toLowerCase() === userEmail.toLowerCase()
          );
          const totalUserDuration = userRecords.reduce((sum, record) => sum + (record.duration || 0), 0);
          return acc + totalUserDuration;
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