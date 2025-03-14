import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { meetingService } from '../../ai-agent/services/meeting/openai';

// Store the current batch ID globally
let currentBatchId: string | null = null;

// Function to set the current batch ID
export function setCurrentBatchId(batchId: string) {
  currentBatchId = batchId;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Set proper content type
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only GET requests are allowed'
    });
  }

  try {
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'You must be logged in to access this endpoint'
      });
    }

    // If no batch is currently processing
    if (!currentBatchId) {
      return res.status(200).json({ 
        batchId: null,
        message: 'No batch is currently processing',
        completedMeetings: 0,
        totalMeetings: 0
      });
    }

    try {
      // Get the status of the current batch
      const status = meetingService.getBatchStatus(currentBatchId);
      
      if (!status) {
        // Batch not found or completed
        currentBatchId = null;
        return res.status(200).json({ 
          batchId: null,
          message: 'Batch not found or completed',
          completedMeetings: 0,
          totalMeetings: 0
        });
      }

      // Return the batch status
      return res.status(200).json({
        batchId: currentBatchId,
        message: 'Batch is processing',
        completedMeetings: status.completedMeetings,
        totalMeetings: status.totalMeetings,
        processed: status.processed.length,
        failed: status.failed.length
      });
    } catch (statusError) {
      console.error('Error getting batch status:', statusError);
      // If there's an error getting the status, clear the batch ID
      currentBatchId = null;
      return res.status(200).json({ 
        batchId: null,
        message: 'Error getting batch status',
        error: statusError instanceof Error ? statusError.message : 'Unknown error',
        completedMeetings: 0,
        totalMeetings: 0
      });
    }
  } catch (error) {
    console.error('Error in batch-status API:', error);
    return res.status(500).json({ 
      error: 'Failed to get batch status',
      message: error instanceof Error ? error.message : 'Unknown error',
      batchId: null,
      completedMeetings: 0,
      totalMeetings: 0
    });
  }
} 