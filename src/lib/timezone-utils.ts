import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// Constants for backward compatibility
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
 * Convert a date range to UTC for Graph API calls - works with any timezone
 * @param dateRange - The date range selected by user
 * @param userTimezone - User's timezone (detected from browser)
 */
export function convertDateRangeToUTCWithTimezone(
  dateRange: DateRange | undefined, 
  userTimezone: string = 'UTC'
): UTCRange | null {
  if (!dateRange?.from || !dateRange?.to) return null;

  try {
    // Get the date parts from the selected dates
    const startYear = dateRange.from.getFullYear();
    const startMonth = dateRange.from.getMonth();
    const startDay = dateRange.from.getDate();
    
    const endYear = dateRange.to.getFullYear();
    const endMonth = dateRange.to.getMonth();
    const endDay = dateRange.to.getDate();

    // Create date strings for start and end of day
    const startDateStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDateStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    // Create proper timezone date objects for start and end of day
    const startOfDayLocal = new Date(`${startDateStr}T00:00:00`);
    const endOfDayLocal = new Date(`${endDateStr}T23:59:59.999`);

    console.log('📅 TIMEZONE CONVERSION DEBUG:', {
      userTimezone,
      inputRange: {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString()
      },
      calendarDates: {
        startCalendar: startDateStr,
        endCalendar: endDateStr
      },
      localDayBoundaries: {
        startOfDay: startOfDayLocal.toISOString(),
        endOfDay: endOfDayLocal.toISOString()
      }
    });

    // Convert local day boundaries to UTC using the user's timezone
    const startUTC = fromZonedTime(startOfDayLocal, userTimezone);
    const endUTC = fromZonedTime(endOfDayLocal, userTimezone);

    const result = {
      start: startUTC.toISOString(),
      end: endUTC.toISOString(),
      timezone: userTimezone
    };

    console.log('✅ UTC CONVERSION RESULT:', {
      ...result,
      verification: {
        startUTCBackToUserTZ: formatInTimeZone(startUTC, userTimezone, 'yyyy-MM-dd HH:mm:ss zzz'),
        endUTCBackToUserTZ: formatInTimeZone(endUTC, userTimezone, 'yyyy-MM-dd HH:mm:ss zzz')
      }
    });

    return result;
  } catch (error) {
    console.error('❌ Error in timezone conversion:', error);
    return null;
  }
}

/**
 * Legacy function for backward compatibility - delegates to new function with IST
 */
export function convertDateRangeToUTC(dateRange: DateRange | undefined): UTCRange | null {
  return convertDateRangeToUTCWithTimezone(dateRange, IST_TIMEZONE);
}

/**
 * Check if a meeting time falls within the requested date range in user's timezone
 */
export function isMeetingInUserDateRange(
  meetingUTCTime: string, 
  requestStartUTC: string, 
  requestEndUTC: string,
  userTimezone: string = 'UTC'
): boolean {
  try {
    // Convert meeting UTC time to user's timezone
    const meetingUTC = parseISO(meetingUTCTime);
    const meetingInUserTZ = toZonedTime(meetingUTC, userTimezone);
    
    // Convert request boundary UTC times to user's timezone
    const requestStartUTCDate = parseISO(requestStartUTC);
    const requestEndUTCDate = parseISO(requestEndUTC);
    const requestStartInUserTZ = toZonedTime(requestStartUTCDate, userTimezone);
    const requestEndInUserTZ = toZonedTime(requestEndUTCDate, userTimezone);

    // Get just the date parts for comparison
    const meetingUserTZDate = format(meetingInUserTZ, 'yyyy-MM-dd');
    const requestStartUserTZDate = format(requestStartInUserTZ, 'yyyy-MM-dd');
    const requestEndUserTZDate = format(requestEndInUserTZ, 'yyyy-MM-dd');

    // Check if meeting date falls within the request date range
    const isInRange = meetingUserTZDate >= requestStartUserTZDate && meetingUserTZDate <= requestEndUserTZDate;

    console.log('🕐 MEETING TIME FILTER CHECK:', {
      userTimezone,
      meetingUTCTime,
      meetingUserTZTime: formatInTimeZone(meetingUTC, userTimezone, 'yyyy-MM-dd HH:mm:ss zzz'),
      meetingUserTZDate,
      requestRangeUserTZ: `${requestStartUserTZDate} to ${requestEndUserTZDate}`,
      isInRange
    });

    return isInRange;
  } catch (error) {
    console.error('❌ Error in meeting time filter:', error);
    return false;
  }
}

/**
 * Legacy IST-specific function for backward compatibility
 */
export function isMeetingInISTDateRange(
  meetingUTCTime: string, 
  requestStartUTC: string, 
  requestEndUTC: string
): boolean {
  return isMeetingInUserDateRange(meetingUTCTime, requestStartUTC, requestEndUTC, IST_TIMEZONE);
}

/**
 * Format a UTC date string to user's timezone with proper timezone handling
 */
export function formatToUserTimezone(
  utcDateString: string, 
  userTimezone: string = 'UTC',
  formatString: string = 'dd/MM/yyyy, hh:mm a'
): string {
  try {
    const utcDate = parseISO(utcDateString);
    return formatInTimeZone(utcDate, userTimezone, `${formatString} 'zzz'`);
  } catch (error) {
    console.error('❌ Error formatting to user timezone:', error);
    return 'Invalid Date';
  }
}

/**
 * Legacy IST function for backward compatibility
 */
export function formatToIST(utcDateString: string, formatString: string = 'dd/MM/yyyy, hh:mm a'): string {
  return formatToUserTimezone(utcDateString, IST_TIMEZONE, formatString);
}

/**
 * Get current time in user's timezone
 */
export function getCurrentTimeInTimezone(timezone: string = 'UTC'): string {
  return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd HH:mm:ss zzz');
}

/**
 * Legacy IST function
 */
export function getCurrentTimeIST(): string {
  return getCurrentTimeInTimezone(IST_TIMEZONE);
}

/**
 * Filter meetings to only include those that fall on the requested dates in user's timezone
 */
export function filterMeetingsByUserDate(
  meetings: any[], 
  fromDate: string, 
  toDate: string,
  userTimezone: string = 'UTC'
): any[] {
  return meetings.filter(meeting => {
    try {
      const meetingUTC = parseISO(meeting.startTime);
      const meetingUserTZ = toZonedTime(meetingUTC, userTimezone);
      const meetingUserTZDate = format(meetingUserTZ, 'yyyy-MM-dd');
      
      const isInRange = meetingUserTZDate >= fromDate && meetingUserTZDate <= toDate;
      
      console.log('🗓️ MEETING DATE FILTER:', {
        userTimezone,
        subject: meeting.subject,
        meetingUTCTime: meeting.startTime,
        meetingUserTZTime: formatInTimeZone(meetingUTC, userTimezone, 'yyyy-MM-dd HH:mm:ss zzz'),
        meetingUserTZDate,
        requestedRange: `${fromDate} to ${toDate}`,
        isIncluded: isInRange
      });

      return isInRange;
    } catch (error) {
      console.error('❌ Error filtering meeting by user timezone date:', error);
      return false;
    }
  });
}

/**
 * Legacy IST function for backward compatibility
 */
export function filterMeetingsByISTDate(
  meetings: any[], 
  fromISTDate: string, 
  toISTDate: string
): any[] {
  return filterMeetingsByUserDate(meetings, fromISTDate, toISTDate, IST_TIMEZONE);
}

/**
 * Filter attendance records to only include those from the exact target date in user's timezone
 */
export function filterAttendanceByUserDate(
  attendanceRecords: any[], 
  targetDate: string,
  userTimezone: string = 'UTC'
): any[] {
  return attendanceRecords.filter(record => {
    if (!record.intervals || record.intervals.length === 0) return false;

    // Filter intervals to only include those from the target date in user's timezone
    const filteredIntervals = record.intervals.filter((interval: any) => {
      try {
        const joinTimeUTC = parseISO(interval.joinDateTime);
        const joinTimeUserTZ = toZonedTime(joinTimeUTC, userTimezone);
        const intervalUserTZDate = format(joinTimeUserTZ, 'yyyy-MM-dd');
        
        const isValidDate = intervalUserTZDate === targetDate;
        
        console.log('📊 ATTENDANCE INTERVAL FILTER:', {
          userTimezone,
          email: record.email,
          intervalUserTZDate,
          targetDate,
          isValidDate,
          joinTimeUTC: interval.joinDateTime,
          joinTimeUserTZ: formatInTimeZone(joinTimeUTC, userTimezone, 'yyyy-MM-dd HH:mm:ss zzz')
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

/**
 * Legacy IST function for backward compatibility
 */
export function filterAttendanceByISTDate(
  attendanceRecords: any[], 
  targetISTDate: string
): any[] {
  return filterAttendanceByUserDate(attendanceRecords, targetISTDate, IST_TIMEZONE);
} 