"use client";

import React, { useState, useEffect, type ReactElement, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatDateWithTimezone, formatDateIST, DEFAULT_DATE_FORMAT, TIME_ONLY_FORMAT } from "@/lib/utils";
import type { Meeting, Task, MatchResult } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { WorktypeWarningDialog } from "@/components/worktype-warning-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type {
  Command as CommandPrimitive,
  CommandInput as CommandInputPrimitive,
  CommandList as CommandListPrimitive,
  CommandEmpty as CommandEmptyPrimitive,
  CommandGroup as CommandGroupPrimitive,
  CommandItem as CommandItemPrimitive
} from 'cmdk';

interface AttendanceRecord {
  name: string;
  email: string;
  duration: number;
  intervals: {
    joinDateTime: string;
    leaveDateTime: string;
    durationInSeconds: number;
  }[];
  rawRecord: {
    identity: {
      displayName: string;
    };
    emailAddress: string;
    totalAttendanceInSeconds: number;
    attendanceIntervals: unknown[];
    role?: string;
    reportId?: string;
  };
  role?: string;
}

interface RawMeetingData {
  subject: string;
  description?: string;
  start: {
    dateTime: string;
  };
  end: {
    dateTime: string;
  };
  onlineMeeting?: {
    joinUrl: string;
  };
}

interface MatchDetails {
  titleSimilarity: number;
  projectRelevance: number;
  contextMatch: number;
  timeRelevance: number;
}

interface MatchSummary {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  unmatched: number;
}

interface MeetingMatchesProps {
  summary: MatchSummary;
  matches: {
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  };
  onMeetingPosted: (meetingKey: string) => void;
  postedMeetingIds: Set<string> | string[];
  source?: 'ai-agent' | 'manual';
}

interface MatchDetailsBarProps {
  match: {
    meeting: Meeting;
    matchedTask: Task | null;
    confidence: number;
    reason: string;
  };
}

type MatchCategory = 'high' | 'medium' | 'low' | 'unmatched';

interface MatchGroups {
  high: MatchResult[];
  medium: MatchResult[];
  low: MatchResult[];
  unmatched: MatchResult[];
}

// Add type definition for window to include our cache
declare global {
  interface Window {
    __TASKS_CACHE?: {
      tasks: Task[];
      timestamp: number;
    };
  }
}

function generateMeetingKey(meeting: Meeting, userId: string): string {
  // Safely handle potentially null/undefined values
  const meetingId = meeting.meetingInfo?.meetingId?.trim() || '';
  const meetingName = meeting.subject?.trim() || 'Untitled Meeting';
  const meetingTime = meeting.startTime?.trim() || new Date().toISOString();
  
  // Calculate total duration for this meeting
  let totalDuration = 0;
  let reportId = '';
  const userAttendance = meeting.attendanceRecords?.find(
    record => record?.email === userId
  );
  if (userAttendance) {
    totalDuration = userAttendance.duration || 0;
    // Include reportId if available to differentiate between different attendance sessions
    if ((userAttendance as any).rawRecord && (userAttendance as any).rawRecord.reportId) {
      reportId = (userAttendance as any).rawRecord.reportId;
    }
  }
  
  // If no reportId found from user attendance, try to get it from any attendance record
  if (!reportId && meeting.attendanceRecords && meeting.attendanceRecords.length > 0) {
    for (const record of meeting.attendanceRecords) {
      if ((record as any).rawRecord?.reportId) {
        reportId = (record as any).rawRecord.reportId;
        break;
      }
    }
  }
  
  // Create a highly unique identifier that includes report ID as the primary differentiator
  // Format: userId_reportId_meetingName_meetingId_time_duration
  const key = `${(userId || '').trim()}_${reportId || 'no-report'}_${meetingName}_${meetingId}_${meetingTime}_${totalDuration}`;
  
  console.log('Generated meeting key:', {
    userId,
    meetingName,
    meetingId,
    meetingTime,
    totalDuration,
    reportId,
    finalKey: key
  });
  
  return key;
}

export function MatchDetailsBar({ match }: MatchDetailsBarProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-4 p-2 text-sm">
      <div className="flex items-center gap-2">
        <div 
          className={`w-2 h-2 rounded-full ${getConfidenceColor(match.confidence)}`} 
        />
        <span>Confidence: {Math.round(match.confidence * 100)}%</span>
      </div>
      <div className="flex-1">
        <span className="text-muted-foreground">{match.reason}</span>
      </div>
    </div>
  );
}

interface MatchRowProps {
  result: MatchResult;
  onMeetingPosted?: (meetingKey: string) => void;
  postedMeetingIds?: string[];
  selectedTasks: Map<string, Task>;
  onTaskSelect: (task: Task | null) => void;
  isSelected: boolean;
  onSelectChange: (selected: boolean) => void;
  source?: 'ai-agent' | 'manual';
  index?: number;
}

// Helper function to convert seconds to decimal hours with proper rounding
function convertSecondsToDecimalHours(seconds: number): number {
  if (!seconds || seconds <= 0) {
    throw new Error('Meeting duration must be greater than 0 seconds');
  }
  // Round to 2 decimal places for Intervals
  return Number((seconds / 3600).toFixed(2));
}

// Helper function to format duration
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
}

// Helper function to extract short reason label for tooltip
function getShortReason(reason: string): string {
  const lowerReason = reason.toLowerCase();

  // Check for keyword match
  if (lowerReason.includes('keyword')) {
    const keywordMatch = reason.match(/['"]([^'"]+)['"]/);
    if (keywordMatch) {
      return `Keyword: "${keywordMatch[1]}"`;
    }
    return 'Keyword Match';
  }

  // Check for ambiguous/billable cases
  if (lowerReason.includes('ambiguous') || lowerReason.includes('could match')) {
    if (lowerReason.includes('billable') || lowerReason.includes('non-billable')) {
      return 'Ambiguous';
    }
    if (lowerReason.includes('assigned') || lowerReason.includes('followed')) {
      return 'Multiple Tasks';
    }
    return 'Ambiguous';
  }

  // Check for generic/too short
  if (lowerReason.includes('too generic') || lowerReason.includes('generic')) {
    return 'Generic Title';
  }

  if (lowerReason.includes('too short') || lowerReason.includes('ambiguous')) {
    return 'Too Short';
  }

  // Check for multiple matches
  if (lowerReason.includes('multiple') || lowerReason.includes('several')) {
    return 'Multi-Match';
  }

  // Check for exact match
  if (lowerReason.includes('exact match') || lowerReason.includes('identical')) {
    return 'Exact Match';
  }

  // Check for company/client match
  if (lowerReason.includes('company match') || lowerReason.includes('client match')) {
    return 'Company Match';
  }

  // Check for semantic match
  if (lowerReason.includes('semantic') || lowerReason.includes('contextually relevant')) {
    return 'Context Match';
  }

  // Check for partial match
  if (lowerReason.includes('partial')) {
    return 'Partial Match';
  }

  // Check for info/social
  if (lowerReason.includes('informational') || lowerReason.includes('social')) {
    return 'Info Only';
  }

  // Default: return first 30 characters
  return reason.substring(0, 30) + (reason.length > 30 ? '...' : '');
}

function formatMatchReason(reason: string): string {
  // Remove any trailing ellipsis
  let formatted = reason.replace(/\.{3,}$/, '');

  // Extract the key information based on common patterns
  if (formatted.toLowerCase().includes('exact match')) {
    return 'Exact match';
  }

  // For keyword matches
  if (formatted.includes('keyword')) {
    const keywordMatch = formatted.match(/contains the keyword '([^']+)'/);
    if (keywordMatch) {
      return `Keyword match: "${keywordMatch[1]}"`;
    }
  }

  // For contextual matches
  if (formatted.includes('contextually relevant')) {
    return 'Context match: DevOps related';
  }

  // For domain matches
  if (formatted.includes('infrastructure') && formatted.includes('DevOps')) {
    return 'Domain match: Infrastructure/DevOps';
  }

  // For partial matches
  if (formatted.includes('partial match') || formatted.includes('similar to')) {
    return 'Partial match';
  }

  // Default case - take the first sentence or limit to 50 characters
  formatted = formatted.split('.')[0];
  return formatted.length > 50 ? formatted.substring(0, 47) + '...' : formatted;
}

function getConfidenceDisplay(confidence: number, reason: string): { value: number, display: string } {
  // Check if it's an exact match based on the reason text
  const isExactMatch = reason.toLowerCase().includes('exact match') ||
                      reason.toLowerCase().includes('identical') ||
                      reason.toLowerCase().includes('same to same');

  if (isExactMatch) {
    return { value: 100, display: '100%' };
  }

  // For non-exact matches, cap at 90%
  const adjustedConfidence = Math.min(Math.round(confidence * 100), 90);
  return { value: adjustedConfidence, display: `${adjustedConfidence}%` };
}

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function MatchRow({ 
  result, 
  onMeetingPosted, 
  postedMeetingIds, 
  selectedTasks, 
  onTaskSelect,
  isSelected,
  onSelectChange,
  source,
  index = 0
}: MatchRowProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isPosting, setIsPosting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [isTaskSelectOpen, setIsTaskSelectOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [worktypeWarning, setWorktypeWarning] = useState<{
    show: boolean;
    taskTitle: string;
    projectName: string;
  }>({ show: false, taskTitle: '', projectName: '' });
  
  const meetingKey = generateMeetingKey(result.meeting, session?.user?.email || '');
  const selectedTask = selectedTasks.get(meetingKey) || result.matchedTask || null;

  // Filter tasks based on search query
  const filteredTasks = searchQuery.trim() === '' 
    ? availableTasks 
    : availableTasks.filter(task => 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        task.project.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Global tasks cache to share between all MatchRow components
  const tasksCache = useMemo(() => {
    // Using window's key storage as a simple global store
    if (typeof window !== 'undefined') {
      if (!window.__TASKS_CACHE) {
        window.__TASKS_CACHE = {
          tasks: [],
          timestamp: 0
        };
      }
      return window.__TASKS_CACHE;
    }
    return { tasks: [], timestamp: 0 };
  }, []);

  // Fetch available tasks
  const fetchTasks = async () => {
    // Return cached tasks from global cache if available and less than 10 minutes old
    const now = Date.now();
    const cacheExpiryTime = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    if (tasksCache.tasks.length > 0 && (now - tasksCache.timestamp) < cacheExpiryTime) {
      console.log('Using globally cached tasks data');
      setAvailableTasks(tasksCache.tasks);
      return tasksCache.tasks;
    }
    
    // Check if we've fetched tasks in the last 10 seconds (avoid spamming API)
    if (now - lastFetchTime < 10000) {
      console.log('Rate limiting: Avoiding too frequent API calls');
      
      // If we have any tasks already, just use them
      if (availableTasks.length > 0) {
        return availableTasks;
      }
      
      // Otherwise use the global cache if available, even if expired
      if (tasksCache.tasks.length > 0) {
        setAvailableTasks(tasksCache.tasks);
        return tasksCache.tasks;
      }
      
      // If we don't have any tasks and no cache, notify user to wait
      toast("Too many requests. Please wait a few seconds before trying again.");
      
      return [];
    }
    
    setLastFetchTime(now);
    setIsLoadingTasks(true);
    setTasksError(null);
    
    try {
      const response = await fetch('/api/intervals/tasks');
      
      if (response.status === 429) {
        // Handle rate limit
        const retryAfter = response.headers.get('retry-after') || '60';
        const errorMessage = `Rate limit exceeded. Please try again after ${retryAfter} seconds.`;
        toast(errorMessage);
        setTasksError(errorMessage);
        return availableTasks.length > 0 ? availableTasks : tasksCache.tasks;
      }
      
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const errorMessage = errorBody.error || `Failed to fetch tasks: ${response.status}`;
        toast(errorMessage);
        setTasksError(errorMessage);
        return availableTasks.length > 0 ? availableTasks : tasksCache.tasks;
      }
      
      const tasks = await response.json();
      
      // Update both local state and global cache
      setAvailableTasks(tasks);
      tasksCache.tasks = tasks;
      tasksCache.timestamp = now;
      
      return tasks;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load tasks';
      toast(errorMessage);
      setTasksError(errorMessage);
      return availableTasks.length > 0 ? availableTasks : tasksCache.tasks;
    } finally {
      setIsLoadingTasks(false);
    }
  };

  // Preload tasks on component mount
  useEffect(() => {
    // If we already have tasks in the global cache, use them immediately
    if (tasksCache.tasks.length > 0) {
      setAvailableTasks(tasksCache.tasks);
    }
    
    // Then try to fetch fresh tasks if needed
    if (tasksCache.tasks.length === 0 || Date.now() - tasksCache.timestamp > 10 * 60 * 1000) {
      fetchTasks();
    }
  }, []);

  const handleTaskSelect = () => {
    setIsTaskSelectOpen(true);
    // Refresh tasks when opening the selector
    if (availableTasks.length === 0) {
      fetchTasks();
    }
  };

  // Add this function to handle task changes
  const handleTaskChange = (task: Task | null) => {
    const meetingKey = generateMeetingKey(result.meeting, session?.user?.email || '');
    onTaskSelect(task);
    setIsTaskSelectOpen(false);
  };

  const handlePostToIntervals = async () => {
    try {
      setIsPosting(true);
      const userAttendance = result.meeting.attendanceRecords.find(
        record => record.name === session?.user?.name
      );

      if (!userAttendance) {
        toast("No attendance record found for this meeting");
        return;
      }

      // Check if selectedTask is available
      if (!selectedTask) {
        toast("Please select a task first");
        return;
      }

      const meetingDate = new Date(result.meeting.startTime).toISOString().split('T')[0];
      
      // Calculate total duration in seconds from attendance intervals
      const totalDurationInSeconds = userAttendance.intervals.reduce(
        (total, interval) => total + interval.durationInSeconds,
        0
      );

      console.log('Meeting data before posting:', {
        meetingId: result.meeting.meetingInfo?.meetingId,
        subject: result.meeting.subject,
        meetingInfo: result.meeting.meetingInfo,
        rawMeeting: result.meeting // Log the entire meeting object to inspect its structure
      });

      // Safely check if we have a Graph ID available (AAMkA...)
      // Handle all possible undefined values properly
      const meetingInfo = result.meeting.meetingInfo;
      const graphId = meetingInfo?.graphId;
      
      const hasGraphId = !!meetingInfo && 
                        !!graphId && 
                        typeof graphId === 'string' &&
                        graphId.startsWith('AAMkA') &&
                        graphId.includes('=');
      
      // Use the proper ID hierarchy: ALWAYS prioritize Graph ID when available
      let meetingGraphId: string;
      
      if (hasGraphId && meetingInfo && meetingInfo.graphId) {
        // If we have a valid Graph ID, use it
        meetingGraphId = meetingInfo.graphId;
      } else if (meetingInfo?.meetingId) {
        // Otherwise use the meetingId if available
        meetingGraphId = meetingInfo.meetingId;
      } else if ((result.meeting as any).id) {
        // Then try the id property
        meetingGraphId = (result.meeting as any).id;
      } else if (result.meeting.rawData?.id) {
        // Then try the raw data id if available
        meetingGraphId = result.meeting.rawData.id;
      } else {
        // Lastly, create a fallback ID
        meetingGraphId = `${session?.user?.email}_${result.meeting.subject}_${result.meeting.startTime}`;
      }
      
      console.log('Using meetingId for posting:', meetingGraphId, 'Source:', {
        hasGraphId,
        hasMeetingInfo: !!meetingInfo,
        meetingInfoId: meetingInfo?.meetingId,
        graphId: meetingInfo?.graphId,
        rawId: result.meeting.rawData?.id
      });

      const response = await fetch('/api/intervals/time-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: selectedTask.id,
          date: meetingDate,
          time: totalDurationInSeconds,
          description: result.meeting.subject,
          meetingId: meetingGraphId,  // Primary ID for backward compatibility
          meetingInfo: meetingInfo ? {
            meetingId: meetingInfo.meetingId,
            graphId: meetingInfo.graphId, // Include the Graph ID explicitly
            threadId: meetingInfo.threadId,
            organizerId: meetingInfo.organizerId,
            reportId: (meetingInfo as any).reportId // Use type assertion for reportId
          } : undefined,
          subject: result.meeting.subject,
          startTime: result.meeting.startTime,
          confidence: result.confidence,
          isManualPost: source !== 'ai-agent',
          taskTitle: selectedTask.title,
          attendanceRecords: [{
            email: session?.user?.email || '',
            name: session?.user?.name || '',
            duration: totalDurationInSeconds,
            intervals: userAttendance.intervals,
            rawRecord: (userAttendance as any).rawRecord // Use type assertion for rawRecord
          }]
        }),
      });

      console.log('Posting meeting with ID:', meetingGraphId);

      const postResult = await response.json();

      // Check for worktype validation error
      if (postResult.error === 'WORKTYPE_NOT_AVAILABLE') {
        console.error('Worktype not available for task:', postResult);
        setWorktypeWarning({
          show: true,
          taskTitle: postResult.taskTitle || selectedTask.title,
          projectName: postResult.projectName || ''
        });
        return;
      }

      if (postResult.success) {
        // If there's a message about already posted, show that instead of success
        if (postResult.message && postResult.message.includes('Already posted')) {
          toast.warning(postResult.message, {
            position: "top-center",
            duration: 3000,
            style: {
              backgroundColor: "#f97316", // Orange for warning
              color: "white",
              fontSize: "16px",
              borderRadius: "8px",
              padding: "12px 24px"
            }
          });
          onMeetingPosted?.(meetingKey);
        } else {
          const decimalHours = Number((totalDurationInSeconds / 3600).toFixed(2));
          toast.success(`Successfully posted ${decimalHours} hours to Intervals`, {
            position: "top-center",
            duration: 3000,
            style: {
              backgroundColor: "#22c55e",
              color: "white",
              fontSize: "16px",
              borderRadius: "8px",
              padding: "12px 24px"
            }
          });
          onMeetingPosted?.(meetingKey);
        }
      } else if (postResult.needsReview) {
        toast.error("This meeting requires manual review before posting", {
          position: "top-center",
          duration: 4000,
          style: {
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px"
          }
        });
      } else {
        const errorMessage = typeof postResult.error === 'string' ? postResult.error : 'Failed to post meeting';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error posting meeting:', error);
      toast(error instanceof Error ? error.message : 'Failed to post meeting');
    } finally {
      setIsPosting(false);
    }
  };

  const confidenceInfo = getConfidenceDisplay(result.confidence, result.reason);

  // Get user attendance to calculate meeting attended duration
  const userAttendance = result.meeting.attendanceRecords.find(
    record => record.name === session?.user?.name
  );

  // Get original scheduled times or fallback to current times
  const originalStart = (result.meeting as any).originalStartTime || result.meeting.startTime;
  const originalEnd = (result.meeting as any).originalEndTime || result.meeting.endTime;

  return (
    <TableRow>
      <TableCell className="py-2 pl-2 sm:pl-4 hidden">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelectChange}
          className="hidden"
        />
      </TableCell>
      <TableCell className="py-2">
        <div className="flex flex-col space-y-1">
          <div className="font-medium truncate max-w-[200px] sm:max-w-[300px] text-foreground">
            {result.meeting.subject}
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2">
        <div className="text-sm space-y-1">
          <div>{new Date(originalStart).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            timeZone: 'Asia/Kolkata'
          })}</div>
          <div className="text-muted-foreground">
            {new Date(originalStart).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Asia/Kolkata'
            })} - {new Date(originalEnd).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: 'Asia/Kolkata'
            })}
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2">
        {userAttendance && userAttendance.duration > 0 ? (
          <div className="text-sm text-muted-foreground">
            {formatDuration(userAttendance.duration)}
          </div>
        ) : (
          <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">Meeting did not start</span>
        )}
      </TableCell>
      <TableCell className="max-w-[200px] relative z-10">
        {selectedTask ? (
          <div className="space-y-1 relative">
            <div className="truncate font-medium text-foreground">{decodeHtmlEntities(selectedTask.title)}</div>
            <div className="text-xs text-muted-foreground dark:text-gray-400 truncate">{decodeHtmlEntities(selectedTask.project)}</div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTaskSelect}
              disabled={isLoadingTasks}
              className="mt-2 text-sm border border-gray-200 hover:bg-accent hover:text-accent-foreground font-medium px-3 bg-background dark:bg-slate-600 dark:border-slate-400 dark:text-white dark:hover:bg-slate-500 relative z-20"
            >
              Change Task
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTaskSelect}
            disabled={isLoadingTasks}
            className="w-full"
          >
            {isLoadingTasks ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Select Task'
            )}
          </Button>
        )}
        
        <Dialog open={isTaskSelectOpen} onOpenChange={(open) => {
          setIsTaskSelectOpen(open);
          if (!open) {
            // Reset search query when dialog is closed
            setSearchQuery('');
          }
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {selectedTask ? 'Change Task for Meeting' : 'Select Task for Meeting'}
              </DialogTitle>
              <DialogDescription>
                {selectedTask 
                  ? `Choose a different task to associate with "${result.meeting.subject}"`
                  : `Choose a task to associate with "${result.meeting.subject}"`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              <div className="rounded-lg border shadow-md">
                <div className="p-2">
                  <input
                    className="w-full border-none bg-transparent outline-none placeholder:text-muted-foreground"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                    }}
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto bg-background">
                  {filteredTasks.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      {availableTasks.length === 0 ? 'No tasks found.' : 'No matching tasks found.'}
                    </div>
                  ) : (
                    <div className="p-1">
                      {filteredTasks.map((task) => {
                        return (
                          <button
                            key={task.id}
                            className="w-full rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                            onClick={() => handleTaskChange(task)}
                          >
                            <div className="text-left">
                              <div className="font-medium flex items-center gap-1.5 flex-wrap">
                                <span>{decodeHtmlEntities(task.title)}</span>
                                {task.relationships?.includes('assigned') && (
                                  <Badge variant="default" className="text-[10px] px-1.5 py-0">Assigned</Badge>
                                )}
                                {task.relationships?.includes('follower') && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Follower</Badge>
                                )}
                                {task.relationships?.includes('owner') && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Owner</Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">{decodeHtmlEntities(task.project)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </TableCell>
      <TableCell className="w-[100px]">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${
            confidenceInfo.value >= 90 ? 'bg-green-500' :
            confidenceInfo.value >= 50 ? 'bg-yellow-500' :
            'bg-red-500'
          }`} />
          <span className="text-sm text-muted-foreground dark:text-gray-400">{confidenceInfo.display}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-[200px]">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-help text-sm">
                <span className="text-foreground dark:text-gray-100">
                  {getShortReason(result.reason)}
                </span>
                <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-md p-3" side="left">
              <p className="text-sm whitespace-normal">{result.reason}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell>
        {(result.matchedTask || selectedTask) && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handlePostToIntervals}
            disabled={isPosting}
            className="whitespace-nowrap"
          >
            {isPosting ? (
              <>
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Posting...
              </>
            ) : (
              'Post'
            )}
          </Button>
        )}
      </TableCell>
      <WorktypeWarningDialog
        open={worktypeWarning.show}
        onClose={() => setWorktypeWarning({ show: false, taskTitle: '', projectName: '' })}
        taskTitle={worktypeWarning.taskTitle}
        projectName={worktypeWarning.projectName}
      />
    </TableRow>
  );
}

export function MeetingMatches({ summary, matches, onMeetingPosted, postedMeetingIds, source }: MeetingMatchesProps): ReactElement {
  const { data: session } = useSession();
  const { toast } = useToast();
  const userId = session?.user?.email || '';
  const [selectedMeetings, setSelectedMeetings] = useState<Record<string, boolean>>({});
  const [selectedTasks, setSelectedTasks] = useState<Map<string, Task>>(new Map());
  const [selectedMeetingKeys, setSelectedMeetingKeys] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('matched');
  const [recentlyPostedKeys, setRecentlyPostedKeys] = useState<Set<string>>(new Set());
  
  // Add a matchesRef to detect actual changes in matches data
  const matchesRef = useRef(matches);
  // Add a sourceRef to detect source changes
  const sourceRef = useRef(source);

  // Clear all states when matches change
  const clearAllStates = useCallback(() => {
    setSelectedMeetings({});
    setSelectedTasks(new Map());
    setSelectedMeetingKeys(new Set());
    setMeetings({
      high: [],
      medium: [],
      low: [],
      unmatched: []
    });
  }, []);

  // Check if matches have actually changed
  const haveMeetingsChanged = useCallback((newMatches: typeof matches, oldMatches: typeof matches) => {
    const getMeetingIds = (matchList: MatchResult[]) => 
      new Set(matchList.map(m => m.meeting.meetingInfo?.meetingId || m.meeting.subject));
      
    // For manual source, unmatched meetings should be considered independently from AI matches
    if (source !== 'ai-agent') {
      // For manual view, focus on checking if any meeting has gained or lost a matched task
      const unmatchedChanges = JSON.stringify(getMeetingIds(newMatches.unmatched)) !== JSON.stringify(getMeetingIds(oldMatches.unmatched));
      const matchedChanges = 
        JSON.stringify(getMeetingIds(newMatches.high)) !== JSON.stringify(getMeetingIds(oldMatches.high)) ||
        JSON.stringify(getMeetingIds(newMatches.medium)) !== JSON.stringify(getMeetingIds(oldMatches.medium)) ||
        JSON.stringify(getMeetingIds(newMatches.low)) !== JSON.stringify(getMeetingIds(oldMatches.low));
      
      return unmatchedChanges || matchedChanges;
    } else {
      // For AI agent, use the original comparison logic
      return (
        JSON.stringify(getMeetingIds(newMatches.high)) !== JSON.stringify(getMeetingIds(oldMatches.high)) ||
        JSON.stringify(getMeetingIds(newMatches.medium)) !== JSON.stringify(getMeetingIds(oldMatches.medium)) ||
        JSON.stringify(getMeetingIds(newMatches.low)) !== JSON.stringify(getMeetingIds(oldMatches.low)) ||
        JSON.stringify(getMeetingIds(newMatches.unmatched)) !== JSON.stringify(getMeetingIds(oldMatches.unmatched))
      );
    }
  }, [source]);

  // Update meetings when matches prop changes
  useEffect(() => {
    if (haveMeetingsChanged(matches, matchesRef.current)) {
      console.log('Matches changed, clearing all states');
      clearAllStates();
      matchesRef.current = matches;
      
      // After clearing, set the new filtered meetings
      setMeetings({
        high: filterMeetings(matches.high, 'high'),
        medium: filterMeetings(matches.medium, 'medium'),
        low: filterMeetings(matches.low, 'low'),
        unmatched: filterMeetings(matches.unmatched, 'unmatched')
      });
    }
  }, [matches, clearAllStates, haveMeetingsChanged]);

  const filterMeetings = useCallback((matchResults: MatchResult[], category: MatchCategory) => {
    // Convert postedMeetingIds to a Set if it isn't already one
    const postedIds = postedMeetingIds instanceof Set ? postedMeetingIds : new Set(postedMeetingIds);
    
    console.log('Filtering meetings:', {
      category,
      totalMeetings: matchResults.length,
      postedIds: Array.from(postedIds),
      recentlyPostedKeys: Array.from(recentlyPostedKeys),
      source
    });

    // Get all matched meeting keys (from high, medium, low confidence)
    const allMatchedMeetingKeys = new Set([
      ...matches.high.map(m => generateMeetingKey(m.meeting, userId)),
      ...matches.medium.map(m => generateMeetingKey(m.meeting, userId)),
      ...matches.low.map(m => generateMeetingKey(m.meeting, userId))
    ]);
    
    return matchResults.filter((m: MatchResult) => {
      const meetingKey = generateMeetingKey(m.meeting, userId);
      const meetingId = m.meeting.meetingInfo?.meetingId;
      
      console.log('Processing meeting:', {
        category,
        subject: m.meeting.subject,
        meetingKey,
        meetingId,
        confidence: m.confidence,
        matchedTask: m.matchedTask?.title,
        source
      });
      
      // Check if this meeting was recently posted - if so, exclude it
      if (recentlyPostedKeys.has(meetingKey)) {
        console.log('Excluding recently posted meeting:', meetingKey);
        return false;
      }
      
      // Check if meeting is already posted
      let isPosted = postedIds.has(meetingKey);
      
      // If not found by key, check if it's a recurring meeting with same ID but different instance
      if (!isPosted && meetingId && postedIds.has(meetingId)) {
        console.log('Found meeting with same ID but potentially different instance:', {
          subject: m.meeting.subject,
          meetingId,
          meetingKey
        });
        isPosted = false; // Assume it's a different instance of a recurring meeting
      }
      
      // Add attendance check
      const hasAttendance = m.meeting.attendanceRecords.some(
        record => record.name === session?.user?.name && record.duration > 0
      );

      let hasDuration = true;
      const userAttendance = m.meeting.attendanceRecords.find(
        record => record.name === session?.user?.name
      );
      if (userAttendance) {
        hasDuration = userAttendance.duration > 0;
      }

      // Critical: Check category-specific conditions
      let isValidForCategory = true;
      
      if (category === 'unmatched') {
        if (source === 'ai-agent') {
          // AI-agent view logic - only show in unmatched if not in any matched category
          isValidForCategory = !allMatchedMeetingKeys.has(meetingKey);
        } else {
          // Manual view logic - modified to consider confidence score
          // For manual unmatched, check for matchedTask AND ensure confidence is not high
          isValidForCategory = !m.matchedTask || m.confidence < 0.5;
          
          // Debug logging specifically for manual unmatched meetings
          if (category === 'unmatched') {
            console.log('Manual unmatched meeting check:', {
              subject: m.meeting.subject,
              hasMatchedTask: !!m.matchedTask,
              confidence: m.confidence,
              isValidForCategory,
              inAllMatchedKeys: allMatchedMeetingKeys.has(meetingKey)
            });
          }
        }
      } else if (category === 'high') {
        // For high confidence category, ensure it has a matched task with high confidence
        isValidForCategory = m.matchedTask !== null && m.confidence >= 0.8;
      } else if (category === 'medium') {
        // For medium confidence category, ensure it has a matched task with medium confidence
        isValidForCategory = m.matchedTask !== null && m.confidence >= 0.5 && m.confidence < 0.8;
      } else if (category === 'low') {
        // For low confidence category, ensure it has a matched task with low confidence
        isValidForCategory = m.matchedTask !== null && m.confidence > 0 && m.confidence < 0.5;
      }
      
      // Only include meetings that meet all criteria
      const isIncluded = !isPosted && hasDuration && hasAttendance && isValidForCategory;
      
      console.log('Meeting filter results:', {
        subject: m.meeting.subject,
        category,
        isPosted,
        hasDuration,
        hasAttendance,
        isValidForCategory,
        isIncluded,
        source
      });
      
      return isIncluded;
    });
  }, [matches, postedMeetingIds, userId, source, session, recentlyPostedKeys]);

  const [meetings, setMeetings] = useState<MatchGroups>(() => ({
    high: filterMeetings(matches.high, 'high'),
    medium: filterMeetings(matches.medium, 'medium'),
    low: filterMeetings(matches.low, 'low'),
    unmatched: filterMeetings(matches.unmatched, 'unmatched')
  }));

  // Add a specific effect for source changes to ensure proper filtering
  useEffect(() => {
    if (source !== sourceRef.current) {
      console.log('Source changed from', sourceRef.current, 'to', source);
      sourceRef.current = source;
      
      // Refilter meetings when source changes
      setMeetings({
        high: filterMeetings(matches.high, 'high'),
        medium: filterMeetings(matches.medium, 'medium'),
        low: filterMeetings(matches.low, 'low'),
        unmatched: filterMeetings(matches.unmatched, 'unmatched')
      });
    }
  }, [source, matches, setMeetings, filterMeetings]);

  // Update meetings when props change - but only when matches actually change, not on every render
  useEffect(() => {
    // Don't update if we have recently posted meetings - let the local state handle it
    if (recentlyPostedKeys.size > 0) {
      console.log('Skipping matches update due to recently posted meetings:', Array.from(recentlyPostedKeys));
      return;
    }
    
    console.log('Updating meetings due to prop changes:', {
      matchesReceived: {
        high: matches.high.length,
        medium: matches.medium.length,
        low: matches.low.length,
        unmatched: matches.unmatched.length
      },
      source,
      postedIdsCount: Array.isArray(postedMeetingIds) ? postedMeetingIds.length : postedMeetingIds.size
    });

    setMeetings({
      high: filterMeetings(matches.high, 'high'),
      medium: filterMeetings(matches.medium, 'medium'),
      low: filterMeetings(matches.low, 'low'),
      unmatched: filterMeetings(matches.unmatched, 'unmatched')
    });
  }, [matches, source, recentlyPostedKeys, filterMeetings]); // Added recentlyPostedKeys to dependencies

  // Update handleMeetingPosted to efficiently remove the meeting from UI
  const handleMeetingPosted = (meetingKey: string): void => {
    console.log('Meeting posted with key:', meetingKey);
    
    // Track this key as recently posted to prevent useEffect from overriding our local state
    setRecentlyPostedKeys(prev => new Set([...prev, meetingKey]));
    
    // Clear the recently posted key after a short delay
    setTimeout(() => {
      setRecentlyPostedKeys(prev => {
        const next = new Set(prev);
        next.delete(meetingKey);
        return next;
      });
    }, 1000); // 1 second should be enough for state updates to settle
    
    // Immediately call the parent component's onMeetingPosted callback first
    // This ensures the parent state is updated before we update local state
    if (onMeetingPosted) {
      onMeetingPosted(meetingKey);
    }
    
    // Then update local state to remove the meeting immediately
    setMeetings(prev => {
      // Create a filter function that only removes the exact meeting key that was posted
      const filterMeeting = (m: MatchResult) => {
        const key = generateMeetingKey(m.meeting, userId);
        const shouldRemove = key === meetingKey;
        
        if (shouldRemove) {
          console.log('Removing meeting with key:', key, 'Subject:', m.meeting.subject);
        }
        
        return !shouldRemove; // Keep meetings that don't match the posted key
      };
      
      const updated = {
        high: prev.high.filter(filterMeeting),
        medium: prev.medium.filter(filterMeeting),
        low: prev.low.filter(filterMeeting),
        unmatched: prev.unmatched.filter(filterMeeting)
      };
      
      console.log('Updated meetings after posting:', {
        high: updated.high.length,
        medium: updated.medium.length,
        low: updated.low.length,
        unmatched: updated.unmatched.length
      });
      
      return updated;
    });
    
    // Clear the selected task for this specific meeting key
    const updatedTasks = new Map(selectedTasks);
    updatedTasks.delete(meetingKey);
    setSelectedTasks(updatedTasks);
    
    // Remove from selected meetings
    setSelectedMeetingKeys(prev => {
      const next = new Set(prev);
      next.delete(meetingKey);
      return next;
    });
  };

  // Helper functions for unmatched meetings
  const isSelected = (meetingId: string) => !!selectedMeetings[meetingId];
  
  const handleSelectChange = (meetingId: string, checked: boolean) => {
    setSelectedMeetings(prev => ({
      ...prev,
      [meetingId]: checked
    }));
  };
  
  const areAllUnmatchedSelected = () => {
    if (meetings.unmatched.length === 0) return false;
    return meetings.unmatched.every(m => 
      isSelected(m.meeting.meetingInfo?.meetingId || m.meeting.subject || '')
    );
  };
  
  const toggleAllUnmatched = (checked: boolean) => {
    const newSelected = { ...selectedMeetings };
    meetings.unmatched.forEach(m => {
      const id = m.meeting.meetingInfo?.meetingId || m.meeting.subject || '';
      newSelected[id] = !!checked;
    });
    setSelectedMeetings(newSelected);
  };

  const isPosted = (meetingId: string) => {
    return Array.isArray(postedMeetingIds) 
      ? postedMeetingIds.includes(meetingId)
      : Array.from(postedMeetingIds).includes(meetingId);
  };

  // Add debug logging for initial props
  useEffect(() => {
    console.log('MeetingMatches component loaded with:', {
      summary,
      matchesReceived: {
        high: matches.high.length,
        medium: matches.medium.length,
        low: matches.low.length,
        unmatched: matches.unmatched.length
      },
      postedMeetingIds: Array.from(postedMeetingIds instanceof Set ? postedMeetingIds : new Set(postedMeetingIds))
    });
  }, []);

  return (
    <div className="bg-background">
      {/* Content */}
      <div className="p-0">
        <Tabs defaultValue={source === 'ai-agent' ? 'unmatched' : 'matched'} className="w-full" onValueChange={(value) => setActiveTab(value)}>
          <div className="border-b">
            <div className="px-4 flex justify-between items-center">
              <TabsList className="h-10 bg-transparent gap-4">
                {source !== 'ai-agent' && (
                  <TabsTrigger
                    value="matched"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-0"
                  >
                    Matched ({meetings.high.length})
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="unmatched"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-0"
                >
                  Unmatched ({meetings.medium.length + meetings.low.length + meetings.unmatched.length})
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="h-auto overflow-y-auto">
            {source !== 'ai-agent' && (
              <TabsContent value="matched" className="p-0 h-full">
                <div className="rounded-md">
                  {meetings.high.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 sticky top-0 bg-background z-10 hidden">
                            <Checkbox
                              checked={meetings.high.every(m =>
                                selectedMeetingKeys.has(generateMeetingKey(m.meeting, userId))
                              )}
                              onCheckedChange={(checked) => {
                                const newKeys = new Set(selectedMeetingKeys);
                                meetings.high.forEach(m => {
                                  const key = generateMeetingKey(m.meeting, userId);
                                  if (checked) {
                                    newKeys.add(key);
                                  } else {
                                    newKeys.delete(key);
                                  }
                                });
                                setSelectedMeetingKeys(newKeys);
                              }}
                              className="hidden"
                            />
                          </TableHead>
                          <TableHead className="sticky top-0 bg-background z-10">Meeting Name</TableHead>
                          <TableHead className="sticky top-0 bg-background z-10">Schedule Date and Time</TableHead>
                          <TableHead className="sticky top-0 bg-background z-10">Meeting Attended Duration</TableHead>
                          <TableHead className="sticky top-0 bg-background z-10">Intervals Task</TableHead>
                          <TableHead className="sticky top-0 bg-background z-10">Confidence</TableHead>
                          <TableHead className="sticky top-0 bg-background z-10">Reason</TableHead>
                          <TableHead className="sticky top-0 bg-background z-10">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Show only high confidence matches (≥80%) */}
                        {meetings.high.map((result, index) => (
                          <MatchRow
                            key={`high-${generateMeetingKey(result.meeting, userId)}-${index}`}
                            result={result}
                            onMeetingPosted={handleMeetingPosted}
                            postedMeetingIds={Array.from(postedMeetingIds)}
                            selectedTasks={selectedTasks}
                            source={source}
                            index={index}
                            onTaskSelect={(task) => {
                              const meetingKey = generateMeetingKey(result.meeting, userId);
                              const updatedTasks = new Map(selectedTasks);
                              if (task) {
                                updatedTasks.set(meetingKey, task);
                                setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                              } else {
                                updatedTasks.delete(meetingKey);
                                setSelectedMeetingKeys(prev => {
                                  const next = new Set(prev);
                                  next.delete(meetingKey);
                                  return next;
                                });
                              }
                              setSelectedTasks(updatedTasks);
                            }}
                            isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                            onSelectChange={(selected) => {
                              const meetingKey = generateMeetingKey(result.meeting, userId);
                              setSelectedMeetingKeys(prev => {
                                const next = new Set(prev);
                                if (selected) {
                                  next.add(meetingKey);
                                } else {
                                  next.delete(meetingKey);
                                }
                                return next;
                              });
                            }}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground">
                      No matched meetings found
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            <TabsContent value="unmatched" className="p-0 h-full">
              <div className="rounded-md">
                {(meetings.medium.length > 0 || meetings.low.length > 0 || meetings.unmatched.length > 0) ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 sticky top-0 bg-background z-10 hidden">
                          <Checkbox
                            checked={[...meetings.medium, ...meetings.low, ...meetings.unmatched].every(m => selectedMeetingKeys.has(generateMeetingKey(m.meeting, userId)))}
                            onCheckedChange={(checked) => {
                              const newKeys = new Set(selectedMeetingKeys);
                              [...meetings.medium, ...meetings.low, ...meetings.unmatched].forEach(m => {
                                const key = generateMeetingKey(m.meeting, userId);
                                if (checked) {
                                  newKeys.add(key);
                                } else {
                                  newKeys.delete(key);
                                }
                              });
                              setSelectedMeetingKeys(newKeys);
                            }}
                            className="hidden"
                          />
                        </TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Meeting Name</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Schedule Date and Time</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Meeting Attended Duration</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Intervals Task</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Confidence</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Show medium confidence matches (50-79%) */}
                      {meetings.medium.map((result, index) => (
                        <MatchRow
                          key={`medium-${generateMeetingKey(result.meeting, userId)}-${index}`}
                          result={result}
                          onMeetingPosted={handleMeetingPosted}
                          postedMeetingIds={Array.from(postedMeetingIds)}
                          selectedTasks={selectedTasks}
                          source={source}
                          index={index}
                          onTaskSelect={(task) => {
                            const meetingKey = generateMeetingKey(result.meeting, userId);
                            const updatedTasks = new Map(selectedTasks);
                            if (task) {
                              updatedTasks.set(meetingKey, task);
                              setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                            } else {
                              updatedTasks.delete(meetingKey);
                              setSelectedMeetingKeys(prev => {
                                const next = new Set(prev);
                                next.delete(meetingKey);
                                return next;
                              });
                            }
                            setSelectedTasks(updatedTasks);
                          }}
                          isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                          onSelectChange={(selected) => {
                            const meetingKey = generateMeetingKey(result.meeting, userId);
                            setSelectedMeetingKeys(prev => {
                              const next = new Set(prev);
                              if (selected) {
                                next.add(meetingKey);
                              } else {
                                next.delete(meetingKey);
                              }
                              return next;
                            });
                          }}
                        />
                      ))}
                      {/* Show low confidence matches (<50%) */}
                      {meetings.low.map((result, index) => (
                        <MatchRow
                          key={`low-${generateMeetingKey(result.meeting, userId)}-${index}`}
                          result={result}
                          onMeetingPosted={handleMeetingPosted}
                          postedMeetingIds={Array.from(postedMeetingIds)}
                          selectedTasks={selectedTasks}
                          source={source}
                          index={index}
                          onTaskSelect={(task) => {
                            const meetingKey = generateMeetingKey(result.meeting, userId);
                            const updatedTasks = new Map(selectedTasks);
                            if (task) {
                              updatedTasks.set(meetingKey, task);
                              setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                            } else {
                              updatedTasks.delete(meetingKey);
                              setSelectedMeetingKeys(prev => {
                                const next = new Set(prev);
                                next.delete(meetingKey);
                                return next;
                              });
                            }
                            setSelectedTasks(updatedTasks);
                          }}
                          isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                          onSelectChange={(selected) => {
                            const meetingKey = generateMeetingKey(result.meeting, userId);
                            setSelectedMeetingKeys(prev => {
                              const next = new Set(prev);
                              if (selected) {
                                next.add(meetingKey);
                              } else {
                                next.delete(meetingKey);
                              }
                              return next;
                            });
                          }}
                        />
                      ))}
                      {/* Show truly unmatched meetings (0% confidence) */}
                      {meetings.unmatched.map((result, index) => (
                        <MatchRow
                          key={`unmatched-${generateMeetingKey(result.meeting, userId)}-${index}`}
                          result={result}
                          onMeetingPosted={handleMeetingPosted}
                          postedMeetingIds={Array.from(postedMeetingIds)}
                          selectedTasks={selectedTasks}
                          source={source}
                          index={index}
                          onTaskSelect={(task) => {
                            const meetingKey = generateMeetingKey(result.meeting, userId);
                            const updatedTasks = new Map(selectedTasks);
                            if (task) {
                              updatedTasks.set(meetingKey, task);
                              setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                            } else {
                              updatedTasks.delete(meetingKey);
                              setSelectedMeetingKeys(prev => {
                                const next = new Set(prev);
                                next.delete(meetingKey);
                                return next;
                              });
                            }
                            setSelectedTasks(updatedTasks);
                          }}
                          isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                          onSelectChange={(selected) => {
                            const meetingKey = generateMeetingKey(result.meeting, userId);
                            setSelectedMeetingKeys(prev => {
                              const next = new Set(prev);
                              if (selected) {
                                next.add(meetingKey);
                              } else {
                                next.delete(meetingKey);
                              }
                              return next;
                            });
                          }}
                        />
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground">
                    No unmatched or low-confidence meetings found
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
} 