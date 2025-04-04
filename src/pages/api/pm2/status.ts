import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Forward the request to the PM2 service running on localhost:3100
    const response = await fetch('http://localhost:3100/api/status');
    
    if (!response.ok) {
      throw new Error(`PM2 service responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching PM2 status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch PM2 status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 