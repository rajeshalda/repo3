import { MeetingService } from './openai';
import { Meeting } from '../../../interfaces/meetings';

/**
 * Example of how to use the batch processing system
 * This demonstrates processing a large number of meetings without hitting rate limits
 */
export async function processMeetingBatchExample(meetings: Meeting[], userId: string): Promise<void> {
  try {
    console.log(`Starting batch processing for ${meetings.length} meetings`);
    
    // Get the meeting service
    const meetingService = MeetingService.getInstance();
    
    // Optional: Configure rate limits if needed
    // Default is 48 requests per minute (Azure OpenAI S0 tier)
    // meetingService.updateRateLimit(48);
    
    // Start batch processing
    const batchId = await meetingService.analyzeMeetingBatch(meetings, userId);
    console.log(`Batch processing started with ID: ${batchId}`);
    
    // Poll for status (in a real application, you might want to use a webhook or event system)
    await pollBatchStatus(meetingService, batchId);
    
    console.log('Batch processing completed');
  } catch (error) {
    console.error('Error in batch processing example:', error);
  }
}

/**
 * Helper function to poll for batch status
 */
async function pollBatchStatus(meetingService: MeetingService, batchId: string): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const status = meetingService.getBatchStatus(batchId);
      
      if (!status) {
        console.log('Batch not found');
        clearInterval(interval);
        resolve();
        return;
      }
      
      const { totalMeetings, completedMeetings, processed, failed } = status;
      console.log(`Progress: ${completedMeetings}/${totalMeetings} meetings processed`);
      console.log(`Successful: ${processed.length}, Failed: ${failed.length}`);
      
      if (completedMeetings >= totalMeetings) {
        console.log('All meetings processed');
        clearInterval(interval);
        resolve();
      }
    }, 5000); // Check every 5 seconds
  });
}

/**
 * Example of how to process a single meeting using the queue system
 * This is useful for one-off processing while still respecting rate limits
 */
export async function processSingleMeetingExample(meeting: Meeting, userId: string): Promise<void> {
  try {
    console.log(`Processing single meeting: ${meeting.id}`);
    
    // Get the meeting service
    const meetingService = MeetingService.getInstance();
    
    // Process the meeting (this will automatically use the queue system)
    const result = await meetingService.analyzeMeeting(meeting, userId);
    
    console.log(`Meeting processed successfully: ${result.id}`);
    console.log(`Key points: ${result.analysis?.keyPoints?.join(', ')}`);
  } catch (error) {
    console.error('Error processing single meeting:', error);
  }
} 