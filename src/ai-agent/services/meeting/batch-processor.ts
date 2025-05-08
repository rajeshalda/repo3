import { Meeting, ProcessedMeeting } from '../../../interfaces/meetings';
import { QueueManager } from '../queue/queue-manager';
import { RateLimiter } from '../../core/rate-limiter/token-bucket';

interface BatchResult {
  batchId: string;
  totalMeetings: number;
  completedMeetings: number;
  processed: ProcessedMeeting[];
  failed: Array<{ meeting: Meeting; error: Error }>;
  status: 'processing' | 'completed' | 'failed';
}

export class BatchProcessor {
  private static instance: BatchProcessor;
  private queueManager: QueueManager;
  private rateLimiter: RateLimiter;
  private processingResults: Map<string, BatchResult>;
  private processMeetingFunction?: (meeting: Meeting, userId: string) => Promise<ProcessedMeeting>;
  private maxConcurrentBatches: number = 3;
  private batchSize: number = 5; // Process 5 meetings at a time

  private constructor() {
    this.queueManager = QueueManager.getInstance();
    this.rateLimiter = RateLimiter.getInstance();
    this.processingResults = new Map();
  }

  public static getInstance(): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor();
    }
    return BatchProcessor.instance;
  }

  public setProcessFunction(func: (meeting: Meeting, userId: string) => Promise<ProcessedMeeting>): void {
    this.processMeetingFunction = func;
  }

  public async processMeetingBatch(meetings: Meeting[], userId: string): Promise<string> {
    if (!this.processMeetingFunction) {
      throw new Error('Process function not set');
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`
╔════════════════════════════════════════════════════════╗
║ 🚀 BATCH PROCESSING STARTED [${batchId}]               
║ 📊 Total meetings: ${meetings.length} | Batch size: ${this.batchSize}
╚════════════════════════════════════════════════════════╝`);
    
    // Initialize batch result
    this.processingResults.set(batchId, {
      batchId,
      totalMeetings: meetings.length,
      completedMeetings: 0,
      processed: [],
      failed: [],
      status: 'processing'
    });

    // Process meetings in smaller batches
    for (let i = 0; i < meetings.length; i += this.batchSize) {
      const batch = meetings.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i/this.batchSize) + 1;
      const totalBatches = Math.ceil(meetings.length/this.batchSize);
      
      console.log(`
┌─────────────────────────────────────────────────┐
│ ▶️ Processing batch ${batchNumber}/${totalBatches} (${batch.length} meetings) │
└─────────────────────────────────────────────────┘`);
      
      // Wait for rate limiter to allow processing this batch
      const tokensAvailable = this.rateLimiter.getAvailableTokens();
      console.log(`📶 Rate limiter status: ${tokensAvailable}/${this.batchSize} tokens available`);
      
      if (tokensAvailable < this.batchSize) {
        console.log(`⏳ Waiting for rate limiter tokens (need ${this.batchSize - tokensAvailable} more)...`);
      }
      
      await this.rateLimiter.acquireToken(this.batchSize);
      console.log(`✅ Rate limiter tokens acquired`);

      // Process each meeting in the batch
      await Promise.all(batch.map(meeting => 
        this.processMeeting(meeting, userId, batchId)
      ));

      // Add a small delay between batches
      const batchResult = this.processingResults.get(batchId);
      if (batchResult) {
        console.log(`
┌─────────────────────────────────────────────────┐
│ ✓ Batch ${batchNumber}/${totalBatches} completed                      │
│ ✓ Progress: ${batchResult.completedMeetings}/${batchResult.totalMeetings} meetings (${Math.round(batchResult.completedMeetings/batchResult.totalMeetings*100)}%)    │
│ ✓ Success: ${batchResult.processed.length} | Failed: ${batchResult.failed.length}               │
└─────────────────────────────────────────────────┘`);
      }

      if (i + this.batchSize < meetings.length) {
        console.log(`⏱️ Adding 1 second delay before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Update batch status
    const result = this.processingResults.get(batchId);
    if (result) {
      result.status = result.failed.length === meetings.length ? 'failed' : 'completed';
      
      console.log(`
╔════════════════════════════════════════════════════════╗
║ 🏁 BATCH PROCESSING COMPLETED [${batchId}]             
║ 📊 Total: ${result.totalMeetings} | Success: ${result.processed.length} | Failed: ${result.failed.length}
║ 📈 Success rate: ${Math.round((result.processed.length/result.totalMeetings)*100)}%
╚════════════════════════════════════════════════════════╝`);
    }

    return batchId;
  }

  private async processMeeting(meeting: Meeting, userId: string, batchId: string): Promise<void> {
    try {
      console.log(`📑 Processing meeting: "${meeting.subject?.substring(0, 30)}${meeting.subject && meeting.subject.length > 30 ? '...' : ''}" [${meeting.id}]`);
      
      const result = await this.queueManager.queueMeetingAnalysis(
        meeting, 
        userId,
        this.processMeetingFunction!
      );
      
      // Update batch processing result
      const batchResult = this.processingResults.get(batchId);
      if (batchResult) {
        batchResult.processed.push(result);
        batchResult.completedMeetings++;
      }
      
      console.log(`✅ Successfully processed: "${meeting.subject?.substring(0, 30)}${meeting.subject && meeting.subject.length > 30 ? '...' : ''}" [${meeting.id}]`);
    } catch (error) {
      console.error(`❌ ERROR processing meeting [${meeting.id}] in batch ${batchId}:`, error);
      
      // Update batch processing result with failure
      const batchResult = this.processingResults.get(batchId);
      if (batchResult) {
        batchResult.failed.push({
          meeting,
          error: error instanceof Error ? error : new Error(String(error))
        });
        batchResult.completedMeetings++;
      }
    }
  }

  public getBatchStatus(batchId: string): BatchResult | undefined {
    return this.processingResults.get(batchId);
  }

  public updateRateLimit(requestsPerMinute: number): void {
    this.queueManager.updateRateLimit(requestsPerMinute);
    this.rateLimiter.updateRateLimit(requestsPerMinute);
  }
} 