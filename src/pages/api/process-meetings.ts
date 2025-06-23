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

    try {
      // Get meetings for the user using fetchUserMeetings function
      console.log('Fetching meetings for user:', userId);
      const { meetings } = await fetchUserMeetings(userId as string);
      
      console.log(`Found ${meetings.length} meetings for processing`);
      
      if (!meetings || meetings.length === 0) {
        return res.status(200).json({ 
          success: true, 
          message: 'No meetings found to process',
          batchId: null
        });
      }
      
      // Start a batch processing job with the correct method
      const batchId = await meetingService.analyzeMeetingBatch(meetings, userId as string);
      console.log(`Started batch processing with ID: ${batchId}`);
      
      // Set the current batch ID for status tracking
      setCurrentBatchId(batchId);
      
      // Wait for batch processing to complete
      const batchCompleted = await pollBatchStatus(batchId);
      
      // Clear the current batch ID
      setCurrentBatchId('');
      
      if (!batchCompleted) {
        return res.status(500).json({ 
          success: false, 
          error: 'Batch processing timed out or failed',
          message: 'Failed to process all meetings in the batch'
        });
      }
      
      // Get the processed meetings from storage
      const processedMeetings = [];
      for (const meeting of meetings) {
        try {
          const processed = await meetingService.getProcessedMeeting(meeting.id);
          if (processed) {
            processedMeetings.push(processed);
          }
        } catch (error) {
          console.error(`Error getting processed meeting ${meeting.id}:`, error);
        }
      }
      
      console.log(`Successfully processed ${processedMeetings.length} meetings`);

      // Filter out already processed meetings and meetings the user didn't attend
      console.log('Filtering out already processed meetings and meetings the user didn\'t attend...');
      const uniqueMeetings = await meetingComparisonService.filterNewMeetings(processedMeetings);
      
      // Further filter to only include meetings the user actually attended
      const attendedMeetings = uniqueMeetings.filter(meeting => {
        // Check if the user actually attended this meeting
        if (meeting.attendance?.records) {
          const userRecord = meeting.attendance.records.find(record => 
            record.email.toLowerCase() === (userId as string).toLowerCase()
          );
          
          if (userRecord && userRecord.duration > 0) {
            console.log(`User ${userId} attended meeting "${meeting.subject}" for ${userRecord.duration} seconds`);
            return true;
          } else {
            console.log(`User ${userId} did not attend meeting "${meeting.subject}" or had zero duration. Skipping.`);
            return false;
          }
        }
        console.log(`No attendance records found for meeting "${meeting.subject}". Skipping.`);
        return false;
      });
      
      console.log(`Found ${uniqueMeetings.length} unique meetings, ${attendedMeetings.length} of which were attended by the user`);

      // IMPORTANT: Check review queue first to avoid double-processing meetings
      console.log('Checking review queue for meetings that might now have matching tasks...');
      const { storageManager } = await import('../../ai-agent/data/storage/manager');
      const reviewMeetings = await storageManager.getPendingReviews(userId as string);
      console.log(`Found ${reviewMeetings.length} meetings in review queue for user ${userId}`);
      
      // Get the reportIds of meetings that are in the review queue (more reliable than meeting IDs)
      const reviewReportIds = new Set(
        reviewMeetings
          .filter(rm => rm.reportId) // Only include meetings with reportId
          .map(rm => rm.reportId)
      );
      
      console.log(`Review queue reportIds: [${Array.from(reviewReportIds).join(', ')}]`);
      
      // CRITICAL: Remove meetings from calendar processing if their reportId is already in review queue
      // This prevents double-processing the same meeting attendance instance
      const newMeetingsOnly = attendedMeetings.filter(meeting => {
        const meetingReportId = meeting.attendance?.reportId;
        if (meetingReportId && reviewReportIds.has(meetingReportId)) {
          console.log(`Excluding meeting "${meeting.subject}" (reportId: ${meetingReportId}) from new processing - already in review queue`);
          return false;
        }
        return true;
      });
      
      console.log(`Filtered meetings: ${attendedMeetings.length} total → ${newMeetingsOnly.length} new (${attendedMeetings.length - newMeetingsOnly.length} already in review)`);
      
      // Convert review meetings back to ProcessedMeeting format for task matching
      // Use the meetings we already fetched from calendar that match the review queue
      const reviewMeetingsToReprocess = [];
      for (const reviewMeeting of reviewMeetings) {
        if (reviewMeeting.status === 'pending') {
          // Find the corresponding meeting from our calendar fetch using reportId
          const matchingMeeting = attendedMeetings.find(meeting => 
            meeting.attendance?.reportId === reviewMeeting.reportId
          );
          
          if (matchingMeeting) {
            reviewMeetingsToReprocess.push(matchingMeeting);
            console.log(`Added review meeting to reprocessing: ${reviewMeeting.subject} (reportId: ${reviewMeeting.reportId})`);
          } else {
            console.log(`Could not find matching calendar meeting for review meeting: ${reviewMeeting.subject} (reportId: ${reviewMeeting.reportId})`);
          }
        }
      }
      
      // Combine NEW meetings with review meetings for task matching
      const allMeetingsToProcess = [...newMeetingsOnly, ...reviewMeetingsToReprocess];
      console.log(`Total meetings to process (new: ${newMeetingsOnly.length} + review: ${reviewMeetingsToReprocess.length}): ${allMeetingsToProcess.length}`);

      if (allMeetingsToProcess.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No meetings found that were attended by the user or in review queue',
          data: {
            totalMeetings: meetings.length,
            processedMeetings: processedMeetings.length,
            uniqueMeetings: uniqueMeetings.length,
            attendedMeetings: attendedMeetings.length,
            newMeetingsOnly: 0,
            reviewMeetingsInQueue: reviewMeetings.length,
            matchResults: [],
            timeEntries: []
          }
        });
      }

      // Get task matches for all meetings (new + review queue)
      console.log('Matching tasks to all meetings (new + review queue)...');
      const matchResults = [];
      for (const meeting of allMeetingsToProcess) {
        try {
          console.log('Matching tasks for meeting:', meeting.subject);
          const matches = await taskService.matchTasksToMeeting(meeting, userId as string);
          if (matches === null) {
            console.log(`Meeting queued for review: ${meeting.id} - ${meeting.subject}`);
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
            console.log(`Found ${matches.matchedTasks?.length || 0} matches for meeting: ${meeting.subject}`);
          }
          await delay(2000); // Add delay between calls
        } catch (error) {
          console.error('Error matching tasks for meeting:', meeting.subject, error);
          matchResults.push({
            meetingId: meeting.id,
            meetingSubject: meeting.subject,
            matchedTasks: [],
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Create time entries for matched meetings
      console.log('Creating time entries...');
      const timeEntries = [];
      for (const result of matchResults) {
        // Skip meetings that need review or had errors
        if (result.needsReview || result.error) {
          console.log(`Skipping time entry creation for meeting: ${result.meetingSubject} - ${result.needsReview ? 'Needs review' : 'Has error'}`);
          continue;
        }

        if (result.matchedTasks && result.matchedTasks.length > 0) {
          const meeting = allMeetingsToProcess.find(m => m.id === result.meetingId);
          if (meeting) {
            try {
              console.log(`Creating time entry for meeting: ${meeting.subject}`);
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
              console.log(`Successfully created time entry for: ${meeting.subject}`);
              
              // IMPORTANT: Remove this meeting from the review queue since it was successfully processed
              // Use reportId for more accurate matching
              const meetingReportId = meeting.attendance?.reportId;
              const wasInReviewQueue = reviewMeetingsToReprocess.some(rm => 
                rm.attendance?.reportId === meetingReportId && meetingReportId
              );
              
              if (wasInReviewQueue && meetingReportId) {
                console.log(`Removing meeting ${meeting.subject} (reportId: ${meetingReportId}) from review queue - successfully processed`);
                
                // Find the review meeting by reportId to get the correct meetingId for the update
                const reviewMeeting = reviewMeetings.find(rm => rm.reportId === meetingReportId);
                if (reviewMeeting) {
                  await storageManager.updateReviewStatus({
                    meetingId: reviewMeeting.id,
                    taskId: result.matchedTasks[0].taskId,
                    status: 'approved',
                    feedback: `Auto-processed: matched to task ${result.matchedTasks[0].taskTitle} (reportId: ${meetingReportId})`,
                    decidedAt: new Date().toISOString(),
                    decidedBy: userId as string
                  });
                } else {
                  console.warn(`Could not find review meeting with reportId ${meetingReportId} for status update`);
                }
              }
              
              await delay(2000); // Add delay between calls
            } catch (error) {
              console.error('Error creating time entry:', error);
              timeEntries.push({
                meetingId: meeting.id,
                meetingSubject: meeting.subject,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        }
      }
      
      return res.status(200).json({ 
        success: true, 
        message: `Successfully processed ${newMeetingsOnly.length} new meetings and ${reviewMeetingsToReprocess.length} review meetings`, 
        data: {
          totalMeetings: meetings.length,
          processedMeetings: processedMeetings.length,
          uniqueMeetings: uniqueMeetings.length,
          attendedMeetings: attendedMeetings.length,
          newMeetingsOnly: newMeetingsOnly.length,
          reviewMeetingsInQueue: reviewMeetings.length,
          reviewMeetingsReprocessed: reviewMeetingsToReprocess.length,
          totalProcessed: allMeetingsToProcess.length,
          matchResults,
          timeEntries
        }
      });
    } catch (processingError) {
      console.error(`Error processing meetings:`, processingError);
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