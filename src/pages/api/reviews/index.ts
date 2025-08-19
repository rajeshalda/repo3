import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { database } from '@/lib/database';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user?.email;
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in session' });
    }

    try {
      // Get reviews from SQLite database
      const userReviews = database.getReviewsByUser(userId);
      
      console.log(`Fetched ${userReviews.length} reviews for user ${userId}`);
      
      // Transform the raw database objects to match the expected format
      const formattedReviews = userReviews.map(review => ({
        id: review.id,
        userId: review.user_id,
        subject: review.subject || '',
        startTime: review.start_time || '',
        endTime: review.end_time || '',
        duration: review.duration || 0,
        participants: review.participants ? JSON.parse(review.participants) : [],
        keyPoints: review.key_points ? JSON.parse(review.key_points) : [],
        suggestedTasks: review.suggested_tasks ? JSON.parse(review.suggested_tasks) : [],
        status: review.status || 'pending',
        confidence: review.confidence || 0,
        reason: review.reason || '',
        reportId: review.report_id
      }));
      
      console.log(`Returning ${formattedReviews.length} formatted reviews`);
      
      return res.status(200).json({
        success: true,
        reviews: formattedReviews
      });
    } catch (error) {
      console.error('Error reading reviews from database:', error);
      // If there's an error, return an empty array
      return res.status(200).json({
        success: true,
        reviews: []
      });
    }
  } catch (error) {
    console.error('Error in reviews API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 