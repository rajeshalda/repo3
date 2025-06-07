import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { DateRange } from "react-day-picker"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Get user's timezone
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Format date with user's timezone
export function formatDateInUserTimezone(dateString: string) {
  const date = new Date(dateString);
  const userTimezone = getUserTimezone();
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: userTimezone
  });
}

// Convert local date to UTC for Graph API
export function convertLocalDateToUTC(date: Date, timeString: string): Date {
  const userTimezone = getUserTimezone();
  // Create a date string in user's timezone
  const localDateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${timeString}`;
  
  // Parse the date string while considering the user's timezone
  return new Date(new Date(localDateString).toLocaleString('en-US', { timeZone: userTimezone }));
}

// Convert date range to UTC times for Graph API
export function convertDateRangeToUTC(dateRange: DateRange | undefined) {
  if (!dateRange?.from || !dateRange?.to) return null;

  try {
    // Always work with calendar dates, not timezone-shifted dates
    // When user selects June 6, 2025, we want June 6 in UTC, not timezone-adjusted
    
    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);
    
    // Get the calendar date components (year, month, day) from the selected dates
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();
    const startDay = startDate.getDate();
    
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth();
    const endDay = endDate.getDate();
    
    // Create new Date objects in UTC with the same calendar dates
    // This ensures June 6, 2025 selected by user = June 6, 2025 00:00:00 UTC to June 6, 2025 23:59:59 UTC
    const startUTC = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0));
    const endUTC = new Date(Date.UTC(endYear, endMonth, endDay, 23, 59, 59, 999));

    console.log('Date range conversion (FIXED):', {
      userTimezone: getUserTimezone(),
      inputDates: {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
        fromLocal: dateRange.from.toLocaleDateString(),
        toLocal: dateRange.to.toLocaleDateString()
      },
      calendarDates: {
        startCalendar: `${startYear}-${String(startMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
        endCalendar: `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      },
      utcRange: {
        start: startUTC.toISOString(),
        end: endUTC.toISOString()
      },
      explanation: 'Calendar dates are preserved regardless of user timezone'
    });

    return {
      start: startUTC.toISOString(),
      end: endUTC.toISOString(),
      timezone: 'UTC'
    };
  } catch (error) {
    console.error('Error in date range conversion:', error);
    
    // Fallback method
    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);
    
    // Use UTC methods to avoid timezone issues
    const startUTC = new Date(Date.UTC(
      startDate.getFullYear(), 
      startDate.getMonth(), 
      startDate.getDate(), 
      0, 0, 0, 0
    ));
    const endUTC = new Date(Date.UTC(
      endDate.getFullYear(), 
      endDate.getMonth(), 
      endDate.getDate(), 
      23, 59, 59, 999
    ));
    
    return {
      start: startUTC.toISOString(),
      end: endUTC.toISOString(),
      timezone: 'UTC'
    };
  }
}

// Format date with specific timezone
export function formatDateWithTimezone(dateString: string, timezone: string = getUserTimezone()) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone
  });
}

// Constants for IST timezone
export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET = 5.5 * 60 * 60 * 1000; // 5:30 hours in milliseconds

// Consistent date formatting function
export function formatDateIST(date: Date | string | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return 'Invalid Date';
  
  try {
    // If the date string already has IST marker, handle it appropriately
    if (typeof date === 'string' && date.includes(' IST')) {
      // Remove the IST marker to get a standard date string
      const cleanDateStr = date.replace(' IST', '');
      // Parse the clean date string
      const dateObj = new Date(cleanDateStr);
      
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
      
      // Format using specified options, but no need to set timezone since it's already IST
      return new Intl.DateTimeFormat('en-US', {
        ...options,
        timeZone: IST_TIMEZONE
      }).format(dateObj);
    }
    
    // Standard handling for other date formats
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return 'Invalid Date';

    // Always ensure we're using IST timezone
    return new Intl.DateTimeFormat('en-US', {
      timeZone: IST_TIMEZONE,
      ...options
    }).format(dateObj);
  } catch {
    return 'Invalid Date';
  }
}

// Standard format options for consistency
export const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: IST_TIMEZONE
};

export const TIME_ONLY_FORMAT: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: IST_TIMEZONE
};

export const DATE_ONLY_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  timeZone: IST_TIMEZONE
};
