import axios from 'axios';
import { Task } from './intervals';

interface IntervalsUser {
  id: string;
  personid: string;
  firstname: string;
  lastname: string;
}

interface IntervalsTaskResponse {
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
 * Get the current user information from Intervals API
 */
async function getCurrentUser(apiKey: string): Promise<IntervalsUser | null> {
  try {
    const credentials = Buffer.from(`${apiKey}:x`).toString('base64');
    
    const response = await axios.get('https://api.myintervals.com/me', {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = response.data;
    
    // Check if we have the personid in the root response
    if (data?.personid) {
      // Use the personid from root and get user details from me array
      const userDetails = data.me?.[0] || {};
      return {
        id: data.personid.toString(),
        personid: data.personid.toString(),
        firstname: userDetails.firstname || '',
        lastname: userDetails.lastname || ''
      };
    }
    
    // Fallback to checking me array
    if (!data?.me?.[0]) {
      throw new Error('Invalid response format from API - no user data found');
    }

    const user = data.me[0];
    return {
      id: user.id,
      personid: user.id, // Use the ID as personid since they are the same
      firstname: user.firstname || '',
      lastname: user.lastname || ''
    };
  } catch (error) {
    console.error('Error getting current user from direct API:', error);
    return null;
  }
}

/**
 * Direct fetcher for Intervals API tasks using axios
 * This bypasses any middleware and directly calls the Intervals API
 */
export async function fetchTasksDirectly(apiKey: string): Promise<Task[]> {
  try {
    console.log('Directly fetching tasks with axios...');
    
    // First get the current user to get their personid
    const currentUser = await getCurrentUser(apiKey);
    if (!currentUser) {
      console.error('Failed to get current user information');
      return [];
    }
    
    console.log('Direct fetcher: Current user personid:', currentUser.personid);
    
    // Create base64 encoded credentials from the API key (used for Basic Auth)
    const credentials = Buffer.from(`${apiKey}:x`).toString('base64');

    // Fetch tasks using hastaskrelation (includes assigned, owned, and followed tasks)
    // and excludeclosed=true to filter out closed tasks at the API level
    const response = await axios.get<{task: IntervalsTaskResponse[]}>(
      'https://api.myintervals.com/task/',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        params: {
          hastaskrelation: currentUser.personid, // Filter by user's task relationships
          excludeclosed: true, // Exclude closed tasks
          limit: 500 // Request up to 500 tasks
        }
      }
    );

    console.log('API direct response status:', response.status);

    // Extract tasks array from the response
    if (!response.data?.task || !Array.isArray(response.data.task)) {
      console.warn('Direct fetcher: No tasks found or invalid response format');
      return [];
    }

    const tasks = response.data.task;
    console.log(`Direct fetcher: Successfully retrieved ${tasks.length} open tasks (assigned to, owned by, or followed by user ${currentUser.personid})`);

    // Return tasks in the expected format - no filtering needed as API handles it
    return tasks.map((task: IntervalsTaskResponse) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      projectid: task.projectid,
      project: task.project,
      status: task.status,
      priority: task.priority,
      clientid: task.clientid,
      client: task.client,
      moduleid: task.moduleid,
      module: task.module,
      assigneeid: task.assigneeid
    }));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Direct API Error:', error.response?.data || error.message);
    } else {
      console.error('Error fetching tasks directly:', error);
    }
    return [];
  }
} 