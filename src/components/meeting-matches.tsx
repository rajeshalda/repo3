"use client";

import React, { useState, useEffect, type ReactElement, useRef, useCallback } from 'react';
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
import { formatDate, formatDateWithTimezone, formatDateIST, DEFAULT_DATE_FORMAT, TIME_ONLY_FORMAT } from "@/lib/utils";
import type { Meeting, Task, MatchResult } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
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
  onMeetingPosted: (meetingId: string) => void;
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

function generateMeetingKey(meeting: Meeting, userId: string): string {
  const meetingId = (meeting.meetingInfo?.meetingId || '').trim();
  const meetingName = meeting.subject.trim();
  const meetingTime = meeting.startTime.trim();
  const key = `${userId.trim()}_${meetingName}_${meetingId}_${meetingTime}`;
  console.log('Generated key:', key);
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
  onMeetingPosted?: (meetingId: string) => void;
  postedMeetingIds?: string[];
  selectedTasks: Map<string, Task>;
  onTaskSelect: (task: Task | null) => void;
  isSelected: boolean;
  onSelectChange: (selected: boolean) => void;
  source?: 'ai-agent' | 'manual';
}

// Helper function to convert seconds to decimal hours with proper rounding
function convertSecondsToDecimalHours(seconds: number): number {
  if (!seconds || seconds <= 0) {
    throw new Error('Meeting duration must be greater than 0 seconds');
  }
  // Round to 2 decimal places for Intervals
  return Number((seconds / 3600).toFixed(2));
}

function formatMatchReason(reason: string): string {
  // Remove any trailing ellipsis
  let formatted = reason.replace(/\.{3,}$/, '');
  
  // Extract the key information based on common patterns
  if (formatted.includes('Found keyword matches:')) {
    // Check if it's an exact match
    const isExactMatch = formatted.includes('exact match') || 
                        formatted.toLowerCase().includes('identical') ||
                        formatted.includes('same to same');
    
    formatted = formatted.replace('Found keyword matches:', isExactMatch ? 'Exact match:' : 'Match:');
  } else if (formatted.includes('Matched common pattern')) {
    formatted = formatted.replace('Matched common pattern', 'Pattern:');
  } else if (formatted.includes('suggests a focus on')) {
    formatted = formatted.replace(/suggests a focus on (.*?)(,|\.).*$/, 'matches $1');
  }
  
  // Ensure it ends with a period
  if (!formatted.endsWith('.')) {
    formatted += '.';
  }
  
  return formatted;
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

function MatchRow({ 
  result, 
  onMeetingPosted, 
  postedMeetingIds, 
  selectedTasks, 
  onTaskSelect,
  isSelected,
  onSelectChange,
  source
}: MatchRowProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isPosting, setIsPosting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [isTaskSelectOpen, setIsTaskSelectOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const meetingKey = generateMeetingKey(result.meeting, session?.user?.email || '');
  const selectedTask = selectedTasks.get(meetingKey) || result.matchedTask || null;

  // Filter tasks based on search query
  const filteredTasks = searchQuery.trim() === '' 
    ? availableTasks 
    : availableTasks.filter(task => 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        task.project.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Fetch available tasks
  const fetchTasks = async () => {
    if (availableTasks.length > 0) return availableTasks; // Return cached tasks if available
    
    setIsLoadingTasks(true);
    try {
      const response = await fetch('/api/intervals/tasks');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const tasks = await response.json();
      setAvailableTasks(tasks);
      return tasks;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast("Failed to load tasks. Please try again.");
      return [];
    } finally {
      setIsLoadingTasks(false);
    }
  };

  // Preload tasks on component mount
  useEffect(() => {
    fetchTasks();
  }, []); // Empty dependency array to load once

  const handleTaskSelect = () => {
    setIsTaskSelectOpen(true);
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
      const durationInSeconds = userAttendance.duration;
      const meetingKey = generateMeetingKey(result.meeting, session?.user?.email || '');

      const response = await fetch('/api/intervals/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask.id,
          date: meetingDate,
          time: durationInSeconds,
          description: result.meeting.subject,
          meetingId: result.meeting.meetingInfo?.meetingId || result.meeting.subject,
          subject: result.meeting.subject,
          startTime: result.meeting.startTime,
          confidence: result.confidence,
          // Set isManualPost based on the source prop
          isManualPost: source !== 'ai-agent'
        }),
      });

      const postResult = await response.json();
      if (postResult.success) {
        const decimalHours = Number((durationInSeconds / 3600).toFixed(2));
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

  return (
    <TableRow>
      <TableCell className="py-2 pl-2 sm:pl-4">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelectChange}
        />
      </TableCell>
      <TableCell className="py-2">
        <div className="flex flex-col space-y-1">
          <div className="font-medium truncate max-w-[200px] sm:max-w-[300px] text-foreground">
            {result.meeting.subject}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[200px]">
        {selectedTask ? (
          <div className="space-y-1">
            <div className="truncate font-medium text-foreground">{selectedTask.title}</div>
            <div className="text-xs text-muted-foreground dark:text-gray-400 truncate">{selectedTask.project}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTaskSelect}
              disabled={isLoadingTasks}
              className="w-full text-xs text-muted-foreground hover:text-foreground mt-1"
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
                <div className="max-h-[300px] overflow-y-auto">
                  {filteredTasks.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      {availableTasks.length === 0 ? 'No tasks found.' : 'No matching tasks found.'}
                    </div>
                  ) : (
                    <div className="p-1">
                      {filteredTasks.map((task) => (
                        <button
                          key={task.id}
                          className="w-full rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                          onClick={() => handleTaskChange(task)}
                        >
                          <div className="text-left">
                            <div className="font-medium">{task.title}</div>
                            <div className="text-sm text-muted-foreground">{task.project}</div>
                          </div>
                        </button>
                      ))}
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
      <TableCell className="max-w-[300px]">
        <div className="text-sm text-foreground dark:text-gray-100">
          {formatMatchReason(result.reason)}
        </div>
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
    </TableRow>
  );
}

export function MeetingMatches({ summary, matches, onMeetingPosted, postedMeetingIds, source }: MeetingMatchesProps): ReactElement {
  const { data: session } = useSession();
  const { toast } = useToast();
  const userId = session?.user?.email || '';
  const [selectedMeetings, setSelectedMeetings] = useState<Record<string, boolean>>({});
  const [isPostingMultiple, setIsPostingMultiple] = useState(false);
  const [activeTab, setActiveTab] = useState('matched');
  const [selectedTasks, setSelectedTasks] = useState<Map<string, Task>>(new Map());
  const [selectedMeetingKeys, setSelectedMeetingKeys] = useState<Set<string>>(new Set());
  
  // Add a matchesRef to detect actual changes in matches data
  const matchesRef = useRef(matches);

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

    return (
      JSON.stringify(getMeetingIds(newMatches.high)) !== JSON.stringify(getMeetingIds(oldMatches.high)) ||
      JSON.stringify(getMeetingIds(newMatches.medium)) !== JSON.stringify(getMeetingIds(oldMatches.medium)) ||
      JSON.stringify(getMeetingIds(newMatches.low)) !== JSON.stringify(getMeetingIds(oldMatches.low)) ||
      JSON.stringify(getMeetingIds(newMatches.unmatched)) !== JSON.stringify(getMeetingIds(oldMatches.unmatched))
    );
  }, []);

  // Update meetings when matches prop changes
  useEffect(() => {
    if (haveMeetingsChanged(matches, matchesRef.current)) {
      console.log('Matches changed, clearing all states');
      clearAllStates();
      matchesRef.current = matches;
      
      // After clearing, set the new filtered meetings
      setMeetings({
        high: filterMeetings(matches.high),
        medium: filterMeetings(matches.medium),
        low: filterMeetings(matches.low),
        unmatched: filterMeetings(matches.unmatched)
      });
    }
  }, [matches, clearAllStates, haveMeetingsChanged]);

  const filterMeetings = (matchResults: MatchResult[]) => {
    // Convert postedMeetingIds to a Set if it isn't already one
    const postedIds = postedMeetingIds instanceof Set ? postedMeetingIds : new Set(postedMeetingIds);
    
    return matchResults.filter((m: MatchResult) => {
      const meetingKey = generateMeetingKey(m.meeting, userId);
      const meetingId = m.meeting.meetingInfo?.meetingId;
      
      // Check if meeting is already posted - check both the key and the ID
      const isPosted = postedIds.has(meetingKey) || (meetingId && postedIds.has(meetingId));
      
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
      
      // Only include meetings that are not posted and have duration
      const isIncluded = !isPosted && hasDuration && hasAttendance;
      
      if (isPosted) {
        console.log('Filtering out posted meeting:', m.meeting.subject, 'Key:', meetingKey, 'ID:', meetingId);
      }
      
      if (!hasDuration) {
        console.log('Filtering out meeting with zero duration:', m.meeting.subject);
      }
      
      return isIncluded;
    });
  };

  const [meetings, setMeetings] = useState<MatchGroups>(() => ({
    high: filterMeetings(matches.high),
    medium: filterMeetings(matches.medium),
    low: filterMeetings(matches.low),
    unmatched: filterMeetings(matches.unmatched)
  }));

  // Update meetings when props change
  useEffect(() => {
    setMeetings({
      high: filterMeetings(matches.high),
      medium: filterMeetings(matches.medium),
      low: filterMeetings(matches.low),
      unmatched: filterMeetings(matches.unmatched)
    });
  }, [matches, postedMeetingIds, userId]);

  // Add useEffect to remove meetings from UI when they are posted
  useEffect(() => {
    if (postedMeetingIds) {
      setMeetings(prev => ({
        high: filterMeetings(prev.high),
        medium: filterMeetings(prev.medium),
        low: filterMeetings(prev.low),
        unmatched: filterMeetings(prev.unmatched)
      }));
    }
  }, [postedMeetingIds]);

  // Update handleMeetingPosted to efficiently remove the meeting from UI
  const handleMeetingPosted = (meetingId: string): void => {
    console.log('Meeting posted with ID:', meetingId);
    
    // Immediately remove the meeting from all categories
    setMeetings(prev => {
      // Create a filter function to check both key and ID
      const filterMeeting = (m: MatchResult) => {
        const key = generateMeetingKey(m.meeting, userId);
        const id = m.meeting.meetingInfo?.meetingId;
        return key !== meetingId && id !== meetingId;
      };
      
      const updated = {
        high: prev.high.filter(filterMeeting),
        medium: prev.medium.filter(filterMeeting),
        low: prev.low.filter(filterMeeting),
        unmatched: prev.unmatched.filter(filterMeeting)
      };
      
      console.log('Updated meetings after posting:', updated);
      return updated;
    });
    
    // Clear the selected task for this meeting
    const updatedTasks = new Map(selectedTasks);
    updatedTasks.delete(meetingId);
    setSelectedTasks(updatedTasks);
    
    // Remove from selected meetings
    setSelectedMeetingKeys(prev => {
      const next = new Set(prev);
      next.delete(meetingId);
      return next;
    });
    
    // Call the parent component's onMeetingPosted callback
    if (onMeetingPosted) {
      onMeetingPosted(meetingId);
    }
  };

  // Update getPostableMeetingsCount function to be more specific
  const getPostableMeetingsCount = () => {
    if (activeTab === 'matched') {
      return meetings.high.filter(m => {
        const hasAttendance = m.meeting.attendanceRecords.some(
          record => record.name === session?.user?.name && record.duration > 0
        );
        const meetingKey = generateMeetingKey(m.meeting, userId);
        const hasMatchedTask = m.matchedTask !== null;
        return hasMatchedTask && hasAttendance && selectedMeetingKeys.has(meetingKey);
      }).length;
    } else {
      return meetings.unmatched.filter(m => {
        const hasAttendance = m.meeting.attendanceRecords.some(
          record => record.name === session?.user?.name && record.duration > 0
        );
        const meetingKey = generateMeetingKey(m.meeting, userId);
        const hasSelectedTask = selectedTasks.has(meetingKey);
        return hasSelectedTask && hasAttendance && selectedMeetingKeys.has(meetingKey);
      }).length;
    }
  };

  // Update postAllMeetings function to handle both sections
  const postAllMeetings = async () => {
    setIsPostingMultiple(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Get meetings based on active tab
      const meetingsToPost = activeTab === 'matched' 
        ? meetings.high.filter(m => {
            const meetingKey = generateMeetingKey(m.meeting, userId);
            const hasAttendance = m.meeting.attendanceRecords.some(
              record => record.name === session?.user?.name && record.duration > 0
            );
            return m.matchedTask && hasAttendance && selectedMeetingKeys.has(meetingKey);
          })
        : meetings.unmatched.filter(m => {
            const meetingKey = generateMeetingKey(m.meeting, userId);
            const hasAttendance = m.meeting.attendanceRecords.some(
              record => record.name === session?.user?.name && record.duration > 0
            );
            return selectedTasks.has(meetingKey) && hasAttendance && selectedMeetingKeys.has(meetingKey);
          });

      const postedIds = new Set<string>();

      for (const result of meetingsToPost) {
        try {
          const userAttendance = result.meeting.attendanceRecords.find(
            record => record.name === session?.user?.name
          );

          if (!userAttendance || !userAttendance.duration || userAttendance.duration <= 0) {
            console.log(`Skipping meeting "${result.meeting.subject}" due to invalid attendance`);
            failCount++;
            continue;
          }

          const meetingDate = new Date(result.meeting.startTime).toISOString().split('T')[0];
          const durationInSeconds = userAttendance.duration;
          const meetingKey = generateMeetingKey(result.meeting, userId);
          const taskToUse = activeTab === 'matched' ? result.matchedTask! : selectedTasks.get(meetingKey)!;
          
          const response = await fetch('/api/intervals/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: taskToUse.id,
              date: meetingDate,
              time: durationInSeconds,
              description: result.meeting.subject,
              meetingId: result.meeting.meetingInfo?.meetingId || result.meeting.subject,
              subject: result.meeting.subject,
              startTime: result.meeting.startTime,
              confidence: result.confidence,
              // Set isManualPost based on the source prop
              isManualPost: source !== 'ai-agent'
            }),
          });

          const postResult = await response.json();
          if (postResult.success) {
            successCount++;
            postedIds.add(meetingKey);
            onMeetingPosted?.(meetingKey);
          } else {
            failCount++;
          }
        } catch (error) {
          console.error('Error posting meeting:', error);
          failCount++;
        }
      }

      // Show notifications
      if (successCount > 0) {
        toast.success(`Successfully posted ${successCount} ${activeTab} meetings`, {
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
      }

      if (failCount > 0) {
          setTimeout(() => {
          toast.error(`Failed to post ${failCount} ${activeTab} meetings`, {
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
        }, successCount > 0 ? 3500 : 0);
      }

    } finally {
      setIsPostingMultiple(false);
    }
  };

  // Add useEffect to initialize selected meetings
  useEffect(() => {
    // Initialize selected meetings when meetings change
    const newSelectedMeetings = new Set<string>();
    
    if (activeTab === 'matched') {
      meetings.high.forEach(m => {
        const meetingKey = generateMeetingKey(m.meeting, userId);
        if (m.matchedTask) {
          newSelectedMeetings.add(meetingKey);
        }
      });
    }
    
    setSelectedMeetingKeys(newSelectedMeetings);
  }, [meetings, activeTab, userId]);

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

  return (
    <div className="bg-background">
      {/* Content */}
      <div className="p-0">
        <Tabs defaultValue="matched" className="w-full" onValueChange={(value) => setActiveTab(value)}>
      <div className="border-b">
            <div className="px-4 flex justify-between items-center">
              <TabsList className="h-10 bg-transparent gap-4">
                <TabsTrigger 
                  value="matched"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-0"
                >
                  Matched ({meetings.high.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="unmatched"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-0"
                >
                  Unmatched ({meetings.unmatched.length})
                </TabsTrigger>
              </TabsList>
              {/* Post All button for each section */}
          {getPostableMeetingsCount() > 0 && (
            <Button
              onClick={postAllMeetings}
              disabled={isPostingMultiple}
              size="sm"
                  className="mr-4"
            >
              {isPostingMultiple ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  Posting...
                </>
              ) : (
                    <>Post All {activeTab === "matched" ? "Matched" : "Unmatched"} ({getPostableMeetingsCount()})</>
              )}
            </Button>
          )}
        </div>
      </div>

          <div className="h-auto overflow-y-auto">
            <TabsContent value="matched" className="p-0 h-full">
              <div className="rounded-md">
                {meetings.high.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                        <TableHead className="w-12 sticky top-0 bg-background z-10">
                      <Checkbox
                            checked={meetings.high.every(m => selectedMeetingKeys.has(generateMeetingKey(m.meeting, userId)))}
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
                      />
                    </TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Meeting Name</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Intervals Task</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Confidence</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.high.map((result, index) => (
                    <MatchRow
                      key={`high-${result.meeting.meetingInfo?.meetingId || result.meeting.subject}-${index}`}
                      result={result}
                      onMeetingPosted={handleMeetingPosted}
                      postedMeetingIds={Array.from(postedMeetingIds)}
                      selectedTasks={selectedTasks}
                      source={source}
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

            <TabsContent value="unmatched" className="p-0 h-full">
              <div className="rounded-md">
                {meetings.unmatched.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                        <TableHead className="w-12 sticky top-0 bg-background z-10">
                      <Checkbox
                            checked={meetings.unmatched.every(m => selectedMeetingKeys.has(generateMeetingKey(m.meeting, userId)))}
                        onCheckedChange={(checked) => {
                              const newKeys = new Set(selectedMeetingKeys);
                              meetings.unmatched.forEach(m => {
                                const key = generateMeetingKey(m.meeting, userId);
                            if (checked) {
                                  newKeys.add(key);
                            } else {
                                  newKeys.delete(key);
                            }
                          });
                              setSelectedMeetingKeys(newKeys);
                        }}
                      />
                    </TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Meeting Name</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Intervals Task</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Confidence</TableHead>
                        <TableHead className="sticky top-0 bg-background z-10">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.unmatched.map((result, index) => (
                    <MatchRow
                      key={`unmatched-${result.meeting.meetingInfo?.meetingId || result.meeting.subject}-${index}`}
                      result={result}
                      onMeetingPosted={handleMeetingPosted}
                      postedMeetingIds={Array.from(postedMeetingIds)}
                      selectedTasks={selectedTasks}
                      source={source}
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
            No unmatched meetings found
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