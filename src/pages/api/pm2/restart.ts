import { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Restart the AI-agent PM2 process
    await execAsync('npm run pm2:restart');
    
    return res.status(200).json({ 
      success: true, 
      message: 'AI agent restarted successfully' 
    });
  } catch (error) {
    console.error('Error restarting AI agent with PM2:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to restart AI agent',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 