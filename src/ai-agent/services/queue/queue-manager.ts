import { QueueItem } from '../../../interfaces/queue';
import { Meeting, ProcessedMeeting } from '../../../interfaces/meetings';
import { RateLimiter } from '../../core/rate-limiter/token-bucket';

export class QueueManager {
  private static instance: QueueManager;
  private queue: QueueItem[] = [];
  private isProcessing: boolean = false;
  private rateLimiter: RateLimiter;
  
  // Rate limit settings
  private requestsPerMinute: number = 48; // Azure OpenAI S0 tier limit
  private processingInterval: number = Math.ceil(60000 / this.requestsPerMinute);
  
  private constructor() {
    this.rateLimiter = RateLimiter.getInstance();
  }

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  public async queueMeetingAnalysis(
    meeting: Meeting, 
    userId: string,
    processFunction: (meeting: Meeting, userId: string) => Promise<ProcessedMeeting>
  ): Promise<ProcessedMeeting> {
    return new Promise<ProcessedMeeting>((resolve, reject) => {
      // Add to queue
      this.queue.push({ 
        meeting, 
        userId, 
        resolve, 
        reject,
        processFunction 
      });
      console.log(`Meeting ${meeting.id} added to queue. Queue length: ${this.queue.length}`);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        // Wait for rate limiter to allow the request
        await this.rateLimiter.acquireToken();

        const item = this.queue.shift();
        if (!item) continue;

        try {
          console.log(`Processing meeting: ${item.meeting.subject}`);
          const result = await item.processFunction(item.meeting, item.userId);
          console.log(`Successfully processed meeting: ${item.meeting.subject}`);
          item.resolve(result);
        } catch (error) {
          console.error(`Error processing meeting: ${item.meeting.subject}`, error);
          item.reject(error);
        }

        // Add a small delay between processing items to prevent rate limit issues
        await new Promise(resolve => setTimeout(resolve, this.processingInterval));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public clearQueue(): void {
    const queueLength = this.queue.length;
    this.queue.forEach(item => {
      item.reject(new Error('Queue was cleared'));
    });
    this.queue = [];
    console.log(`Queue cleared. ${queueLength} items were removed.`);
  }

  public updateRateLimit(requestsPerMinute: number): void {
    this.requestsPerMinute = requestsPerMinute;
    this.processingInterval = Math.ceil(60000 / requestsPerMinute);
    this.rateLimiter.updateRateLimit(requestsPerMinute);
  }
} 