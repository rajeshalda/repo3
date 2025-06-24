import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { DateRange } from "react-day-picker"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Get user's timezone with proper fallback handling
export function getUserTimezone(): string {
  // Check if we're in a server environment (Node.js)
  if (typeof window === 'undefined') {
    // Server-side: We can't detect user timezone here
    // Return UTC and let client-side handle user timezone
    return 'UTC';
  }
  
  // Client-side: use browser timezone detection
  try {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return browserTimezone || 'UTC';
  } catch (error) {
    console.warn('Failed to detect browser timezone, falling back to UTC:', error);
    return 'UTC';
  }
}

// Format date with user's timezone (for client-side use)
export function formatDateInUserTimezone(dateString: string, userTimezone?: string) {
  const date = new Date(dateString);
  const timezone = userTimezone || getUserTimezone();
  
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

// Convert local date to UTC for Graph API
export function convertLocalDateToUTC(date: Date, timeString: string, userTimezone?: string): Date {
  const timezone = userTimezone || getUserTimezone();
  
  // Create a date string in user's timezone
  const localDateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${timeString}`;
  
  // Create a temporary date object
  const tempDate = new Date(localDateString);
  
  // Get the timezone offset for the user's timezone
  const userDate = new Date(tempDate.toLocaleString('en-US', { timeZone: timezone }));
  const utcDate = new Date(tempDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = utcDate.getTime() - userDate.getTime();
  
  return new Date(tempDate.getTime() + offset);
}

// Convert date range to UTC times for Graph API - with timezone support
export function convertDateRangeToUTC(dateRange: DateRange | undefined, userTimezone?: string) {
  if (!dateRange?.from || !dateRange?.to) return null;
  
  const timezone = userTimezone || getUserTimezone();
  
  // Use the timezone-aware utility
  const { convertDateRangeToUTCWithTimezone } = require('./timezone-utils');
  return convertDateRangeToUTCWithTimezone(dateRange, timezone);
}

// Format date with specific timezone
export function formatDateWithTimezone(dateString: string, timezone: string) {
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

// Timezone-aware date formatting function
export function formatDateInTimezone(
  date: Date | string | null | undefined, 
  timezone: string = 'UTC',
  options: Intl.DateTimeFormatOptions = {}
): string {
  if (!date) return 'Invalid Date';
  
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return 'Invalid Date';

    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
      ...options
    }).format(dateObj);
  } catch {
    return 'Invalid Date';
  }
}

// Legacy IST functions for backward compatibility
export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET = 5.5 * 60 * 60 * 1000; // 5:30 hours in milliseconds

export function formatDateIST(date: Date | string | null | undefined, options: Intl.DateTimeFormatOptions = {}): string {
  return formatDateInTimezone(date, IST_TIMEZONE, options);
}

// Standard format options for common use cases
export const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
};

export const TIME_ONLY_FORMAT: Intl.DateTimeFormatOptions = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
};

export const DATE_ONLY_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric'
};
