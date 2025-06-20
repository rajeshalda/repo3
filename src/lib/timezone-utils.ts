import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// Constants
export const IST_TIMEZONE = 'Asia/Kolkata';

interface DateRange {
  from: Date;
  to: Date;
}

interface UTCRange {
  start: string;
  end: string;
  timezone: string;
}

/**
 * Properly convert a date range to UTC for Graph API calls
 * This ensures that when user selects "June 19" in IST, we only get meetings 
 * that actually fall on June 19 in IST timezone
 */
export function convertDateRangeToUTC(dateRange: DateRange | undefined): UTCRange | null {
  if (!dateRange?.from || !dateRange?.to) return null;

  try {
    // Get the date parts from the selected dates (these represent calendar dates in user's context)
    const startYear = dateRange.from.getFullYear();
    const startMonth = dateRange.from.getMonth();
    const startDay = dateRange.from.getDate();
    
    const endYear = dateRange.to.getFullYear();
    const endMonth = dateRange.to.getMonth();
    const endDay = dateRange.to.getDate();

    // Create IST date strings in the format that fromZonedTime expects
    const startDateStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    // Create proper IST date objects for start and end of day
    const startOfDayIST = new Date(`${startDateStr}T00:00:00`);
    const endOfDayIST = new Date(`${endDateStr}T23:59:59.999`);

    console.log('📅 TIMEZONE CONVERSION DEBUG:', {
      inputRange: {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString()
      },
      calendarDates: {
        startCalendar: startDateStr,
        endCalendar: endDateStr
      },
      istDayBoundaries: {
        startOfDayIST: startOfDayIST.toISOString(),
        endOfDayIST: endOfDayIST.toISOString()
      }
    });

    // Convert IST day boundaries to UTC using the proper fromZonedTime function
    // This treats the date objects as if they are in IST timezone and converts to UTC
    const startUTC = fromZonedTime(startOfDayIST, IST_TIMEZONE);
    const endUTC = fromZonedTime(endOfDayIST, IST_TIMEZONE);

    const result = {
      start: startUTC.toISOString(),
      end: endUTC.toISOString(),
      timezone: IST_TIMEZONE
    };

    console.log('✅ PROPER UTC CONVERSION RESULT:', {
      ...result,
      verification: {
        startUTCBackToIST: formatInTimeZone(startUTC, IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz'),
        endUTCBackToIST: formatInTimeZone(endUTC, IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz')
      }
    });

    return result;
  } catch (error) {
    console.error('❌ Error in timezone conversion:', error);
    return null;
  }
}

/**
 * Check if a meeting time falls within the requested IST date range
 * This function ensures meetings are filtered by their IST date, not UTC date
 */
export function isMeetingInISTDateRange(
  meetingUTCTime: string, 
  requestStartUTC: string, 
  requestEndUTC: string
): boolean {
  try {
    // Convert meeting UTC time to IST
    const meetingUTC = parseISO(meetingUTCTime);
    const meetingIST = toZonedTime(meetingUTC, IST_TIMEZONE);
    
    // Convert request boundary UTC times to IST
    const requestStartUTCDate = parseISO(requestStartUTC);
    const requestEndUTCDate = parseISO(requestEndUTC);
    const requestStartIST = toZonedTime(requestStartUTCDate, IST_TIMEZONE);
    const requestEndIST = toZonedTime(requestEndUTCDate, IST_TIMEZONE);

    // Get just the date parts for comparison
    const meetingISTDate = format(meetingIST, 'yyyy-MM-dd');
    const requestStartISTDate = format(requestStartIST, 'yyyy-MM-dd');
    const requestEndISTDate = format(requestEndIST, 'yyyy-MM-dd');

    // Check if meeting IST date falls within the request IST date range
    const isInRange = meetingISTDate >= requestStartISTDate && meetingISTDate <= requestEndISTDate;

    console.log('🕐 MEETING TIME FILTER CHECK:', {
      meetingSubject: 'Meeting', // Will be provided by caller
      meetingUTCTime,
      meetingISTTime: formatInTimeZone(meetingUTC, IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz'),
      meetingISTDate,
      requestRangeIST: `${requestStartISTDate} to ${requestEndISTDate}`,
      isInRange
    });

    return isInRange;
  } catch (error) {
    console.error('❌ Error in meeting time filter:', error);
    return false;
  }
}

/**
 * Format a UTC date string to IST with proper timezone handling
 */
export function formatToIST(utcDateString: string, formatString: string = 'dd/MM/yyyy, hh:mm a'): string {
  try {
    const utcDate = parseISO(utcDateString);
    return formatInTimeZone(utcDate, IST_TIMEZONE, `${formatString} 'IST'`);
  } catch (error) {
    console.error('❌ Error formatting to IST:', error);
    return 'Invalid Date';
  }
}

/**
 * Get current time in IST
 */
export function getCurrentTimeIST(): string {
  return formatInTimeZone(new Date(), IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz');
}

/**
 * Filter meetings to only include those that actually fall on the requested IST dates
 * This is the key function to prevent early morning meetings from being included in the wrong date
 */
export function filterMeetingsByISTDate(
  meetings: any[], 
  fromISTDate: string, 
  toISTDate: string
): any[] {
  return meetings.filter(meeting => {
    try {
      const meetingUTC = parseISO(meeting.startTime);
      const meetingIST = toZonedTime(meetingUTC, IST_TIMEZONE);
      const meetingISTDate = format(meetingIST, 'yyyy-MM-dd');
      
      const isInRange = meetingISTDate >= fromISTDate && meetingISTDate <= toISTDate;
      
      console.log('🗓️ MEETING DATE FILTER (STRICT IST):', {
        subject: meeting.subject,
        meetingUTCTime: meeting.startTime,
        meetingISTTime: formatInTimeZone(meetingUTC, IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz'),
        meetingISTDate,
        requestedRange: `${fromISTDate} to ${toISTDate}`,
        isIncluded: isInRange
      });

      return isInRange;
    } catch (error) {
      console.error('❌ Error filtering meeting by IST date:', error);
      return false;
    }
  });
}

/**
 * Filter attendance records to only include those from the exact target date in IST
 * This prevents attendance from different IST dates being included
 */
export function filterAttendanceByISTDate(
  attendanceRecords: any[], 
  targetISTDate: string
): any[] {
  return attendanceRecords.filter(record => {
    if (!record.intervals || record.intervals.length === 0) return false;

    // Filter intervals to only include those from the target IST date
    const filteredIntervals = record.intervals.filter((interval: any) => {
      try {
        const joinTimeUTC = parseISO(interval.joinDateTime);
        const joinTimeIST = toZonedTime(joinTimeUTC, IST_TIMEZONE);
        const intervalISTDate = format(joinTimeIST, 'yyyy-MM-dd');
        
        const isValidDate = intervalISTDate === targetISTDate;
        
        console.log('📊 ATTENDANCE INTERVAL FILTER:', {
          email: record.email,
          intervalISTDate,
          targetISTDate,
          isValidDate,
          joinTimeUTC: interval.joinDateTime,
          joinTimeIST: formatInTimeZone(joinTimeUTC, IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz')
        });

        return isValidDate;
      } catch (error) {
        console.error('❌ Error filtering attendance interval:', error);
        return false;
      }
    });

    if (filteredIntervals.length === 0) return false;

    // Update the record with filtered intervals and recalculate duration
    record.intervals = filteredIntervals;
    record.duration = filteredIntervals.reduce((sum: number, interval: any) => 
      sum + (interval.durationInSeconds || 0), 0
    );

    return true;
  });
} 