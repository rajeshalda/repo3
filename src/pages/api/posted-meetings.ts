import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { database } from '@/lib/database';
// Note: Using legacy review service for now - will be migrated to SQLite in next phase
import { reviewService } from '../../ai-agent/services/review/review-service';

interface UnmatchedMeeting {
    id: string;
    subject?: string;
    startTime?: string;
    duration?: number;
    reason?: string;
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

        // Get user's Intervals API key from SQLite database
        const user = database.getUserByEmail(userId);
        
        if (!user?.intervals_api_key) {
            console.log(`API: No Intervals API key found for user ${userId}`);
            return res.status(400).json({ error: 'Intervals API key not found' });
        }

        // Get posted meetings from SQLite database
        console.log('API: Getting posted meetings for user:', userId);
        const postedMeetings = database.getMeetingsByUser(userId);
        console.log('API: Found posted meetings:', postedMeetings);

        // Convert database meetings to expected format
        const formattedMeetings = postedMeetings.map(meeting => ({
            meetingId: meeting.meeting_id,
            userId: meeting.user_id,
            timeEntry: meeting.time_entry ? JSON.parse(meeting.time_entry) : null,
            rawResponse: meeting.raw_response ? JSON.parse(meeting.raw_response) : null,
            postedAt: meeting.posted_at || meeting.created_at,
            taskName: meeting.task_name,
            reportId: meeting.report_id
        }));

        // Sort meetings by posted date
        const sortedMeetings = formattedMeetings.sort((a, b) => 
            new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime()
        );
        console.log('API: Sorted meetings:', sortedMeetings);

        // Get unmatched meetings from the review service
        console.log('API: Getting pending reviews (unmatched meetings) for user:', userId);
        const pendingReviews = await reviewService.getPendingReviews(userId);
        
        // Convert pending reviews to unmatched meetings format
        const unmatchedMeetings: UnmatchedMeeting[] = pendingReviews.map((review: any) => ({
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