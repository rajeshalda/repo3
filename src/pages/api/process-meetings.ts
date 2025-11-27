import { NextApiRequest, NextApiResponse } from 'next';
import { fetchUserMeetings } from '../../ai-agent/services/meeting/test';
import { meetingService } from '../../ai-agent/services/meeting/openai';
import { taskService } from '../../ai-agent/services/task/openai';
import { timeEntryService } from '../../ai-agent/services/time-entry/intervals';
import { meetingComparisonService } from '../../ai-agent/services/meeting/comparison';
import { reviewService } from '../../ai-agent/services/review/review-service';
import { setCurrentBatchId } from './batch-status';
import { setLogUser, logInfo, logError, logDebug, clearLogUser } from '../../lib/ndjson-logger';

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

    // Set user context for logging
    setLogUser(userId as string);

    console.log(`Processing meetings for user ${userId} from source: ${source || 'api'}`);
    logInfo('processing_started', `Processing meetings for user from source: ${source || 'api'}`, { source });

    try {
      // Get meetings for the user using fetchUserMeetings function
      console.log('Fetching meetings for user:', userId);
      logInfo('fetching_meetings', 'Fetching meetings for user');

      const { meetings } = await fetchUserMeetings(userId as string);

      console.log(`Found ${meetings.length} meetings for processing`);
      logInfo('meetings_fetched', `Found ${meetings.length} meetings for processing`, {
        totalMeetings: meetings.length
      });

      if (!meetings || meetings.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No meetings found to process',
          batchId: null
        });
      }

      // EARLY DUPLICATE DETECTION: Filter out meetings that are already posted BEFORE batch processing
      // This prevents race conditions where two cycles process the same meetings
      console.log('🔍 EARLY DUPLICATE CHECK: Filtering already posted meetings before processing...');
      logDebug('early_duplicate_check', '🔍 EARLY DUPLICATE CHECK: Filtering already posted meetings before processing...');
      const { AIAgentPostedMeetingsStorage } = await import('../../ai-agent/services/storage/posted-meetings');
      const postedStorage = new AIAgentPostedMeetingsStorage();
      await postedStorage.loadData();

      const meetingsToProcess = [];
      let skippedCount = 0;

      for (const meeting of meetings) {
        // Check if meeting has reportId in attendance data
        const reportId = meeting.attendance?.reportId;

        if (reportId) {
          // Check if this reportId is already posted
          const isAlreadyPosted = await postedStorage.isPosted(
            userId as string,
            meeting.id,
            undefined,
            undefined,
            reportId
          );

          if (isAlreadyPosted) {
            const skipMsg = `⏭️ EARLY SKIP: "${meeting.subject}" already posted (reportId: ${reportId})`;
            console.log(skipMsg);
            logDebug('early_skip', skipMsg, { subject: meeting.subject, reportId });
            skippedCount++;
            continue;
          }
        }

        meetingsToProcess.push(meeting);
      }

      const filterResultsMsg = `📊 EARLY FILTER RESULTS: ${meetings.length} total → ${meetingsToProcess.length} to process (${skippedCount} already posted)`;
      console.log(filterResultsMsg);
      logDebug('filter_results', filterResultsMsg, { total: meetings.length, toProcess: meetingsToProcess.length, skipped: skippedCount });
      logInfo('duplicate_filter', `Early filter results`, {
        totalMeetings: meetings.length,
        toProcess: meetingsToProcess.length,
        skipped: skippedCount
      });

      if (meetingsToProcess.length === 0) {
        logInfo('all_meetings_posted', 'All meetings have already been posted', {
          totalMeetings: meetings.length,
          alreadyPosted: skippedCount
        });
        clearLogUser();
        return res.status(200).json({
          success: true,
          message: 'All meetings have already been posted',
          batchId: null,
          data: {
            totalMeetings: meetings.length,
            alreadyPosted: skippedCount,
            newMeetings: 0
          }
        });
      }

      // Start a batch processing job with the filtered meetings
      const batchId = await meetingService.analyzeMeetingBatch(meetingsToProcess, userId as string);
      console.log(`Started batch processing with ID: ${batchId}`);
      logInfo('batch_started', `Started batch processing with ID: ${batchId}`, {
        batchId,
        meetingsCount: meetingsToProcess.length
      });
      
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
      
      // Get the processed meetings from storage (only for meetings we actually processed)
      const processedMeetings = [];
      for (const meeting of meetingsToProcess) {
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
      logDebug('processed_count', `Successfully processed ${processedMeetings.length} meetings`, { count: processedMeetings.length });

      // Filter out already processed meetings and meetings the user didn't attend
      console.log('Filtering out already processed meetings and meetings the user didn\'t attend...');
      logDebug('filtering_meetings', 'Filtering out already processed meetings and meetings the user didn\'t attend...');
      const uniqueMeetings = await meetingComparisonService.filterNewMeetings(processedMeetings);
      
      // Further filter to only include meetings the user actually attended
      const attendedMeetings = uniqueMeetings.filter(meeting => {
        // Check if the user actually attended this meeting
        // Handle both simple attendance.records and advanced allValidReports formats
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
        // Check allValidReports format (from AI agent processing)
        else if (meeting.attendance?.allValidReports && meeting.attendance.allValidReports.length > 0) {
          // Meeting has allValidReports, which means it was processed by AI agent and has attendance data
          // The meeting comparison service will handle creating instances with proper attendance records
          console.log(`User ${userId} has attendance data in allValidReports format for meeting "${meeting.subject}" with ${meeting.attendance.allValidReports.length} reports`);
          return true;
        }
        
        console.log(`No attendance records found for meeting "${meeting.subject}". Skipping.`);
        return false;
      });
      
      console.log(`Found ${uniqueMeetings.length} unique meetings, ${attendedMeetings.length} of which were attended by the user`);
      logDebug('unique_attended', `Found ${uniqueMeetings.length} unique meetings, ${attendedMeetings.length} attended`, { unique: uniqueMeetings.length, attended: attendedMeetings.length });

      // IMPORTANT: Check review queue first to avoid double-processing meetings
      console.log('Checking review queue for meetings that might now have matching tasks...');
      logDebug('review_queue_check', 'Checking review queue for meetings that might now have matching tasks...');
      const { storageManager } = await import('../../ai-agent/data/storage/manager');
      const reviewMeetings = await storageManager.getPendingReviews(userId as string);
      console.log(`Found ${reviewMeetings.length} meetings in review queue for user ${userId}`);
      logDebug('review_queue_count', `Found ${reviewMeetings.length} meetings in review queue`, { count: reviewMeetings.length, reviewMeetings });

      // Get the reportIds of meetings that are in the review queue (more reliable than meeting IDs)
      const reviewReportIds = new Set(
        reviewMeetings
          .filter(rm => rm.reportId) // Only include meetings with reportId
          .map(rm => rm.reportId)
      );

      console.log(`Review queue reportIds: [${Array.from(reviewReportIds).join(', ')}]`);
      logDebug('review_report_ids', `Review queue reportIds`, { reportIds: Array.from(reviewReportIds) });
      
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
      logDebug('filtered_meetings', `Filtered meetings`, { total: attendedMeetings.length, new: newMeetingsOnly.length, inReview: attendedMeetings.length - newMeetingsOnly.length });

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
      logDebug('all_meetings_to_process', `Total meetings to process`, { new: newMeetingsOnly.length, review: reviewMeetingsToReprocess.length, total: allMeetingsToProcess.length, meetings: allMeetingsToProcess });

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

              // Check if this is a worktype validation error
              if (timeEntry && typeof timeEntry === 'object' && 'success' in timeEntry && timeEntry.success === false) {
                if (timeEntry.error === 'WORKTYPE_NOT_AVAILABLE') {
                  console.error(`⚠️ Worktype validation failed for meeting: ${meeting.subject}`);
                  console.log(`📋 Sending meeting to review queue due to worktype unavailability`);

                  // Send to review queue with worktype error reason
                  await reviewService.queueForReview({
                    id: meeting.id,
                    userId: userId as string,
                    subject: meeting.subject,
                    startTime: meeting.start.dateTime,
                    endTime: meeting.end.dateTime,
                    duration: meeting.attendance?.summary?.totalDuration || 0,
                    confidence: result.matchedTasks[0].confidence || 0,
                    suggestedTask: {
                      taskId: result.matchedTasks[0].taskId,
                      taskTitle: result.matchedTasks[0].taskTitle
                    },
                    reason: `Worktype "India-Meeting" not available for task "${(timeEntry as any).validationData?.taskTitle}" (${(timeEntry as any).validationData?.projectName})`,
                    status: 'pending' as const,
                    queuedAt: new Date().toISOString(),
                    meetingInfo: meeting.meetingInfo,
                    attendance: meeting.attendance,
                    reportId: meeting.attendance?.reportId
                  });

                  console.log(`✅ Meeting sent to review queue: ${meeting.subject}`);
                  continue;
                }
              }

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
      
      // Log complete summary with all details
      logInfo('processing_completed', `Successfully processed ${newMeetingsOnly.length} new meetings and ${reviewMeetingsToReprocess.length} review meetings`, {
        totalMeetingsFetched: meetings.length,
        earlyFilterSkipped: skippedCount,
        processedMeetings: processedMeetings.length,
        uniqueMeetings: uniqueMeetings.length,
        attendedMeetings: attendedMeetings.length,
        newMeetingsOnly: newMeetingsOnly.length,
        reviewMeetingsInQueue: reviewMeetings.length,
        reviewMeetingsReprocessed: reviewMeetingsToReprocess.length,
        totalProcessed: allMeetingsToProcess.length,
        timeEntriesCreated: timeEntries.length,
        matchedTasksCount: matchResults.filter(r => r.matchedTasks && r.matchedTasks.length > 0).length
      });

      clearLogUser();

      return res.status(200).json({
        success: true,
        message: `Successfully processed ${newMeetingsOnly.length} new meetings and ${reviewMeetingsToReprocess.length} review meetings`,
        data: {
          totalMeetingsFetched: meetings.length,
          earlyFilterSkipped: skippedCount,
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
      logError('processing_error', 'Error processing meetings', processingError as Error);
      clearLogUser();
      throw processingError;
    }
  } catch (error) {
    console.error('Error in process-meetings API:', error);
    logError('api_error', 'Error in process-meetings API', error as Error);
    clearLogUser();
    return res.status(500).json({
      success: false,
      message: 'Failed to process meetings',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 