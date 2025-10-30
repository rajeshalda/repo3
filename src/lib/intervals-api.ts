import { fetchAllTasksDirectly } from './intervals-direct-fetcher';

// Type definitions
interface UserAttributes {
    id: string;
    personid: string;
    firstname?: string;
    lastname?: string;
    name?: string;
    email?: string;
    active?: boolean;
    created?: string;
    updated?: string;
}

interface TaskAttributes {
    id: string;
    title: string;
    projectid: string;
    moduleid?: string;
    status?: string;
    priority?: number;
    description?: string;
    created?: string;
    updated?: string;
}

type User = UserAttributes;
type Task = TaskAttributes;

interface WorkType {
    id: string;
    worktype: string;
    worktypeid: string;
    projectid: string;
}

interface TimeEntryPayload {
    taskId: string;
    date: string;
    time: number;  // time in hours
    description: string;
    workType: string;
    billable?: 't' | 'f';  // Update to match API requirement
}

interface TimeEntryRequest {
    personid: string;
    date: string;
    time: number;
    projectid: string;
    moduleid: string;
    taskid: string;
    description: string;
    billable: 't' | 'f';  // Already updated to reflect API requirement
    worktypeid: string;
}

export class IntervalsAPI {
    private userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    private async request(endpoint: string, options: RequestInit = {}, queryParams?: Record<string, string | number>) {
        // Extract endpoint path without query parameters
        const endpointPath = endpoint.split('?')[0];
        
        // Create query string from existing query params and passed queryParams
        let queryString = '';
        
        // If endpoint has query params, parse them
        if (endpoint.includes('?')) {
            queryString = endpoint.split('?')[1];
        }
        
        // If additional queryParams are provided, add them
        if (queryParams && Object.keys(queryParams).length > 0) {
            const params = new URLSearchParams();
            
            // Add any existing query params
            if (queryString) {
                queryString.split('&').forEach(param => {
                    const [key, value] = param.split('=');
                    params.append(key, value);
                });
            }
            
            // Add new query params
            Object.entries(queryParams).forEach(([key, value]) => {
                params.append(key, String(value));
            });
            
            queryString = params.toString();
        }
        
        // Construct final endpoint with query params
        const finalEndpoint = queryString ? `${endpointPath}?${queryString}` : endpointPath;
        
        const url = '/api/intervals-proxy';
        const headers = {
            'Content-Type': 'application/json',
            'x-user-id': this.userId
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                endpoint: finalEndpoint,
                method: options.method || 'GET',
                data: options.body ? JSON.parse(options.body as string) : null
            })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    // Get current user information
    async getCurrentUser(): Promise<User> {
        return this.request('person/me');
    }

    // Get data from any Intervals endpoint
    private async getData(endpoint: string) {
        try {
            return await this.request(endpoint);
        } catch (error) {
            console.error(`Error fetching data from ${endpoint}:`, error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }

    // Get project work types
    async getProjectWorkTypes(projectId?: string) {
        try {
            // First, try to get project-specific work types
            let workTypes = [];
            if (projectId) {
                const projectEndpoint = `/projectworktype/?projectid=${projectId}`;
                const projectResponse = await this.getData(projectEndpoint);
                if (projectResponse && projectResponse.projectworktype && Array.isArray(projectResponse.projectworktype)) {
                    workTypes = projectResponse.projectworktype;
                }
            }
            
            // If no project-specific work types or no project ID provided, get all work types
            if (workTypes.length === 0) {
                const allWorkTypesEndpoint = '/worktype';
                const allResponse = await this.getData(allWorkTypesEndpoint);
                if (allResponse && allResponse.worktype && Array.isArray(allResponse.worktype)) {
                    // Map the response to match the expected format
                    workTypes = allResponse.worktype.map((wt: any) => ({
                        id: wt.id,
                        worktype: wt.name,
                        worktypeid: wt.id,
                        projectid: projectId || ''
                    }));
                    console.log('Found global work types:', workTypes.map((wt: WorkType) => wt.worktype));
                }
            }
            
            if (workTypes.length === 0) {
                console.warn('No work types found for project or globally');
            } else {
                console.log(`Found ${workTypes.length} work types:`, workTypes.map((wt: WorkType) => wt.worktype));
            }
            
            return workTypes;
        } catch (error) {
            console.error('Error fetching work types:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }

    // Post a time entry
    async postTimeEntry(timeEntry: TimeEntryRequest) {
        try {
            if (!timeEntry.time || timeEntry.time <= 0) {
                throw new Error('Invalid time duration');
            }

            console.log('Posting time entry:', timeEntry);

            const result = await this.request('/time', {
                method: 'POST',
                body: JSON.stringify(timeEntry)
            });

            console.log(`Successfully posted time entry (${timeEntry.time} hours)`);
            return result;
        } catch (error) {
            console.error('Error posting time entry:', error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }

    // Get all tasks
    async getTasks(options?: { bypassCache?: boolean }) {
        try {
            console.log('Fetching tasks with limit parameter...');
            // Use direct endpoint with limit parameter already included
            const response = await this.request('task?limit=500');
            console.log('Raw task response:', response ? JSON.stringify(response).substring(0, 300) + '...' : 'null');
            
            // Extract tasks array from the response with better error handling
            let tasks = [];
            if (response && Array.isArray(response.task)) {
                tasks = response.task;
                console.log('Found tasks in response.task array:', tasks.length);
            } else if (Array.isArray(response)) {
                tasks = response;
                console.log('Response is directly an array:', tasks.length);
            } else if (response && response.tasks && Array.isArray(response.tasks)) {
                tasks = response.tasks;
                console.log('Found tasks in response.tasks array:', tasks.length);
            } else {
                // Try one more format - sometimes the API nests it under a data property
                if (response && response.data && Array.isArray(response.data.task)) {
                    tasks = response.data.task;
                    console.log('Found tasks in response.data.task array:', tasks.length);
                } else if (response && response.data && Array.isArray(response.data)) {
                    tasks = response.data;
                    console.log('Found tasks in response.data array:', tasks.length);
                } else {
                    console.warn('No tasks found or invalid response format:', 
                      response ? Object.keys(response).join(', ') : 'null response');
                    return [];
                }
            }
            
            console.log(`Retrieved ${tasks.length} tasks from Intervals API`);
            
            // Log the first task as an example
            if (tasks.length > 0) {
                console.log('Example task:', JSON.stringify(tasks[0]));
            }
            
            return tasks;
        } catch (error) {
            console.error('Error fetching tasks:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }

    // Get task details by ID
    async getTaskDetails(taskId: string) {
        try {
            // Use the detailed endpoint to get full task details including client and project
            const response = await this.request(`task/${taskId}?detailed=true`);
            if (!response || !response.task) {
                console.warn(`No task found with ID ${taskId}`);
                return null;
            }
            return response.task;
        } catch (error) {
            console.error('Error fetching task details:', error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }

    // Get a specific task by ID
    async getTaskById(taskId: string) {
        try {
            console.log('Fetching specific task by ID:', taskId);
            const taskDetails = await this.getTaskDetails(taskId);
            if (!taskDetails) {
                console.warn(`No task found with ID ${taskId}`);
                return null;
            }
            console.log('Successfully fetched task by ID:', taskId);
            return taskDetails;
        } catch (error) {
            console.error('Error fetching task by ID:', error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }

    // Get project information
    async getProject(projectId: string | number) {
        try {
            const response = await this.getData(`/project/${projectId}`);
            if (!response || !response.project) {
                console.warn(`No project found with ID ${projectId}`);
                return null;
            }
            return response.project;
        } catch (error) {
            console.error('Error fetching project:', error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }

    async getGlobalWorkTypes() {
        try {
            const endpoint = '/worktype';
            const response = await this.getData(endpoint);
            if (!response || !response.worktype || !Array.isArray(response.worktype)) {
                console.warn('No global work types found or invalid response format');
                return [];
            }
            
            // Map to a consistent format
            const workTypes = response.worktype.map((wt: any) => ({
                id: wt.id,
                worktype: wt.name,
                worktypeid: wt.id,
                projectid: ''
            }));
            
            console.log('Found global work types:', workTypes.map((wt: any) => wt.worktype));
            return workTypes;
        } catch (error) {
            console.error('Error fetching global work types:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }

    async createTimeEntry(payload: TimeEntryPayload) {
        console.log('Creating time entry with payload:', payload);
        
        // Validate time duration (already in hours)
        if (!payload.time || payload.time <= 0) {
            throw new Error('Invalid time duration. Must be greater than 0 hours.');
        }

        // Get current user first to get their personid
        const user = await this.getCurrentUser();
        console.log('Current user:', user);

        // Get task details - first try with getTaskById for most accurate data
        console.log('Fetching task details for ID:', payload.taskId);
        let task = await this.getTaskById(payload.taskId);
        
        // If task not found by ID, try with regular API
        if (!task) {
            console.log('Task not found by ID, trying with regular API...');
            const tasks = await this.getTasks();
            task = tasks.find((t: Task) => t.id === payload.taskId);
            
            // If still not found, try using the direct fetcher
            if (!task) {
                console.log('Task not found in regular API results, trying direct fetcher...');
                const directTasks = await fetchAllTasksDirectly(this.userId);
                console.log(`Direct fetcher found ${directTasks.length} tasks`);
                task = directTasks.find(t => t.id === payload.taskId);
                
                if (!task) {
                    console.error('Available tasks from both methods:',
                    [...tasks, ...directTasks].map((t: any) => ({ id: t.id, title: t.title })).slice(0, 20));
                    throw new Error(`Task not found with ID: ${payload.taskId} in either API or direct fetch`);
                }
            }
        }
        
        console.log('Task details:', task);

        // TEMPORARY FIX: Use hardcoded worktype ID for India-Meeting
        console.log('Using hardcoded worktype ID 305064 for India-Meeting');
        const worktypeId = '305064';

        // Determine billable status based on client/project
        // Simplified billable status determination:
        // 1. If client is "Internal" OR "Nathcorp" OR project contains "Internal" -> non-billable ('f')
        // 2. All other meetings -> billable ('t')
        const client = (task.client || '').toLowerCase();
        const project = (task.project || '').toLowerCase();
        
        const isInternal = 
            client === 'internal' || 
            client.includes('nathcorp') || 
            project.includes('internal');
        
        // Set billable status based on internal check
        const billableStr: 't' | 'f' = isInternal ? 'f' : 't';
        
        // Log the billable status determination for debugging
        console.log('Intervals API - Billable determination:', {
            client: task.client,
            project: task.project,
            isInternal,
            billableStatus: billableStr,
            rule: 'Internal/Nathcorp = Non-billable, Everything else = Billable'
        });

        const requestBody = {
            personid: user.personid,
            taskid: payload.taskId,
            projectid: task.projectid,
            moduleid: task.moduleid,
            date: payload.date,
            time: payload.time,
            description: payload.description,
            worktypeid: worktypeId,
            billable: billableStr
        };

        console.log('Posting time entry with request body:', requestBody);

        try {
            const result = await this.request('/time', {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            console.log('Successfully created time entry:', result);
            return result;
        } catch (error) {
            console.error('Failed to create time entry:', error);
            throw error;
        }
    }
}