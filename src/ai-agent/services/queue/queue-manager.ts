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
      
      const truncatedSubject = meeting.subject 
        ? `"${meeting.subject.substring(0, 30)}${meeting.subject.length > 30 ? '...' : ''}"`
        : 'Untitled meeting';
        
      console.log(`📥 QUEUE: Added meeting ${truncatedSubject} [${meeting.id}]`);
      console.log(`📊 QUEUE STATUS: ${this.queue.length} item${this.queue.length !== 1 ? 's' : ''} waiting`);
      
      // Start processing if not already running
      if (!this.isProcessing) {
        console.log(`⚙️ QUEUE: Starting queue processor...`);
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 QUEUE PROCESSOR: Started with ${this.queue.length} item${this.queue.length !== 1 ? 's' : ''}`);

    try {
      while (this.queue.length > 0) {
        // Wait for rate limiter to allow the request
        const tokensAvailable = this.rateLimiter.getAvailableTokens();
        if (tokensAvailable < 1) {
          console.log(`⏳ RATE LIMITER: Waiting for token availability...`);
        }
        
        await this.rateLimiter.acquireToken();
        console.log(`✅ RATE LIMITER: Token acquired, processing next queue item`);

        const item = this.queue.shift();
        if (!item) continue;

        const truncatedSubject = item.meeting.subject 
          ? `"${item.meeting.subject.substring(0, 30)}${item.meeting.subject.length > 30 ? '...' : ''}"`
          : 'Untitled meeting';

        try {
          console.log(`🔍 PROCESSING: ${truncatedSubject} [${item.meeting.id}]`);
          
          const startTime = Date.now();
          const result = await item.processFunction(item.meeting, item.userId);
          const processingTime = Date.now() - startTime;
          
          console.log(`✅ COMPLETED: ${truncatedSubject} [${item.meeting.id}] in ${(processingTime/1000).toFixed(2)}s`);
          
          if (result.analysis?.keyPoints?.length) {
            console.log(`📝 KEY POINTS: Found ${result.analysis.keyPoints.length} key points`);
          }
          
          item.resolve(result);
        } catch (error) {
          console.error(`❌ ERROR: Failed to process ${truncatedSubject} [${item.meeting.id}]`, error);
          item.reject(error);
        }

        // Add a small delay between processing items to prevent rate limit issues
        if (this.queue.length > 0) {
          console.log(`⏱️ QUEUE PROCESSOR: Waiting ${(this.processingInterval/1000).toFixed(2)}s before next item`);
          await new Promise(resolve => setTimeout(resolve, this.processingInterval));
        }
      }
    } finally {
      console.log(`🛑 QUEUE PROCESSOR: Finished, queue is empty`);
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
    console.log(`🧹 QUEUE: Cleared ${queueLength} item${queueLength !== 1 ? 's' : ''}`);
  }

  public updateRateLimit(requestsPerMinute: number): void {
    const oldRate = this.requestsPerMinute;
    this.requestsPerMinute = requestsPerMinute;
    this.processingInterval = Math.ceil(60000 / requestsPerMinute);
    this.rateLimiter.updateRateLimit(requestsPerMinute);
    console.log(`⚙️ RATE LIMIT: Updated from ${oldRate} to ${requestsPerMinute} requests per minute`);
    console.log(`⚙️ DELAY: Set to ${(this.processingInterval/1000).toFixed(2)}s between requests`);
  }
} 