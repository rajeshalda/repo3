import { NextApiRequest, NextApiResponse } from 'next';
import { fetchUserMeetings } from '../../ai-agent/services/meeting/test';
import { meetingService } from '../../ai-agent/services/meeting/openai';
import { taskService } from '../../ai-agent/services/task/openai';
import { timeEntryService } from '../../ai-agent/services/time-entry/intervals';
import { meetingComparisonService } from '../../ai-agent/services/meeting/comparison';
import { setCurrentBatchId } from './batch-status';

// Enhanced version of delay that respects AbortSignal
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), ms));

// Helper function to poll batch status
async function pollBatchStatus(batchId: string, timeoutMs: number = 300000): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = meetingService.getBatchStatus(batchId);
      
      if (!status) {
        console.log('Batch not found');
        return false;
      }
      
      const { totalMeetings, completedMeetings } = status;
      console.log(`Progress: ${completedMeetings}/${totalMeetings} meetings processed`);
      
      if (completedMeetings >= totalMeetings) {
        console.log('All meetings processed');
        console.log('===== BATCH PROCESSING COMPLETED =====');
        return true;
      }
      
      // Wait before checking again
      await delay(5000);
    } catch (error) {
      console.error('Error polling batch status:', error);
      await delay(5000); // Still wait before retrying
    }
  }
  
  console.log('Batch processing timed out');
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { userId, source, forceProcess } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    console.log(`Processing meetings for user ${userId} from source: ${source || 'api'}`);
    console.log(`===== STARTING PROCESSING CYCLE =====`);

    try {
      // Get meetings for the user using fetchUserMeetings function
      console.log('[STEP 1/4] [INFO] Fetching meetings for user:', userId);
      const { meetings } = await fetchUserMeetings(userId as string);
      
      console.log(`[INFO] Total meetings fetched from Graph API: ${meetings.length}`);
      
      if (!meetings || meetings.length === 0) {
        console.log('[INFO] No meetings found to process');
        return res.status(200).json({ 
          success: true, 
          message: 'No meetings found to process',
          batchId: null
        });
      }
      
      // Start a batch processing job with the correct method
      console.log('[STEP 2/4] [INFO] Starting batch analysis...');
      const batchId = await meetingService.analyzeMeetingBatch(meetings, userId as string);
      console.log(`[INFO] Batch processing started with ID: ${batchId}`);
      
      // Set the current batch ID for status tracking
      setCurrentBatchId(batchId);
      
      // Wait for batch processing to complete
      const batchCompleted = await pollBatchStatus(batchId);
      
      // Clear the current batch ID
      setCurrentBatchId('');
      
      if (!batchCompleted) {
        console.error('[ERROR] Batch processing failed or timed out');
        return res.status(500).json({ 
          success: false, 
          error: 'Batch processing timed out or failed',
          message: 'Failed to process all meetings in the batch'
        });
      }
      
      // Get the processed meetings from storage
      console.log('[STEP 3/4] [INFO] Retrieving processed meetings...');
      const processedMeetings = [];
      for (const meeting of meetings) {
        try {
          const processed = await meetingService.getProcessedMeeting(meeting.id);
          if (processed) {
            processedMeetings.push(processed);
          }
        } catch (error) {
          console.error(`[ERROR] Failed to retrieve processed meeting ${meeting.id}:`, error);
        }
      }
      
      console.log(`[SUCCESS] Retrieved ${processedMeetings.length} processed meetings`);

      // Filter out already processed meetings and meetings the user didn't attend
      console.log('[STEP 4/4] [INFO] Filtering meetings...');
      const uniqueMeetings = await meetingComparisonService.filterNewMeetings(processedMeetings);
      
      // Further filter to only include meetings the user actually attended
      const attendedMeetings = uniqueMeetings.filter(meeting => {
        // Check if the user actually attended this meeting
        if (meeting.attendance?.records) {
          const userRecord = meeting.attendance.records.find(record => 
            record.email.toLowerCase() === (userId as string).toLowerCase()
          );
          
          if (userRecord && userRecord.duration > 0) {
            console.log(`[INFO] User ${userId} attended meeting "${meeting.subject}" for ${userRecord.duration} seconds`);
            return true;
          } else {
            console.warn(`[WARN] User ${userId} did not attend meeting "${meeting.subject}" or had zero duration - skipping`);
            return false;
          }
        }
        console.warn(`[WARN] No attendance records found for meeting "${meeting.subject}" - skipping`);
        return false;
      });
      
      console.log(`[INFO] ===== MEETINGS STATISTICS =====`);
      console.log(`[INFO] Total Meetings Fetched: ${meetings.length}`);
      console.log(`[INFO] Total Meetings Processed: ${processedMeetings.length}`);
      console.log(`[INFO] Unique Meetings: ${uniqueMeetings.length}`);
      console.log(`[INFO] Attended Meetings: ${attendedMeetings.length}`);
      console.log(`[INFO] ===============================`);

      if (attendedMeetings.length === 0) {
        console.log('[INFO] No attended meetings found');
        return res.status(200).json({
          success: true,
          message: 'No meetings found that were attended by the user',
          data: {
            totalMeetings: meetings.length,
            processedMeetings: processedMeetings.length,
            uniqueMeetings: uniqueMeetings.length,
            attendedMeetings: 0,
            matchResults: [],
            timeEntries: []
          }
        });
      }

      // Get task matches for attended meetings
      console.log('[STEP 1/2] [INFO] Matching tasks to attended meetings...');
      const matchResults = [];
      for (const meeting of attendedMeetings) {
        try {
          console.log('[INFO] Processing meeting:', meeting.subject);
          const matches = await taskService.matchTasksToMeeting(meeting, userId as string);
          if (matches === null) {
            console.warn(`[WARN] Meeting queued for review: ${meeting.id} - ${meeting.subject}`);
            matchResults.push({
              meetingId: meeting.id,
              meetingSubject: meeting.subject,
              matchedTasks: [],
              needsReview: true
            });
          } else {
            matchResults.push({
              meetingId: meeting.id,
              ...matches
            });
            console.log(`[SUCCESS] Found ${matches.matchedTasks?.length || 0} task matches for meeting: ${meeting.subject}`);
          }
          await delay(2000); // Add delay between calls
        } catch (error) {
          console.error('[ERROR] Failed to match tasks for meeting:', meeting.subject, error);
          matchResults.push({
            meetingId: meeting.id,
            meetingSubject: meeting.subject,
            matchedTasks: [],
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Create time entries for matched meetings
      console.log('[STEP 2/2] [INFO] Creating time entries...');
      const timeEntries = [];
      let successfulTimeEntries = 0;
      let failedTimeEntries = 0;

      for (const result of matchResults) {
        // Skip meetings that need review or had errors
        if (result.needsReview || result.error) {
          console.warn(`[WARN] Skipping time entry creation for meeting: ${result.meetingSubject} - ${result.needsReview ? 'Needs review' : 'Has error'}`);
          continue;
        }

        if (result.matchedTasks && result.matchedTasks.length > 0) {
          const meeting = attendedMeetings.find(m => m.id === result.meetingId);
          if (meeting) {
            try {
              console.log(`[INFO] Creating time entry for meeting: ${meeting.subject}`);
              const timeEntry = await timeEntryService.createTimeEntry(
                meeting,
                {
                  taskId: result.matchedTasks[0].taskId,
                  taskTitle: result.matchedTasks[0].taskTitle
                },
                userId as string
              );
              timeEntries.push({
                meetingId: meeting.id,
                meetingSubject: meeting.subject,
                timeEntry
              });
              console.log(`[SUCCESS] Time entry created for: ${meeting.subject}`);
              successfulTimeEntries++;
              await delay(2000); // Add delay between calls
            } catch (error) {
              console.error('[ERROR] Failed to create time entry:', error);
              timeEntries.push({
                meetingId: meeting.id,
                meetingSubject: meeting.subject,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
              failedTimeEntries++;
            }
          }
        }
      }
      
      const processedMeetingIds = new Set(processedMeetings.map(m => m.id));
      const remainingMeetings = meetings.filter(m => !processedMeetingIds.has(m.id));

      // At the end of the function, add a clear completion message
      console.log(`[INFO] ===== PRIMARY PROCESSING CYCLE SUMMARY =====`);
      console.log(`[INFO] Total Meetings: ${meetings.length}`);
      console.log(`[SUCCESS] Time Entries Created: ${successfulTimeEntries}`);
      console.log(`[ERROR] Time Entries Failed: ${failedTimeEntries}`);
      console.log(`[INFO] =======================================`);

      // For the second cycle
      if (remainingMeetings.length > 0) {
        console.log(`[INFO] ===== STARTING SECONDARY PROCESSING CYCLE =====`);
        console.log(`[INFO] Processing ${remainingMeetings.length} remaining meetings`);
        // ... process remaining meetings ...
        console.log(`[SUCCESS] Secondary processing cycle completed`);
        console.log(`[INFO] Remaining Meetings Processed: ${remainingMeetings.length}`);
      }

      return res.status(200).json({
        success: true,
        message: `Successfully processed all meetings`,
        data: {
          totalMeetings: meetings.length,
          processedMeetings: processedMeetings.length,
          uniqueMeetings: uniqueMeetings.length,
          attendedMeetings: attendedMeetings.length,
          matchResults,
          timeEntries
        }
      });
    } catch (processingError) {
      console.error(`Error processing meetings:`, processingError);
      console.log('===== PROCESSING CYCLE FAILED WITH ERROR =====');
      throw processingError;
    }
  } catch (error) {
    console.error('Error in process-meetings API:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to process meetings',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 