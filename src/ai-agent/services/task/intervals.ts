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
    ownerid?: string;
    followerid?: string; // Comma-separated list of follower person IDs
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
    ownerid?: string;
    followerid?: string; // Comma-separated list of follower person IDs
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

    public async getCurrentUser(): Promise<IntervalsUser> {
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

            // Fetch tasks using hastaskrelation (includes assigned, owned, and followed tasks)
            // and excludeclosed=true to filter out closed tasks at the API level
            const response = await fetch(
                `${this.baseUrl}/task/?hastaskrelation=${currentUser.personid}&excludeclosed=true&limit=500`,
                {
                    method: 'GET',
                    headers: this.headers
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch tasks: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`API response: Found ${data?.task?.length || 0} tasks for user ${currentUser.personid}`);

            if (!data?.task || !Array.isArray(data.task)) {
                console.warn('No tasks found or invalid response format');
                return [];
            }

            console.log(`Successfully retrieved ${data.task.length} open tasks (assigned to, owned by, or followed by user ${currentUser.personid})`);

            // Map to our Task interface - no filtering needed as API handles it
            return data.task.map((task: IntervalsTaskResponse) => ({
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
                assigneeid: task.assigneeid,
                ownerid: task.ownerid,
                followerid: task.followerid
            }));
        } catch (error) {
            console.error('Error fetching tasks from Intervals:', error);
            return [];
        }
    }
} 