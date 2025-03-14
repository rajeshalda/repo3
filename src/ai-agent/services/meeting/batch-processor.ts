import { Meeting, ProcessedMeeting } from '../../../interfaces/meetings';
import { QueueManager } from '../queue/queue-manager';

interface BatchProcessingResult {
  processed: ProcessedMeeting[];
  failed: {
    meeting: Meeting;
    error: Error;
  }[];
  totalMeetings: number;
  completedMeetings: number;
}

export class BatchProcessor {
  private static instance: BatchProcessor;
  private queueManager: QueueManager;
  private batchSize: number = 10;
  private processingResults: Map<string, BatchProcessingResult> = new Map();
  private processMeetingFunction: ((meeting: Meeting, userId: string) => Promise<ProcessedMeeting>) | null = null;
  
  private constructor() {
    this.queueManager = QueueManager.getInstance();
  }

  public static getInstance(): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor();
    }
    return BatchProcessor.instance;
  }

  public setBatchSize(size: number): void {
    if (size < 1) {
      throw new Error('Batch size must be at least 1');
    }
    this.batchSize = size;
  }

  public setProcessFunction(fn: (meeting: Meeting, userId: string) => Promise<ProcessedMeeting>): void {
    this.processMeetingFunction = fn;
  }

  public async processMeetingBatch(
    meetings: Meeting[], 
    userId: string, 
    batchId: string = Date.now().toString()
  ): Promise<string> {
    if (!this.processMeetingFunction) {
      throw new Error('Process function not set. Call setProcessFunction before processing a batch.');
    }

    // Initialize batch processing result
    this.processingResults.set(batchId, {
      processed: [],
      failed: [],
      totalMeetings: meetings.length,
      completedMeetings: 0
    });

    console.log(`Starting batch processing for ${meetings.length} meetings with batch ID: ${batchId}`);

    // Process meetings in chunks
    for (let i = 0; i < meetings.length; i += this.batchSize) {
      const chunk = meetings.slice(i, i + this.batchSize);
      console.log(`Processing chunk ${Math.floor(i / this.batchSize) + 1} of ${Math.ceil(meetings.length / this.batchSize)}, size: ${chunk.length}`);
      
      // Process each meeting in the chunk
      const promises = chunk.map(meeting => this.processMeeting(meeting, userId, batchId));
      await Promise.all(promises);
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

  public getBatchStatus(batchId: string): BatchProcessingResult | undefined {
    return this.processingResults.get(batchId);
  }

  public clearBatchResult(batchId: string): boolean {
    return this.processingResults.delete(batchId);
  }
} 