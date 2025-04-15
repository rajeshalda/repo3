import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { DateRange } from "react-day-picker"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

export function formatDateWithTimezone(dateString: string) {
  const date = new Date(dateString);
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `${date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })} GMT${formatTimezoneOffset(date)}`;
}

function formatTimezoneOffset(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `${offset >= 0 ? '+' : '-'}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
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

// Convert date range to UTC times based on IST day boundaries
export function convertDateRangeToUTC(dateRange: DateRange | undefined) {
  if (!dateRange?.from || !dateRange?.to) return null;

  // For start date: We want 00:00:00 IST of the start date
  // For April 13, we want meetings from April 13 00:00:00 IST onwards
  const utcStart = new Date(dateRange.from);
  // Set to beginning of the selected day in IST (18:30 UTC of same day)
  utcStart.setUTCHours(18, 30, 0, 0);  // 18:30:00.000 UTC = 00:00:00 IST next day

  // For end date: We want 23:59:59.999 IST of the end date
  // This means 18:29:59.999 UTC of the NEXT day
  const utcEnd = new Date(dateRange.to);
  utcEnd.setDate(utcEnd.getDate() + 1); // Go to next day
  utcEnd.setUTCHours(18, 29, 59, 999); // 18:29:59.999 UTC = 23:59:59.999 IST of selected end date

  // Log the conversions for verification
  console.log('Date range conversion:', {
    selectedRange: {
      start: dateRange.from.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE }),
      end: dateRange.to.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE })
    },
    utcTimes: {
      start: utcStart.toISOString(),
      end: utcEnd.toISOString()
    },
    istTimes: {
      // Convert UTC times back to IST for verification
      start: new Date(utcStart.getTime() + IST_OFFSET).toISOString(),
      end: new Date(utcEnd.getTime() + IST_OFFSET).toISOString()
    }
  });

  return {
    start: utcStart.toISOString(),
    end: utcEnd.toISOString()
  };
}
