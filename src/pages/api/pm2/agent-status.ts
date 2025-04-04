import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      // Get agent status
      const userId = req.query.userId || 'default-user';
      const url = `http://localhost:3100/api/agent-status?userId=${encodeURIComponent(String(userId))}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`PM2 service responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    } else if (req.method === 'POST') {
      // Update agent status
      const { userId, enabled } = req.body;
      
      const response = await fetch('http://localhost:3100/api/agent-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, enabled }),
      });
      
      if (!response.ok) {
        throw new Error(`PM2 service responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    } else {
      return res.status(405).json({ success: false, message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error with PM2 agent status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to process PM2 agent status request',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 