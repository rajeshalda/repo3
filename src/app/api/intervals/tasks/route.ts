import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { UserStorage } from '@/lib/user-storage';
import { IntervalsAPI } from '@/lib/intervals-api';

// Add a simple in-memory rate limiting mechanism
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 10; // Maximum 10 requests per minute per user

// Store request timestamps by user email
const requestLog = new Map<string, number[]>();

// Check if a user has exceeded their rate limit
function isRateLimited(email: string): boolean {
  const now = Date.now();
  const userRequests = requestLog.get(email) || [];
  
  // Filter out requests older than the window
  const recentRequests = userRequests.filter(timestamp => (now - timestamp) < RATE_LIMIT_WINDOW);
  
  // Update the request log
  requestLog.set(email, [...recentRequests, now]);
  
  // Check if the number of recent requests exceeds the limit
  return recentRequests.length >= MAX_REQUESTS_PER_WINDOW;
}

interface IntervalsApiError extends Error {
  response?: {
    status?: number;
  };
  message: string;
}

function isIntervalsApiError(error: unknown): error is IntervalsApiError {
  return error instanceof Error &&
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('response' in error || true);
}

// Define the structure for the user object returned by getCurrentUser
interface IntervalsUser {
  personid: string;
  firstname?: string;
  lastname?: string;
  [key: string]: any; // For any other properties
}

export async function GET() {
  try {
    console.log('Starting tasks endpoint...');
    const session = await getServerSession(authOptions);
    console.log('Session:', session);

    if (!session?.user?.email) {
      console.error('No session or email found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Session user email:', session.user.email);

    // Check rate limiting
    if (isRateLimited(session.user.email)) {
      console.warn(`Rate limit exceeded for user: ${session.user.email}`);
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Initialize storage and load data
    const storage = new UserStorage();
    await storage.loadData(); // Wait for data to load
    const apiKey = await storage.getUserApiKey(session.user.email);

    // Add API key format validation
    if (!apiKey) {
      return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
    }

    if (apiKey.length !== 11) {
      return NextResponse.json({ 
        error: 'Invalid Intervals API key format. The key should be exactly 11 characters long (e.g., 9bf2smemqha)' 
      }, { status: 401 });
    }

    // If no API key in storage, use the default test key
    // TODO: Remove this in production, only for testing
    const finalApiKey = apiKey || '9bf2smemqha';
    console.log('Using API key:', apiKey ? 'From storage' : 'Default test key');

    console.log('Initializing Intervals API with key...');
    const intervalsApi = new IntervalsAPI(finalApiKey);
    
    // Get all tasks first
    console.log('Fetching tasks from Intervals...');
    const tasks = await intervalsApi.getTasks();
    
    if (!tasks || tasks.length === 0) {
      console.log('No tasks found in Intervals');
      return NextResponse.json([]);
    }

    // Get the current user for filtering
    console.log('Getting current user to filter tasks...');
    const currentUser = await intervalsApi.getCurrentUser();
    console.log('Current user information:', currentUser);
    
    if (!currentUser || !currentUser.personid) {
      console.warn('Could not get current user info for filtering, returning all tasks');
      // If we can't get the current user, just return all open tasks
      const openTasks = tasks.filter((task: any) => task.status !== "Closed");
      console.log(`Returning all ${openTasks.length} open tasks`);
      
      const formattedTasks = openTasks.map((task: { 
        id: string; 
        title?: string; 
        project?: string; 
        module?: string; 
        status?: string; 
      }) => ({
        id: task.id,
        title: task.title || 'Untitled Task',
        project: task.project || 'No Project',
        module: task.module || 'No Module',
        status: task.status || 'Unknown'
      }));
      
      return NextResponse.json(formattedTasks);
    }
    
    // Filter tasks to only show those assigned to the current user and not closed
    console.log(`Filtering tasks for user with personid: ${currentUser.personid}`);
    
    // Log all task assignees for debugging
    tasks.forEach((task: any) => {
      console.log(`Task ${task.id}: "${task.title}" - Assignees: ${task.assigneeid || 'none'}, Status: ${task.status}`);
    });
    
    const filteredTasks = tasks.filter((task: any) => {
      // Check if task is not closed
      const isNotClosed = task.status !== "Closed";
      if (!isNotClosed) {
        return false;
      }
      
      // If task has no assigneeid, don't include it (unassigned tasks)
      if (!task.assigneeid) {
        console.log(`Skipping unassigned task: ${task.id} - ${task.title}`);
        return false;
      }
      
      // Check if assigneeid is a string containing the user's personid
      const assignees = task.assigneeid.split(',');
      console.log(`Task ${task.id} assignees:`, assignees, 'Current user personid:', currentUser.personid);
      
      // Try both string and number comparisons because the IDs might be in different formats
      const isAssignedToUser = assignees.some((id: string) => {
        return id.trim() === currentUser.personid || 
               id.trim() === String(currentUser.personid) || 
               Number(id.trim()) === Number(currentUser.personid);
      });
      
      if (isAssignedToUser) {
        console.log(`Task ${task.id} is assigned to current user`);
      }
      
      return isAssignedToUser;
    });

    console.log(`Filtered from ${tasks.length} to ${filteredTasks.length} tasks assigned to the current user and not closed`);

    // Transform the response to match our Task interface
    const formattedTasks = filteredTasks.map((task: { 
      id: string; 
      title?: string; 
      project?: string; 
      module?: string; 
      status?: string; 
    }) => ({
      id: task.id,
      title: task.title || 'Untitled Task',
      project: task.project || 'No Project',
      module: task.module || 'No Module',
      status: task.status || 'Unknown'
    }));

    console.log(`Successfully fetched ${formattedTasks.length} tasks for the current user`);
    return NextResponse.json(formattedTasks);
  } catch (error) {
    console.error('Error in /api/intervals/tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
} 