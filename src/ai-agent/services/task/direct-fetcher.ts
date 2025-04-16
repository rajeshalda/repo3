import axios from 'axios';
import { Task } from './intervals';

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
 * Direct fetcher for Intervals API tasks using axios
 * This bypasses any middleware and directly calls the Intervals API
 */
export async function fetchTasksDirectly(apiKey: string): Promise<Task[]> {
  try {
    console.log('Directly fetching tasks with axios...');
    
    // Create base64 encoded credentials from the API key (used for Basic Auth)
    const credentials = Buffer.from(`${apiKey}:x`).toString('base64');

    // Get all tasks with a high limit
    const response = await axios.get<{task: IntervalsTaskResponse[]}>(
      'https://api.myintervals.com/task/', 
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        params: {
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
    console.log(`Direct fetcher retrieved ${tasks.length} tasks from Intervals API`);
    
    // Return tasks in the expected format
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