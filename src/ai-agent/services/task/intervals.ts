export interface Task {
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

export class IntervalsAPI {
    private readonly baseUrl: string;
    private readonly headers: Record<string, string>;

    constructor(apiToken: string) {
        this.baseUrl = 'https://api.myintervals.com';
        this.headers = {
            'Authorization': `Basic ${Buffer.from(apiToken + ':X').toString('base64')}`,
            'Content-Type': 'application/json'
        };
    }

    private async getCurrentUser(): Promise<IntervalsUser> {
        try {
            const response = await fetch(`${this.baseUrl}/me`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`Failed to get current user: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
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
            console.error('Error getting current user:', error);
            throw error;
        }
    }

    async getTasks(): Promise<Task[]> {
        try {
            // First get the current user to get their personid
            const currentUser = await this.getCurrentUser();
            console.log('Current user personid:', currentUser.personid);

            // Then fetch all tasks
            const response = await fetch(`${this.baseUrl}/task/`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch tasks: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (!data?.task || !Array.isArray(data.task)) {
                console.warn('No tasks found or invalid response format');
                return [];
            }

            // Filter tasks where the current user's ID is in the assigneeid list
            const userTasks = data.task.filter((task: IntervalsTaskResponse) => {
                if (!task.assigneeid) return false;
                const assignees = task.assigneeid.split(',');
                return assignees.includes(currentUser.personid);
            });

            console.log(`Found ${userTasks.length} tasks assigned to user ${currentUser.personid}`);

            return userTasks.map((task: IntervalsTaskResponse) => ({
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
            console.error('Error fetching tasks from Intervals:', error);
            return [];
        }
    }
} 