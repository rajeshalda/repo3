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

    private async request(endpoint: string, options: RequestInit = {}) {
        const url = '/api/intervals-proxy';
        const headers = {
            'Content-Type': 'application/json',
            'x-user-id': this.userId
        };

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                endpoint,
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
    async getTasks() {
        const response = await this.request('task');
        if (!response || !response.task || !Array.isArray(response.task)) {
            console.warn('No tasks found or invalid response format');
            return [];
        }
        return response.task;
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

        // Get task details
        console.log('Fetching task details for ID:', payload.taskId);
        const tasks = await this.getTasks();
        const task = tasks.find((t: Task) => t.id === payload.taskId);
        
        if (!task) {
            console.error('Available tasks:', tasks.map((t: Task) => ({ id: t.id, title: t.title })));
            throw new Error(`Task not found with ID: ${payload.taskId}`);
        }
        console.log('Task details:', task);

        // TEMPORARY FIX: Use hardcoded worktype ID for India-Meeting
        console.log('Using hardcoded worktype ID 803850 for India-Meeting');
        const worktypeId = '803850';

        // Determine billable status based on client
        const isNathcorpClient = task.client?.toLowerCase() === 'nathcorp';
        const billableStr: 't' | 'f' = isNathcorpClient ? 'f' : (payload.billable ?? 't');

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