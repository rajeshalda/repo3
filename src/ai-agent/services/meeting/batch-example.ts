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
    console.log(`
╔═════════════════════════════════════════════════╗
║ 📊 BATCH MONITOR STARTED [${batchId}]           
║ ⏱️ Polling interval: 5 seconds                   
╚═════════════════════════════════════════════════╝`);
    
    let lastCompletedCount = 0;
    let consecutiveNoChange = 0;
    
    const interval = setInterval(() => {
      const status = meetingService.getBatchStatus(batchId);
      
      if (!status) {
        console.log(`❌ MONITOR: Batch ${batchId} not found`);
        clearInterval(interval);
        resolve();
        return;
      }
      
      const { totalMeetings, completedMeetings, processed, failed } = status;
      const percentComplete = Math.round((completedMeetings / totalMeetings) * 100);
      
      // Check if progress is stalled
      if (completedMeetings === lastCompletedCount) {
        consecutiveNoChange++;
      } else {
        consecutiveNoChange = 0;
      }
      lastCompletedCount = completedMeetings;
      
      console.log(`
┌─────────────────────────────────────────────────┐
│ 🔄 BATCH PROGRESS                               │
│ ✓ Progress: ${completedMeetings}/${totalMeetings} meetings (${percentComplete}%)         │
│ ✓ Success: ${processed.length} | Failed: ${failed.length}                     │
└─────────────────────────────────────────────────┘`);
      
      if (consecutiveNoChange >= 6) {
        console.log(`⚠️ MONITOR: No progress for 30 seconds, batch may be stalled`);
      }
      
      if (completedMeetings >= totalMeetings) {
        console.log(`
╔═════════════════════════════════════════════════╗
║ 🏁 BATCH PROCESSING COMPLETE [${batchId}]        
║ ✅ Successfully processed: ${processed.length}/${totalMeetings} (${Math.round((processed.length/totalMeetings)*100)}%)        
║ ❌ Failed: ${failed.length}/${totalMeetings} (${Math.round((failed.length/totalMeetings)*100)}%)                          
╚═════════════════════════════════════════════════╝`);
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
    const truncatedSubject = meeting.subject 
      ? `"${meeting.subject.substring(0, 30)}${meeting.subject.length > 30 ? '...' : ''}"`
      : 'Untitled meeting';
      
    console.log(`
┌─────────────────────────────────────────────────┐
│ 🔄 PROCESSING SINGLE MEETING                    │
│ 📝 Meeting: ${truncatedSubject}                 │
│ 🆔 ID: ${meeting.id}                            │
└─────────────────────────────────────────────────┘`);
    
    // Get the meeting service
    const meetingService = MeetingService.getInstance();
    
    const startTime = Date.now();
    
    // Process the meeting (this will automatically use the queue system)
    const result = await meetingService.analyzeMeeting(meeting, userId);
    
    const processingTime = Date.now() - startTime;
    
    console.log(`
┌─────────────────────────────────────────────────┐
│ ✅ MEETING PROCESSED SUCCESSFULLY               │
│ ⏱️ Processing time: ${(processingTime/1000).toFixed(2)}s               │
│ 📊 Key points: ${result.analysis?.keyPoints?.length || 0}                          │
└─────────────────────────────────────────────────┘`);
    
    if (result.analysis?.keyPoints?.length) {
      console.log(`📝 KEY POINTS: ${result.analysis.keyPoints.join(' | ')}`);
    }
  } catch (error) {
    console.error(`
┌─────────────────────────────────────────────────┐
│ ❌ ERROR PROCESSING MEETING                     │
│ 🆔 ID: ${meeting.id}                            │
└─────────────────────────────────────────────────┘`, error);
  }
} 