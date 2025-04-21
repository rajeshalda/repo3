"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntervalsAPI = void 0;
class IntervalsAPI {
    constructor(apiKey) {
        this.baseUrl = 'https://api.myintervals.com/';
        this.apiKey = apiKey;
        this.cache = {
            tasks: {
                data: null,
                timestamp: 0
            }
        };
    }
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
            'Accept': 'application/json'
        };
        const response = await fetch(url, Object.assign(Object.assign({}, options), { headers: Object.assign(Object.assign({}, headers), options.headers) }));
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }
        return response.json();
    }
    // Get current user information
    async getCurrentUser() {
        return this.request('person/me');
    }
    // Get data from any Intervals endpoint
    async getData(endpoint) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }
            return await response.json();
        }
        catch (error) {
            console.error(`Error fetching data from ${endpoint}:`, error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }
    // Get project work types
    async getProjectWorkTypes(projectId) {
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
                    workTypes = allResponse.worktype.map((wt) => ({
                        id: wt.id,
                        worktype: wt.name,
                        worktypeid: wt.id,
                        projectid: projectId || ''
                    }));
                    console.log('Found global work types:', workTypes.map((wt) => wt.worktype));
                }
            }
            if (workTypes.length === 0) {
                console.warn('No work types found for project or globally');
            }
            else {
                console.log(`Found ${workTypes.length} work types:`, workTypes.map((wt) => wt.worktype));
            }
            return workTypes;
        }
        catch (error) {
            console.error('Error fetching work types:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }
    // Post a time entry
    async postTimeEntry(timeEntry) {
        try {
            if (!timeEntry.time || timeEntry.time <= 0) {
                throw new Error('Invalid time duration');
            }
            console.log('Posting time entry:', timeEntry);
            const response = await fetch(`${this.baseUrl}/time`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(timeEntry)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }
            const result = await response.json();
            console.log(`Successfully posted time entry (${timeEntry.time} hours)`);
            return result;
        }
        catch (error) {
            console.error('Error posting time entry:', error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }
    // Get all tasks
    async getTasks(options = {}) {
        // Check if cache should be bypassed
        const bypassCache = options.bypassCache === true;
        
        // Check if we have a cached response and it's less than 10 minutes old
        const cacheExpiryTime = 10 * 60 * 1000; // 10 minutes in milliseconds
        const now = Date.now();
        
        if (!bypassCache && this.cache.tasks.data && (now - this.cache.tasks.timestamp) < cacheExpiryTime) {
            console.log('Using cached tasks data from', new Date(this.cache.tasks.timestamp).toISOString());
            return this.cache.tasks.data;
        }
        
        try {
            console.log(bypassCache ? 'Bypassing cache and fetching fresh tasks data' : 'Fetching fresh tasks data from Intervals API');
            const response = await this.request('task');
            
            if (!response || !response.task || !Array.isArray(response.task)) {
                console.warn('No tasks found or invalid response format');
                return [];
            }
            
            // Cache the response (even when bypassing, we update the cache)
            this.cache.tasks.data = response.task;
            this.cache.tasks.timestamp = now;
            
            return response.task;
        } catch (error) {
            console.error('Error fetching tasks:', error instanceof Error ? error.message : 'Unknown error');
            
            // If we have stale cache and not bypassing cache, still use it rather than returning nothing
            if (!bypassCache && this.cache.tasks.data) {
                console.log('Using stale cached tasks data due to API error');
                return this.cache.tasks.data;
            }
            
            return [];
        }
    }
    // Get project information
    async getProject(projectId) {
        try {
            const response = await this.getData(`/project/${projectId}`);
            if (!response || !response.project) {
                console.warn(`No project found with ID ${projectId}`);
                return null;
            }
            return response.project;
        }
        catch (error) {
            console.error('Error fetching project:', error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }
    // Get a specific task by ID - direct method
    async getTaskById(taskId) {
        try {
            console.log(`Fetching specific task by ID: ${taskId}`);
            const response = await this.getData(`/task/${taskId}`);
            
            if (!response || (!response.task && !response.id)) {
                console.warn(`No task found with ID ${taskId} using direct API call`);
                return null;
            }
            
            // Handle both response formats (task object or array with single item)
            const task = response.task || response;
            console.log(`Successfully fetched task by ID: ${taskId}`);
            return task;
        } catch (error) {
            console.error(`Error fetching task by ID ${taskId}:`, error instanceof Error ? error.message : 'Unknown error');
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
            const workTypes = response.worktype.map((wt) => ({
                id: wt.id,
                worktype: wt.name,
                worktypeid: wt.id,
                projectid: ''
            }));
            console.log('Found global work types:', workTypes.map((wt) => wt.worktype));
            return workTypes;
        }
        catch (error) {
            console.error('Error fetching global work types:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }
    async createTimeEntry(payload) {
        var _a;
        console.log('Creating time entry with payload:', payload);
        // Validate time duration (already in hours)
        if (!payload.time || payload.time <= 0) {
            throw new Error('Invalid time duration. Must be greater than 0 hours.');
        }
        // Get current user first to get their personid
        const user = await this.getCurrentUser();
        console.log('Current user:', user);
        
        // First try to get the task directly by ID (most reliable method)
        console.log('Fetching task directly by ID:', payload.taskId);
        let task = await this.getTaskById(payload.taskId);
        
        // If direct fetch fails, try getting it from the list of all tasks
        if (!task) {
            console.log('Direct task fetch failed, trying from task list...');
            const tasks = await this.getTasks({ bypassCache: true });
            task = tasks.find((t) => t.id === payload.taskId);
            
            if (!task) {
                console.error('Available tasks from list:', tasks.map((t) => ({ id: t.id, title: t.title })));
                throw new Error(`Task not found with ID: ${payload.taskId}`);
            }
        }
        
        console.log('Task details:', task);
        /*
        // First try project-specific work types
        let workTypes = await this.getProjectWorkTypes(task.projectid);
        console.log('===== DEBUG: PROJECT WORK TYPES =====');
        workTypes.forEach((wt: WorkType) => {
            console.log(`Work Type: "${wt.worktype}", ID: ${wt.worktypeid}, Project ID: ${wt.projectid}`);
        });
        
        // Look for India-Meeting in project work types
        let indiaMeetingType = workTypes.find((wt: WorkType) =>
            wt.worktype.toLowerCase() === 'india-meeting'.toLowerCase()
        );
        
        // If not found in project work types, get global work types
        if (!indiaMeetingType) {
            console.log('India-Meeting not found in project work types, fetching global work types');
            const globalWorkTypes = await this.getGlobalWorkTypes();
            
            // Look for India-Meeting in global work types
            indiaMeetingType = globalWorkTypes.find((wt: WorkType) =>
                wt.worktype.toLowerCase() === 'india-meeting'.toLowerCase()
            );
            
            if (indiaMeetingType) {
                console.log('Found India-Meeting in global work types:', indiaMeetingType);
                // Associate it with the current project
                indiaMeetingType.projectid = task.projectid;
            }
        }
        
        if (!indiaMeetingType) {
            console.log('Work type we are looking for: India-Meeting');
            console.log('Available project work types:', workTypes.map((wt: WorkType) => wt.worktype).join(', '));
            throw new Error('India-Meeting work type not found. Please ensure this work type is available in your Intervals account.');
        }
        
        console.log('Using India-Meeting work type:', indiaMeetingType);
        */
        // TEMPORARY FIX: Use hardcoded worktype ID for India-Meeting
        console.log('Using hardcoded worktype ID 803850 for India-Meeting');
        const worktypeId = '803850'; // Hardcoded ID for India-Meeting
        // Ensure time is always a string with 2 decimal places to match AI agent format
        const timeValue = typeof payload.time === 'number' ? payload.time.toFixed(2) : String(payload.time);
        
        const requestBody = {
            personid: user.personid,
            taskid: payload.taskId,
            projectid: task.projectid,
            moduleid: task.moduleid,
            date: payload.date,
            time: timeValue,
            description: payload.description,
            worktypeid: worktypeId, // Use hardcoded worktype ID
            billable: (_a = payload.billable) !== null && _a !== void 0 ? _a : true
        };
        console.log('Posting time entry with request body:', requestBody);
        try {
            const response = await fetch(`${this.baseUrl}time`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response from Intervals:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }
            const result = await response.json();
            console.log('Successfully created time entry:', result);
            return result;
        }
        catch (error) {
            console.error('Failed to create time entry:', error);
            throw error;
        }
    }
}
exports.IntervalsAPI = IntervalsAPI;
