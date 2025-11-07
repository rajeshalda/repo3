import axios from 'axios';

interface ApiResponse {
  personid?: number;
  status?: string;
  code?: number;
  listcount?: number;
  task?: any[];
  tasks?: any[];
}

interface Task {
  id: string;
  title: string;
  description?: string;
  projectid: string;
  project: string;
  status: string;
  priority?: string;
  clientid: string;
  client: string;
  moduleid: string;
  module: string;
  assigneeid?: string;
}

/**
 * Direct fetcher for Intervals API tasks using axios
 * This bypasses any middleware and directly calls the Intervals API
 */
export async function fetchAllTasksDirectly(apiKey: string): Promise<Task[]> {
  try {
    console.log('Direct fetcher: Fetching tasks with axios...');

    // Create base64 encoded credentials from the API key (used for Basic Auth)
    const credentials = Buffer.from(`${apiKey}:x`).toString('base64');

    // First get the current user to get their personid
    const meResponse = await axios.get<ApiResponse>('https://api.myintervals.com/me', {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      }
    });

    const personid = meResponse.data?.personid;
    if (!personid) {
      console.error('Direct fetcher: Could not get current user personid');
      return [];
    }

    console.log('Direct fetcher: Current user personid:', personid);

    // Fetch tasks using hastaskrelation (includes assigned, owned, and followed tasks)
    // and excludeclosed=true to filter out closed tasks at the API level
    const response = await axios.get<ApiResponse>('https://api.myintervals.com/task/', {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      params: {
        hastaskrelation: personid, // Filter by user's task relationships
        excludeclosed: true, // Exclude closed tasks
        limit: 500 // Request up to 500 tasks
      }
    });

    // Log the response structure
    console.log('Direct fetcher: API response status:', response.status);
    console.log('Direct fetcher: API response structure:', Object.keys(response.data).join(', '));
    
    // Extract tasks array from the response
    let tasks: any[] = [];
    if (response.data && Array.isArray(response.data.task)) {
      tasks = response.data.task;
      console.log('Direct fetcher: Found tasks in task array:', tasks.length);
    } else if (Array.isArray(response.data)) {
      tasks = response.data;
      console.log('Direct fetcher: Response is directly an array:', tasks.length);
    } else if (response.data && response.data.tasks && Array.isArray(response.data.tasks)) {
      tasks = response.data.tasks;
      console.log('Direct fetcher: Found tasks in tasks array:', tasks.length);
    } else {
      console.error('Direct fetcher: Unexpected API response format:', Object.keys(response.data).join(', '));
    }
    
    console.log(`Direct fetcher: Successfully retrieved ${tasks.length} open tasks (assigned to, owned by, or followed by user ${personid})`);

    // Return tasks in the expected format - no filtering needed as API handles it
    return tasks as Task[];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Direct fetcher: API Error:', error.response?.data || error.message);
    } else {
      console.error('Direct fetcher: Error fetching tasks:', error);
    }
    return [];
  }
} 