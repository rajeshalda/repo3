import { Meeting, ProcessedMeeting } from './meetings';

export interface QueueItem {
  meeting: Meeting;
  userId: string;
  resolve: (value: ProcessedMeeting | PromiseLike<ProcessedMeeting>) => void;
  reject: (reason?: any) => void;
  processFunction: (meeting: Meeting, userId: string) => Promise<ProcessedMeeting>;
} 