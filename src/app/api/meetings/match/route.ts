import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { IntervalsAPI } from '@/lib/intervals-api';
import { UserStorage } from '@/lib/user-storage';
import { AzureOpenAIClient } from '@/lib/azure-openai';
import { findKeywordMatches, generateMatchingPrompt } from '@/lib/matching-utils';
import { fetchAllTasksDirectly } from '@/lib/intervals-direct-fetcher';
import type { Task } from '@/lib/types';

interface Meeting {
  subject: string;
  startTime: string;
  endTime: string;
  meetingInfo?: {
    meetingId: string;
  };
  attendanceRecords?: {
    name: string;
    email: string;
    duration: number;
    intervals: {
      joinDateTime: string;
      leaveDateTime: string;
      durationInSeconds: number;
    }[];
    rawRecord?: {
      reportId: string;
    };
  }[];
}

interface MatchResult {
  meeting: Meeting;
  matchedTask: Task | null;
  confidence: number;
  reason: string;
}

const BATCH_SIZE = 8;
const DELAY_BETWEEN_REQUESTS = 1500; // 1.5 seconds

interface CachedResponse {
  response: string;
  timestamp: number;
}

const openAICache = new Map<string, CachedResponse>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function isSimilarTitle(title1: string, title2: string): boolean {
  const words1 = title1.toLowerCase().split(/\s+/);
  const words2 = title2.toLowerCase().split(/\s+/);
  
  // Calculate similarity ratio
  const commonWords = words1.filter(word => words2.includes(word));
  const similarityRatio = commonWords.length / Math.max(words1.length, words2.length);
  
  return similarityRatio > 0.7; // 70% similarity threshold
}

async function processMeetingBatch(
  meetings: Meeting[],
  tasks: Task[],
  openai: AzureOpenAIClient,
  startIndex: number,
  userEmail: string
): Promise<{ results: MatchResult[], nextIndex: number }> {
  const results: MatchResult[] = [];
  let currentIndex = startIndex;

  try {
    const batchEndIndex = Math.min(startIndex + BATCH_SIZE, meetings.length);
    console.log(`Processing batch from ${startIndex} to ${batchEndIndex} of ${meetings.length} meetings`);

    for (let i = startIndex; i < batchEndIndex; i++) {
      const meeting = meetings[i];
      currentIndex = i;
      
      try {
        // Try keyword matching first
        let bestMatch: { task: Task; confidence: number; reason: string } | null = null;

        for (const task of tasks) {
          const { matched, reason, confidence } = findKeywordMatches(meeting.subject, task);
          if (matched && confidence > 0.5) { // Only consider matches above 50% confidence
            if (!bestMatch || confidence > bestMatch.confidence) {
              bestMatch = {
                task,
                confidence,
                reason
              };
            }
          }
        }

        if (bestMatch && bestMatch.confidence >= 0.7) { // Only use keyword matches with high confidence
          results.push({
            meeting,
            matchedTask: bestMatch.task,
            confidence: bestMatch.confidence,
            reason: bestMatch.reason
          });
          continue;
        }

        // Check if user attended the meeting
        const userAttendance = meeting.attendanceRecords?.find(record => 
          record.email.toLowerCase() === userEmail.toLowerCase()
        );

        if (!userAttendance || userAttendance.duration === 0) {
          console.log(`Skipping OpenAI for meeting "${meeting.subject}" - No attendance recorded`);
          results.push({
            meeting,
            matchedTask: null,
            confidence: 0,
            reason: 'No attendance recorded for this meeting'
          });
          continue;
        }

        // Check cache for similar meetings
        let cachedResponse: CachedResponse | undefined;
        for (const [cachedTitle, cached] of openAICache.entries()) {
          if (isSimilarTitle(meeting.subject, cachedTitle) && 
              Date.now() - cached.timestamp < CACHE_DURATION) {
            cachedResponse = cached;
            console.log(`Using cached response for similar meeting: ${cachedTitle}`);
            break;
          }
        }

        if (cachedResponse) {
          try {
            const matchData = JSON.parse(cachedResponse.response);
            const foundTask = tasks.find(t => t.title.toLowerCase() === matchData.matchedTaskTitle?.toLowerCase());
            const matchedTask = foundTask || null;
            
            // Only use cached match if confidence is high enough
            if (matchedTask && matchData.confidence >= 0.7) {
              results.push({
                meeting,
                matchedTask,
                confidence: matchData.confidence,
                reason: matchData.reason
              });
              continue;
            }
          } catch (e) {
            console.log('Invalid cached response, proceeding with OpenAI call');
          }
        }

        // If no keyword match but user attended, try OpenAI
        console.log(`No keyword match found, trying OpenAI for: ${meeting.subject} (Attendance: ${userAttendance.duration} seconds)`);
        const prompt = generateMatchingPrompt(meeting.subject, tasks);

        try {
          const response = await openai.getCompletion(prompt);
          console.log('OpenAI Response:', response);
          
          // Cache the response
          openAICache.set(meeting.subject, {
            response,
            timestamp: Date.now()
          });
          
          const matchData = JSON.parse(response);
          console.log('Parsed match data:', matchData);

          // Only apply confidence adjustments if there's a potential match
          let adjustedConfidence = matchData.confidence;
          if (matchData.matchedTaskTitle) {
            const reasonLower = matchData.reason.toLowerCase();
            
            // More conservative confidence adjustments
            if (reasonLower.includes('strongly aligns') || 
                reasonLower.includes('direct match')) {
                adjustedConfidence = Math.min(adjustedConfidence + 0.1, 0.9); // Cap at 90%
            }
            
            // Smaller boost for infrastructure matches
            if ((meeting.subject.toLowerCase().includes('infrastructure') || 
                 meeting.subject.toLowerCase().includes('system')) &&
                reasonLower.includes('infrastructure')) {
                adjustedConfidence = Math.min(adjustedConfidence + 0.05, 0.9);
            }
          }

          // Find the best matching task
          let matchedTask: Task | null = null;
          if (matchData.matchedTaskTitle) {
            const foundTask = tasks.find(t => 
              t.title.toLowerCase() === matchData.matchedTaskTitle.toLowerCase()
            );
            matchedTask = foundTask || null;
          }
          
          // Only consider it a match if confidence is high enough
          if (matchedTask && adjustedConfidence >= 0.7) {
            results.push({
              meeting,
              matchedTask,
              confidence: adjustedConfidence,
              reason: matchData.reason
            });
          } else {
            // If confidence is too low, treat as unmatched
            results.push({
              meeting,
              matchedTask: null,
              confidence: adjustedConfidence,
              reason: matchData.reason || 'No confident match found'
            });
          }
        } catch (openaiError) {
          console.error(`OpenAI processing failed for meeting: ${meeting.subject}`, openaiError);
          results.push({
            meeting,
            matchedTask: null,
            confidence: 0,
            reason: `OpenAI processing failed: ${openaiError instanceof Error ? openaiError.message : 'Unknown error'}`
          });
        }

      } catch (error) {
        console.error(`Failed to process meeting: ${meeting.subject}`, error);
        results.push({
          meeting,
          matchedTask: null,
          confidence: 0,
          reason: `Failed to process meeting: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }

      // Increased delay between meetings
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }

    return { 
      results,
      nextIndex: batchEndIndex 
    };
  } catch (error) {
    console.error('Batch processing error:', error);
    return {
      results,
      nextIndex: currentIndex
    };
  }
}

function deduplicateMeetings(meetings: Meeting[]): Meeting[] {
  const seen = new Set();
  return meetings.filter(meeting => {
    // Create a unique key using meeting subject, start time, and report ID if available
    // This ensures that meetings with different report IDs are treated as separate instances
    const reportIds = meeting.attendanceRecords
      ?.map(record => record.rawRecord?.reportId)
      .filter(Boolean)
      .join(',') || 'no-report';
    
    const key = `${meeting.subject}_${meeting.startTime}_${reportIds}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Skip cache and fetch fresh tasks directly
async function fetchFreshTasksWithoutCache(apiKey: string): Promise<any[]> {
  try {
    console.log('Forcing fresh task fetch from Intervals API without cache...');
    // First try the direct fetcher
    let tasks = await fetchAllTasksDirectly(apiKey);
    
    if (tasks && tasks.length > 0) {
      console.log(`Direct fetcher returned ${tasks.length} tasks`);
      return tasks;
    }
    
    // If direct fetcher fails, use the API proxy but with a cache busting parameter
    const timestamp = new Date().getTime();
    const url = '/api/intervals-proxy';
    const headers = {
      'Content-Type': 'application/json',
      'x-user-id': apiKey,
      'x-no-cache': 'true' // Signal not to use cache
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        endpoint: `task?limit=500&_nocache=${timestamp}`, // Add cache busting parameter
        method: 'GET',
        data: null,
        forceBypassCache: true // Add extra flag for cache bypassing
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Parse response format
    let parsedTasks = [];
    if (data && Array.isArray(data.task)) {
      parsedTasks = data.task;
    } else if (Array.isArray(data)) {
      parsedTasks = data;
    } else if (data && data.tasks && Array.isArray(data.tasks)) {
      parsedTasks = data.tasks;
    } else if (data && data.data && Array.isArray(data.data.task)) {
      parsedTasks = data.data.task;
    } else if (data && data.data && Array.isArray(data.data)) {
      parsedTasks = data.data;
    } else {
      console.warn('Unexpected API response format when forcing fresh task fetch');
    }
    
    console.log(`Forced fresh fetch returned ${parsedTasks.length} tasks`);
    return parsedTasks;
  } catch (error) {
    console.error('Error in fetchFreshTasksWithoutCache:', error);
    // Return empty array on error
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request data
    const { meetings: rawMeetings, startIndex = 0 } = await request.json();
    
    // Deduplicate meetings before processing
    const meetings = deduplicateMeetings(rawMeetings);
    
    console.log(`Processing meetings batch starting at index ${startIndex}`);
    console.log('Number of unique meetings to process:', meetings.length);
    
    if (!Array.isArray(meetings)) {
      return NextResponse.json({ error: 'Invalid meetings data' }, { status: 400 });
    }

    // Get Intervals tasks
    const storage = new UserStorage();
    await storage.loadData();
    const apiKey = storage.getUserApiKey(session.user.email);

    // Get tasks directly using IntervalsAPI
    const apiKeyValue = await apiKey;
    if (!apiKeyValue) {
      return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
    }
    const intervalsApi = new IntervalsAPI(apiKeyValue);
    
    // Get current user information for filtering tasks
    console.log('Getting current user information...');
    const currentUser = await intervalsApi.getCurrentUser();
    console.log('Current user information:', currentUser);
    
    // Fetch all tasks directly without using cache
    console.log('Fetching fresh tasks without using cache...');
    let allTasks = await fetchFreshTasksWithoutCache(apiKeyValue);
    
    if (!allTasks || allTasks.length === 0) {
      console.log('Fresh task fetch failed, trying direct fetcher...');
      allTasks = await fetchAllTasksDirectly(apiKeyValue);
      
      if (!allTasks || allTasks.length === 0) {
        console.log('Direct fetcher failed, falling back to regular API...');
        // Last resort: Fall back to the regular API method but with cache bypass
        allTasks = await intervalsApi.getTasks({ bypassCache: true });
        if (!allTasks || allTasks.length === 0) {
          console.log('All methods failed to fetch tasks');
          return NextResponse.json({ error: 'No tasks found' }, { status: 404 });
        }
      }
    }
    console.log('Total available tasks:', allTasks.length);
    
    // Filter tasks to only show those assigned to the current user and not closed
    console.log(`Filtering tasks for user with personid: ${currentUser.personid}`);
    const tasks = allTasks.filter((task: any) => {
      // Check if task is not closed
      const isNotClosed = task.status !== "Closed";
      if (!isNotClosed) {
        return false;
      }
      
      // Skip tasks with no assigneeid
      if (!task.assigneeid) {
        return false;
      }
      
      // Check if assigneeid is a string containing the user's personid
      const assignees = task.assigneeid.split(',');
      
      // Try different matching methods for personid comparison
      const isAssignedToUser = assignees.some((id: string) => {
        return id.trim() === currentUser.personid || 
               id.trim() === String(currentUser.personid) || 
               Number(id.trim()) === Number(currentUser.personid);
      });
      
      return isAssignedToUser;
    });
    
    console.log(`Filtered from ${allTasks.length} to ${tasks.length} tasks assigned to the current user and not closed`);

    // Initialize Azure OpenAI
    const openai = new AzureOpenAIClient();

    // Process meetings in batches
    const { results, nextIndex } = await processMeetingBatch(meetings, tasks, openai, startIndex, session.user.email);

    // Categorize results - only consider meetings with actual task matches
    const highConfidence = results.filter(r => r.matchedTask && r.confidence >= 0.8);
    const mediumConfidence = results.filter(r => r.matchedTask && r.confidence >= 0.5 && r.confidence < 0.8);
    const lowConfidence = results.filter(r => r.matchedTask && r.confidence > 0 && r.confidence < 0.5);
    const unmatched = results.filter(r => !r.matchedTask);

    return NextResponse.json({
      matches: {
        high: highConfidence,
        medium: mediumConfidence,
        low: lowConfidence,
        unmatched: unmatched
      },
      summary: {
        processed: results.length,
        totalMeetings: meetings.length
      },
      nextBatch: nextIndex < meetings.length ? nextIndex : null
    });

  } catch (error) {
    console.error('Error in meeting matching:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to match meetings' },
      { status: 500 }
    );
  }
} 