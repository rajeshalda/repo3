import { Meeting, ProcessedMeeting } from '../../../interfaces/meetings';

interface QueueItem {
  meeting: Meeting;
  userId: string;
  resolve: (value: ProcessedMeeting | PromiseLike<ProcessedMeeting>) => void;
  reject: (reason?: any) => void;
  processFunction: (meeting: Meeting, userId: string) => Promise<ProcessedMeeting>;
}

export class QueueManager {
  private static instance: QueueManager;
  private queue: QueueItem[] = [];
  private isProcessing: boolean = false;
  
  // Rate limit settings
  private requestsPerMinute: number = 48; // Azure OpenAI S0 tier limit
  private processingInterval: number = Math.ceil(60000 / this.requestsPerMinute);
  
  private constructor() {}

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
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const item = this.queue.shift();
    
    if (!item) {
      this.isProcessing = false;
      return;
    }

    try {
      console.log(`Processing meeting ${item.meeting.id} from queue. Remaining: ${this.queue.length}`);
      const result = await item.processFunction(item.meeting, item.userId);
      item.resolve(result);
    } catch (error) {
      console.error(`Error processing meeting ${item.meeting.id}:`, error);
      item.reject(error);
    }

    // Wait for the processing interval before processing the next item
    setTimeout(() => {
      this.processQueue();
    }, this.processingInterval);
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
    this.processingInterval = Math.ceil(60000 / this.requestsPerMinute);
    console.log(`Rate limit updated to ${requestsPerMinute} requests per minute. Processing interval: ${this.processingInterval}ms`);
  }
} 