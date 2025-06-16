import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { database } from '@/lib/database';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
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
      
      return res.status(200).json({
        success: true,
        reviews: userReviews
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