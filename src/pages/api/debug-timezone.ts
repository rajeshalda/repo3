import { NextApiRequest, NextApiResponse } from 'next';
import { formatInTimeZone } from 'date-fns-tz';
import { IST_TIMEZONE, getCurrentTimeInTimezone, formatToUserTimezone } from '../../lib/timezone-utils';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentTime = new Date();
  
  // Get user timezone from query parameter or default to UTC
  const userTimezone = (req.query.tz as string) || 'UTC';
  
  const debugInfo = {
    server: {
      currentTimeUTC: currentTime.toISOString(),
      currentTimeUserTZ: formatInTimeZone(currentTime, userTimezone, 'yyyy-MM-dd HH:mm:ss zzz'),
      currentTimeIST: formatInTimeZone(currentTime, IST_TIMEZONE, 'yyyy-MM-dd HH:mm:ss zzz'),
      systemTimezone: process.env.TZ || 'Not Set',
      processTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      serverDate: currentTime.toLocaleDateString(),
      serverTime: currentTime.toLocaleTimeString(),
    },
    user: {
      detectedTimezone: userTimezone,
      note: userTimezone === 'UTC' ? 'Using UTC default - pass ?tz=America/New_York to test with specific timezone' : `Using timezone: ${userTimezone}`
    },
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      environmentVariables: {
        TZ: process.env.TZ,
      }
    },
    testing: {
      // Test date conversion with a known meeting time
      sampleMeetingUTC: '2024-06-23T12:00:00.000Z',
      sampleMeetingUserTZ: formatInTimeZone(
        new Date('2024-06-23T12:00:00.000Z'), 
        userTimezone, 
        'yyyy-MM-dd HH:mm:ss zzz'
      ),
      sampleMeetingIST: formatInTimeZone(
        new Date('2024-06-23T12:00:00.000Z'), 
        IST_TIMEZONE, 
        'yyyy-MM-dd HH:mm:ss zzz'
      ),
      // Test timezone offset calculation
      userTZOffset: new Date().getTimezoneOffset() / -60,
    },
    examples: {
      commonTimezones: {
        'America/New_York': formatInTimeZone(currentTime, 'America/New_York', 'yyyy-MM-dd HH:mm:ss zzz'),
        'Europe/London': formatInTimeZone(currentTime, 'Europe/London', 'yyyy-MM-dd HH:mm:ss zzz'),
        'Asia/Tokyo': formatInTimeZone(currentTime, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss zzz'),
        'Asia/Kolkata': formatInTimeZone(currentTime, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss zzz'),
        'Australia/Sydney': formatInTimeZone(currentTime, 'Australia/Sydney', 'yyyy-MM-dd HH:mm:ss zzz'),
      },
      testUrls: {
        newYork: '/api/debug-timezone?tz=America/New_York',
        london: '/api/debug-timezone?tz=Europe/London', 
        tokyo: '/api/debug-timezone?tz=Asia/Tokyo',
        kolkata: '/api/debug-timezone?tz=Asia/Kolkata',
        sydney: '/api/debug-timezone?tz=Australia/Sydney'
      }
    }
  };

  res.status(200).json({
    success: true,
    timestamp: currentTime.toISOString(),
    debugInfo
  });
} 