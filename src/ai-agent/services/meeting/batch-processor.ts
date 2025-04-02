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
      
      // Wait for rate limiter to allow processing this batch
      await this.rateLimiter.acquireToken(this.batchSize);

      // Process each meeting in the batch
      await Promise.all(batch.map(meeting => 
        this.processMeeting(meeting, userId, batchId)
      ));

      // Add a small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update batch status
    const result = this.processingResults.get(batchId);
    if (result) {
      result.status = result.failed.length === meetings.length ? 'failed' : 'completed';
    }

    return batchId;
  }

  private async processMeeting(meeting: Meeting, userId: string, batchId: string): Promise<void> {
    try {
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
    } catch (error) {
      console.error(`Error processing meeting ${meeting.id} in batch ${batchId}:`, error);
      
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