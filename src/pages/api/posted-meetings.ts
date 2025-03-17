import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { AIAgentPostedMeetingsStorage } from '../../ai-agent/services/storage/posted-meetings';
import { reviewService } from '../../ai-agent/services/review/review-service';
import { taskService } from '../../ai-agent/services/task/openai';
import fs from 'fs/promises';
import path from 'path';

interface UnmatchedMeeting {
    id: string;
    subject: string;
    startTime: string;
    duration: number;
    reason?: string;
}

interface UserData {
    userId: string;
    email: string;
    intervalsApiKey: string;
    lastSync: string;
}

interface UserDataFile {
    users: UserData[];
    postedMeetings: string[];
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    console.log('API: /api/posted-meetings called');

    if (req.method !== 'GET') {
        console.log('API: Method not allowed:', req.method);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('API: Getting session...');
        const session = await getSession({ req });
        console.log('API: Session:', session);

        if (!session) {
            console.log('API: No session found');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = session.user?.email;
        console.log('API: User ID:', userId);

        if (!userId) {
            console.log('API: No user ID found in session');
            return res.status(400).json({ error: 'User ID not found in session' });
        }

        // Get user's Intervals API key
        const userDataPath = path.join(process.cwd(), '.data', 'user-data.json');
        const userData = JSON.parse(await fs.readFile(userDataPath, 'utf-8')) as UserDataFile;
        const user = userData.users.find(u => u.userId === userId);
        
        if (!user?.intervalsApiKey) {
            console.log(`API: No Intervals API key found for user ${userId}`);
            return res.status(400).json({ error: 'Intervals API key not found' });
        }

        // Load meetings using AIAgentPostedMeetingsStorage
        console.log('API: Creating storage instance...');
        const storage = new AIAgentPostedMeetingsStorage();
        
        console.log('API: Loading data...');
        await storage.loadData();
        
        console.log('API: Getting posted meetings for user:', userId);
        const postedMeetings = await storage.getPostedMeetings(userId);
        console.log('API: Found posted meetings:', postedMeetings);

        // Fetch task names for meetings that don't have them
        const meetingsWithTaskNames = await Promise.all(postedMeetings.map(async (meeting) => {
            if (!meeting.taskName && meeting.timeEntry.taskid) {
                try {
                    const taskName = await taskService.getTaskNameById(meeting.timeEntry.taskid, user.intervalsApiKey);
                    if (taskName) {
                        // Update the meeting with the task name
                        meeting.taskName = taskName;
                    }
                } catch (error) {
                    console.error(`API: Error fetching task name for meeting ${meeting.meetingId}:`, error);
                }
            }
            return meeting;
        }));

        // Save the updated meetings back to storage
        const storage2 = new AIAgentPostedMeetingsStorage();
        await storage2.loadData();
        
        // Update each meeting in storage
        for (const meeting of meetingsWithTaskNames) {
            if (meeting.taskName) {
                // Find the meeting in storage and update it
                const index = storage2.data.meetings.findIndex(m => 
                    m.meetingId === meeting.meetingId && m.userId === userId
                );
                
                if (index !== -1) {
                    storage2.data.meetings[index].taskName = meeting.taskName;
                }
            }
        }
        
        // Save the updated data
        await storage2.saveData();

        // Sort meetings by posted date
        const sortedMeetings = meetingsWithTaskNames.sort((a, b) => 
            new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        );
        console.log('API: Sorted meetings:', sortedMeetings);

        // Get unmatched meetings from the review service
        console.log('API: Getting pending reviews (unmatched meetings) for user:', userId);
        const pendingReviews = await reviewService.getPendingReviews(userId);
        
        // Convert pending reviews to unmatched meetings format
        const unmatchedMeetings: UnmatchedMeeting[] = pendingReviews.map(review => ({
            id: review.id,
            subject: review.subject,
            startTime: review.startTime,
            duration: review.duration,
            reason: review.reason
        }));
        
        console.log('API: Found unmatched meetings:', unmatchedMeetings);

        const response = {
            success: true,
            meetings: sortedMeetings,
            unmatchedMeetings,
            summary: {
                total: sortedMeetings.length,
                unmatched: unmatchedMeetings.length
            }
        };
        console.log('API: Sending response:', response);

        return res.status(200).json(response);
    } catch (error: unknown) {
        console.error('API Error fetching posted meetings:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to fetch posted meetings',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
} 