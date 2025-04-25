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

  // Get user's timezone first
  const userTimezone = getUserTimezone();
  
  // Determine which timezone to use - if IST is specifically required, use it, otherwise use user's timezone
  const useIST = process.env.NEXT_PUBLIC_FORCE_IST_TIMEZONE === 'true';
  const effectiveTimezone = useIST ? IST_TIMEZONE : userTimezone;

  try {
    // Create a formatter for the effective timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: effectiveTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Get start and end dates in the effective timezone
    const startParts = formatter.formatToParts(dateRange.from);
    const endParts = formatter.formatToParts(dateRange.to);

    // Build date strings with specific times (start at 00:00:00, end at 23:59:59.999)
    const startStr = `${startParts.find(p => p.type === 'year')?.value}-${startParts.find(p => p.type === 'month')?.value}-${startParts.find(p => p.type === 'day')?.value}T00:00:00.000`;
    const endStr = `${endParts.find(p => p.type === 'year')?.value}-${endParts.find(p => p.type === 'month')?.value}-${endParts.find(p => p.type === 'day')?.value}T23:59:59.999`;

    // Create Date objects in the effective timezone
    const startInTZ = new Date(startStr);
    const endInTZ = new Date(endStr);

    // Log the conversions for verification
    console.log('Date range conversion:', {
      userTimezone,
      effectiveTimezone,
      isISTForced: useIST,
      inputDates: {
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString()
      },
      processedDates: {
        startStr,
        endStr
      },
      selectedRange: {
        start: startInTZ.toLocaleString('en-US', { timeZone: effectiveTimezone }),
        end: endInTZ.toLocaleString('en-US', { timeZone: effectiveTimezone })
      },
      utcTimes: {
        start: startInTZ.toISOString(),
        end: endInTZ.toISOString()
      }
    });

    return {
      start: startInTZ.toISOString(),
      end: endInTZ.toISOString(),
      timezone: effectiveTimezone
    };
  } catch (error) {
    console.error('Error in date range conversion:', error);
    
    // Fallback method if the above fails
    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);
    
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      timezone: effectiveTimezone
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
