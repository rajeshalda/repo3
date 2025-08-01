import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";
import { Loader2, Calendar, AlertCircle, Power, Trash2, X, Clock, Filter, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { LogViewer } from "./log-viewer";
import { Switch } from "@/components/ui/switch";
import { MeetingMatches } from "./meeting-matches";
import type { MatchResult } from "@/lib/types";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PM2Status } from './pm2-status';
import { formatDateIST, DEFAULT_DATE_FORMAT } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import ReactMarkdown from 'react-markdown';

interface PostedMeeting {
  meetingId: string;
  userId: string;
  timeEntry: {
    id: string;
    projectid: string;
    moduleid: string;
    taskid: string;
    worktypeid: string;
    personid: string;
    date: string;
    datemodified: string;
    time: string;
    description: string;
    billable: string;
    worktype: string;
    milestoneid: string | null;
    ogmilestoneid: string | null;
    module: string;
    client?: string;
    project?: string;
    taskTitle?: string;
  };
  postedAt: string;
}

interface DailyCount {
  date: string;
  count: number;
}

interface UnmatchedMeeting {
  id: string;
  subject: string;
  startTime: string;
  duration: number;
  reason?: string;
}

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

interface MatchedTask {
  taskId: string;
  taskTitle: string;
  meetingDetails: {
    subject: string;
    startTime: string;
    endTime: string;
    actualDuration: number;
  };
  confidence: number;
  reason: string;
}

export function AIAgentView() {
  const { data: session } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
  const [dailyCounts, setDailyCounts] = useState<DailyCount[]>([]);
  const [unmatchedMeetings, setUnmatchedMeetings] = useState<UnmatchedMeeting[]>([]);
  const [totalMeetings, setTotalMeetings] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [matchResults, setMatchResults] = useState<{
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  }>({
    high: [],
    medium: [],
    low: [],
    unmatched: []
  });
  const [matchSummary, setMatchSummary] = useState({
    total: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    unmatched: 0
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { error, success, toast } = useToast();
  const [isCancelling, setIsCancelling] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Add new state for filtering
  const [filterText, setFilterText] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [workTypeFilter, setWorkTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [filteredMeetings, setFilteredMeetings] = useState<PostedMeeting[]>([]);
  
  // Update sorting state to be more user-friendly with proper typing
  type SortField = keyof PostedMeeting['timeEntry'] | 'meetingId' | 'postedAt';
  
  const [sortConfig, setSortConfig] = useState<{
    field: SortField;
    direction: 'asc' | 'desc';
  }>({
    field: 'date',
    direction: 'desc'
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [paginatedMeetings, setPaginatedMeetings] = useState<PostedMeeting[]>([]);
  
  // Calculate pagination values
  const totalPages = Math.ceil(filteredMeetings.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Hidden meetings state
  const [showHiddenMeetings, setShowHiddenMeetings] = useState(false);

  // Add sorting options with proper typing
  const sortOptions: { label: string; value: SortField }[] = [
    { label: 'Meeting Date', value: 'date' },
    { label: 'Meeting Name', value: 'description' },
    { label: 'Task Name', value: 'taskTitle' },
    { label: 'Duration', value: 'time' },
    { label: 'Client', value: 'client' },
    { label: 'Project', value: 'project' },
    { label: 'Module', value: 'module' },
    { label: 'Work Type', value: 'worktype' },
    { label: 'Posted Date', value: 'postedAt' }
  ];

  // Add helper function to normalize worktype values
  const normalizeWorktype = (meeting: PostedMeeting): string => {
    // Check for worktype in the timeEntry
    if (meeting.timeEntry.worktype) {
      return meeting.timeEntry.worktype;
    }
    
    // If there's no worktype but there's a worktypeid of "807329", return "India-Meeting"
    if (meeting.timeEntry.worktypeid === "807329") {
      return "India-Meeting";
    }
    
    // Default fallback
    return "Meeting";
  };

  // Update sort handler with proper typing
  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Update sortMeetings function with proper typing and null handling
  const sortMeetings = (meetings: PostedMeeting[]) => {
    return [...meetings].sort((a, b) => {
      let aValue: string = '';
      let bValue: string = '';

      if (sortConfig.field === 'meetingId' || sortConfig.field === 'postedAt') {
        aValue = String(a[sortConfig.field] || '');
        bValue = String(b[sortConfig.field] || '');
      } else {
        const field = sortConfig.field as keyof PostedMeeting['timeEntry'];
        aValue = String(a.timeEntry[field] || '');
        bValue = String(b.timeEntry[field] || '');
      }

      // Convert to lowercase for string comparison
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Extract unique modules and work types for filter dropdowns
  const uniqueModules = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.module)));
  const uniqueWorkTypes = Array.from(new Set(postedMeetings.map(meeting => normalizeWorktype(meeting))));
  const uniqueDates = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.date)));
  const uniqueClients = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.client).filter(Boolean))) as string[];
  const uniqueProjects = Array.from(new Set(postedMeetings.map(meeting => 
    meeting.timeEntry.project || meeting.timeEntry.projectid).filter(Boolean))) as string[];

  // Add helper function to decode HTML entities
  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  // Update useEffect dependencies
  useEffect(() => {
    let filtered = [...postedMeetings];
    
    // Filter by search text
    if (filterText) {
      const searchLower = filterText.toLowerCase();
      filtered = filtered.filter(meeting => 
        meeting.timeEntry.description.toLowerCase().includes(searchLower) ||
        (meeting.timeEntry.taskTitle && meeting.timeEntry.taskTitle.toLowerCase().includes(searchLower))
      );
    }
    
    // Filter by module
    if (moduleFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.module === moduleFilter);
    }
    
    // Filter by work type
    if (workTypeFilter !== "all") {
      filtered = filtered.filter(meeting => normalizeWorktype(meeting) === workTypeFilter);
    }
    
    // Filter by date
    if (dateFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.date === dateFilter);
    }
    
    // Filter by client
    if (clientFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.client === clientFilter);
    }
    
    // Filter by project
    if (projectFilter !== "all") {
      filtered = filtered.filter(meeting => 
        meeting.timeEntry.project === projectFilter || meeting.timeEntry.projectid === projectFilter
      );
    }
    
    // Apply sorting
    filtered = sortMeetings(filtered);
    
    setFilteredMeetings(filtered);
  }, [postedMeetings, filterText, moduleFilter, workTypeFilter, dateFilter, clientFilter, projectFilter, sortConfig]);

  // Update paginated meetings when filtered meetings or pagination settings change
  useEffect(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    setPaginatedMeetings(filteredMeetings.slice(start, end));
  }, [filteredMeetings, currentPage, pageSize]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, moduleFilter, workTypeFilter, dateFilter, clientFilter, projectFilter]);

  const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs(currentLogs => [...currentLogs, {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }]);
  };

  useEffect(() => {
    fetchPostedMeetings();
    // Load unmatched meetings from localStorage
    const storedUnmatched = localStorage.getItem('unmatchedMeetings');
    if (storedUnmatched) {
      setUnmatchedMeetings(JSON.parse(storedUnmatched));
    }

    // Set up automatic refresh polling when AI agent is processing
    let refreshInterval: NodeJS.Timeout | null = null;
    
    if (isProcessing) {
      // Poll for updates every 5 seconds when agent is processing
      refreshInterval = setInterval(() => {
        console.log('Auto-refreshing posted meetings while AI agent is processing...');
        fetchPostedMeetings();
      }, 5000);
    }
    
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [isProcessing]); // Re-run effect when processing state changes

  // Save unmatched meetings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('unmatchedMeetings', JSON.stringify(unmatchedMeetings));
  }, [unmatchedMeetings]);

  // Update handleMeetingPosted to remove from localStorage
  const handleMeetingPosted = (meetingKey: string) => {
    console.log('Meeting posted with key:', meetingKey);
    
    // Extract the meeting ID and duration from the key if possible
    const parts = meetingKey.split('_');
    const meetingId = parts.length >= 3 ? parts[2] : meetingKey;
    const meetingDuration = parts.length >= 5 ? parseInt(parts[4], 10) : 0;
    
    console.log('Extracted meeting ID:', meetingId, 'Duration:', meetingDuration);
    
    // Immediately update matchResults to remove the posted meeting - this is the key fix
    setMatchResults(prev => {
      const filterMeeting = (m: any) => {
        // Generate the same meeting key that was used for posting - MUST match generateMeetingKey function exactly
        const userId = session?.user?.email || '';
        const meetingId = m.meeting.meetingInfo?.meetingId?.trim() || '';
        const meetingName = m.meeting.subject?.trim() || 'Untitled Meeting';
        const meetingTime = m.meeting.startTime?.trim() || new Date().toISOString();
        
        // Calculate total duration for this meeting
        let totalDuration = 0;
        let reportId = '';
        const userAttendance = m.meeting.attendanceRecords?.find(
          (record: any) => record?.email === userId
        );
        if (userAttendance) {
          totalDuration = userAttendance.duration || 0;
          // Include reportId if available to differentiate between different attendance sessions
          if (userAttendance.rawRecord && userAttendance.rawRecord.reportId) {
            reportId = userAttendance.rawRecord.reportId;
          }
        }
        
        // If no reportId found from user attendance, try to get it from any attendance record
        if (!reportId && m.meeting.attendanceRecords && m.meeting.attendanceRecords.length > 0) {
          for (const record of m.meeting.attendanceRecords) {
            if (record.rawRecord?.reportId) {
              reportId = record.rawRecord.reportId;
              break;
            }
          }
        }
        
        // Create the exact same key format as generateMeetingKey function
        // Format: userId_reportId_meetingName_meetingId_time_duration
        const currentMeetingKey = `${(userId || '').trim()}_${reportId || 'no-report'}_${meetingName}_${meetingId}_${meetingTime}_${totalDuration}`;
        
        console.log('Comparing keys:', {
          postedKey: meetingKey,
          currentKey: currentMeetingKey,
          matches: currentMeetingKey === meetingKey
        });
        
        // Remove the meeting that matches the posted key exactly
        return currentMeetingKey !== meetingKey;
      };
      
      const updated = {
        high: prev.high.filter(filterMeeting),
        medium: prev.medium.filter(filterMeeting),
        low: prev.low.filter(filterMeeting),
        unmatched: prev.unmatched.filter(filterMeeting)
      };
      
      console.log('Updated match results after posting:', {
        before: {
          high: prev.high.length,
          medium: prev.medium.length,
          low: prev.low.length,
          unmatched: prev.unmatched.length
        },
        after: {
          high: updated.high.length,
          medium: updated.medium.length,
          low: updated.low.length,
          unmatched: updated.unmatched.length
        }
      });
      
      // Update match summary immediately with the new counts
      setTimeout(() => {
        setMatchSummary({
          highConfidence: updated.high.length,
          mediumConfidence: updated.medium.length,
          lowConfidence: updated.low.length,
          unmatched: updated.unmatched.length,
          total: updated.high.length + updated.medium.length + updated.low.length + updated.unmatched.length
        });
      }, 0);
      
      return updated;
    });
    
    // Remove from unmatched meetings, considering both ID and duration
    setUnmatchedMeetings(prev => {
      const filtered = prev.filter(m => {
        // If meeting IDs don't match, keep the meeting
        if (m.id !== meetingId) return true;
        
        // If IDs match, check duration to see if it's the same instance
        // Allow for some time difference (e.g., 10 seconds) to account for minor timing variations
        const durationMatches = Math.abs(m.duration - meetingDuration) <= 10;
        
        // Keep meetings that have the same ID but different durations
        return !durationMatches;
      });
      console.log(`Removed meeting from unmatched meetings. Before: ${prev.length}, After: ${filtered.length}`);
      return filtered;
    });
    
    // Refresh posted meetings list asynchronously (this doesn't affect the UI immediately)
    fetch('/api/posted-meetings')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch posted meetings');
        }
        return response.json();
      })
      .then(data => {
        console.log('Successfully fetched posted meetings after posting');
        setPostedMeetings(data.meetings || []);
      })
      .catch(error => {
        console.error('Error refreshing posted meetings:', error);
      });
  };

  const fetchPostedMeetings = async () => {
    setIsLoading(true);
    try {
      // Fetch posted meetings
      const response = await fetch('/api/posted-meetings');
      if (!response.ok) {
        throw new Error('Failed to fetch posted meetings');
      }
      
      const data = await response.json();
      console.log('Posted meetings data:', data);
      
      // Get the list of posted meeting IDs
      const postedIds = new Set((data.meetings || []).map((m: PostedMeeting) => m.meetingId));
      console.log('Posted meeting IDs:', Array.from(postedIds));
      
      // Filter out hidden meetings based on user preference
      let meetings = data.meetings || [];
      if (session?.user?.email) {
        const hiddenMeetingsKey = `hiddenMeetings_${session.user.email}`;
        const hiddenMeetingIds = JSON.parse(localStorage.getItem(hiddenMeetingsKey) || '[]');
        meetings = meetings.filter((meeting: PostedMeeting) => 
          !hiddenMeetingIds.includes(meeting.meetingId)
        );
      }
      
      setPostedMeetings(meetings);
      setDailyCounts(data.dailyCounts || []);
      
      // Also fetch meetings from reviews.json
      try {
        const reviewsResponse = await fetch('/api/reviews');
        if (reviewsResponse.ok) {
          const reviewsData = await reviewsResponse.json();
          console.log('Reviews data:', reviewsData);
          
          // Add pending review meetings to unmatched meetings
          if (reviewsData.reviews && reviewsData.reviews.length > 0) {
            // Filter out reviews that are already posted
            // Create a more sophisticated check that considers both meeting ID and duration
            const pendingReviews = reviewsData.reviews
              .filter((review: any) => review.status === 'pending')
              .filter((review: any) => {
                // Check if a meeting with this ID exists in posted meetings
                const matchingPostedMeeting = postedMeetings.find(
                  (pm: PostedMeeting) => pm.meetingId === review.id
                );
                
                if (!matchingPostedMeeting) {
                  // No matching posted meeting found, so include this review
                  return true;
                }
                
                // If we found a matching ID, check if it's the same instance by comparing duration
                // Convert the time entry duration (e.g., "0.02") to seconds (72 seconds)
                const postedDuration = parseFloat(matchingPostedMeeting.timeEntry.time) * 3600;
                
                // If durations are different (with some tolerance), this is a different instance
                // Use a 10-second tolerance to account for minor timing differences
                const isDifferentDuration = Math.abs(postedDuration - review.duration) > 10;
                
                console.log(`Comparing durations for ${review.subject}: Posted=${postedDuration}s, Review=${review.duration}s, Different=${isDifferentDuration}`);
                
                // Include this review if it's a different instance (different duration)
                return isDifferentDuration;
              });
            
            console.log(`Found ${pendingReviews.length} pending reviews for current user (after filtering out posted meetings)`);
            
            // Convert review meetings to unmatched meetings format
            const reviewMeetings = pendingReviews.map((review: any) => ({
              id: review.id,
              subject: review.subject,
              startTime: review.startTime,
              duration: review.duration,
              reason: review.reason || 'No matching task found'
            }));
            
            // Filter out existing unmatched meetings that are now posted
            const filteredUnmatched = unmatchedMeetings.filter(m => !postedIds.has(m.id));
            
            // Deduplicate meetings by ID
            const existingIds = new Set(filteredUnmatched.map(m => m.id));
            const uniqueReviewMeetings = reviewMeetings.filter((m: UnmatchedMeeting) => !existingIds.has(m.id));
            
            console.log(`Adding ${uniqueReviewMeetings.length} unique pending reviews to unmatched meetings`);
            
            // Merge existing unmatched meetings with new ones instead of replacing
            const mergedUnmatched = [...filteredUnmatched, ...uniqueReviewMeetings];
            setUnmatchedMeetings(mergedUnmatched);
            
            // Also update match results for display in the UI
            if (mergedUnmatched.length > 0) {
              const unmatchedResults = mergedUnmatched.map((meeting: UnmatchedMeeting): MatchResult => {
                const startTime = new Date(meeting.startTime);
                const endTime = new Date(startTime.getTime() + (meeting.duration * 1000));
                
                return {
                  meeting: {
                    subject: meeting.subject,
                    startTime: meeting.startTime,
                    endTime: endTime.toISOString(),
                    isTeamsMeeting: true,
                    attendanceRecords: [{
                      name: session?.user?.name || 'User',
                      email: session?.user?.email || '',
                      duration: meeting.duration,
                      intervals: [{
                        joinDateTime: meeting.startTime,
                        leaveDateTime: endTime.toISOString(),
                        durationInSeconds: meeting.duration
                      }]
                    }],
                    meetingInfo: {
                      meetingId: meeting.id
                    }
                  },
                  confidence: 0,
                  reason: meeting.reason || 'No matching task found',
                  matchDetails: {
                    titleSimilarity: 0,
                    projectRelevance: 0,
                    contextMatch: 0,
                    timeRelevance: 0
                  },
                  selectedTask: undefined
                };
              });
              
              // Update match results with the new unmatched meetings
              setMatchResults(prevResults => ({
                ...prevResults,
                unmatched: unmatchedResults
              }));
              
              // Update match summary
              setMatchSummary(prevSummary => ({
                ...prevSummary,
                unmatched: unmatchedResults.length,
                total: prevSummary.highConfidence + prevSummary.mediumConfidence + prevSummary.lowConfidence + unmatchedResults.length
              }));
            } else {
              // If there are no unmatched meetings, clear the unmatched list in match results
              setMatchResults(prevResults => ({
                ...prevResults,
                unmatched: []
              }));
              
              // Update match summary
              setMatchSummary(prevSummary => ({
                ...prevSummary,
                unmatched: 0,
                total: prevSummary.highConfidence + prevSummary.mediumConfidence + prevSummary.lowConfidence
              }));
            }
          } else {
            // If there are no reviews, clear the unmatched meetings
            setUnmatchedMeetings([]);
            setMatchResults(prevResults => ({
              ...prevResults,
              unmatched: []
            }));
            
            // Update match summary
            setMatchSummary(prevSummary => ({
              ...prevSummary,
              unmatched: 0,
              total: prevSummary.highConfidence + prevSummary.mediumConfidence + prevSummary.lowConfidence
            }));
          }
        }
      } catch (reviewsError) {
        console.error('Error fetching reviews:', reviewsError);
        // Don't throw here, just log the error and continue
      }
    } catch (err) {
      console.error('Error fetching posted meetings:', err);
      error("Failed to fetch posted meetings");
    } finally {
      setIsLoading(false);
    }
  };

  const cancelProcessing = () => {
    if (abortControllerRef.current) {
      setIsCancelling(true);
      addLog('Cancelling processing...', 'info');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      
      // Update localStorage to reflect disabled state
      localStorage.setItem('aiAgentEnabled', 'false');
    }
  };

  const processMeetings = async () => {
    if (isProcessing) return; // Prevent multiple simultaneous processing
    
    setIsProcessing(true);
    addLog('Starting meeting processing...', 'info');
    
    try {
      // Start a polling mechanism to show progress while the batch is processing
      const pollingInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch('/api/batch-status');
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.batchId) {
              const { completedMeetings, totalMeetings } = statusData;
              addLog(`Processing meetings: ${completedMeetings}/${totalMeetings} completed`, 'info');
            }
          }
        } catch (error) {
          console.error('Error polling batch status:', error);
        }
      }, 5000);
      
      // Create a new AbortController for this processing session
      abortControllerRef.current = new AbortController();
      
      // Call the API to process meetings
      const response = await fetch('/api/test-time-entry', {
        signal: abortControllerRef.current.signal
      });
      
      // Clear the polling interval once the main request completes
      clearInterval(pollingInterval);
      
      if (response.status === 499) {
        // This is a cancelled request response
        addLog('Processing was cancelled', 'info');
        success('Processing cancelled successfully');
        // Set agent to disabled when cancelled
        setAgentEnabled(false);
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to process meetings');
      }
      
      const data = await response.json();
      console.log('AI Agent processing result:', data);
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to process meetings');
      }

      // Add detailed logs from the processing
      if (data.data.meetings) {
        addLog(`Found ${data.data.meetings.length} meetings to process`, 'info');
        data.data.meetings.forEach((meeting: any) => {
          addLog(`Processing: ${meeting.subject}`, 'info');
        });
      }

      // Check if any postings were successful
      if (data.data.posted && data.data.posted.length > 0) {
        // Show toast notification that meetings were posted and view needs refresh
        success("Meetings posted successfully. Click 'Refresh' to view the latest data.");
        
        // Auto-refresh the posted meetings list
        await fetchPostedMeetings();
      }

      // Update match results and summary
      if (data.data.matchResults) {
        const results = {
          high: [] as MatchResult[],
          medium: [] as MatchResult[],
          low: [] as MatchResult[],
          unmatched: [] as MatchResult[]
        };
        
        data.data.matchResults.forEach((result: any) => {
          // Handle both API response formats
          const meetingSubject = result.meeting?.subject || result.meetingSubject;
          const meetingId = result.meeting?.id || result.meetingId;
          
          if (result.matchedTask && result.confidence >= 0.8) {
            results.high.push(result);
            addLog(`High confidence match (${result.confidence}) found for: ${meetingSubject}`, 'success');
          } else if (result.matchedTask && result.confidence >= 0.5) {
            results.medium.push(result);
            addLog(`Medium confidence match (${result.confidence}) found for: ${meetingSubject}`, 'info');
          } else if (result.matchedTask && result.confidence > 0) {
            results.low.push(result);
            addLog(`Low confidence match (${result.confidence}) found for: ${meetingSubject}`, 'error');
          } else {
            // For unmatched meetings, create a compatible structure
            const now = new Date();
            const getValidDate = (dateStr: string | undefined | null) => {
              if (!dateStr) return now;
              try {
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? now : date;
              } catch {
                return now;
              }
            };

            // Calculate duration ensuring it's positive and valid, following intervals.ts logic
            const convertSecondsToDecimalHours = (seconds: number): number => {
              return Number((seconds / 3600).toFixed(2));
            };

            const startTime = getValidDate(result.meeting?.startTime || result.startTime);
            const endTime = getValidDate(result.meeting?.endTime || result.endTime);
            
            // Calculate duration in seconds first
            const durationInSeconds = Math.max(
              result.attendance?.records?.[0]?.duration || 
              Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
              1800 // Minimum 30 minutes
            );

            // Convert to decimal hours for time entry
            const timeInHours = convertSecondsToDecimalHours(durationInSeconds);

            // Get user email from the session, following intervals.ts pattern
            const userEmail = result.organizer?.email || 
                            result.attendance?.records?.[0]?.email || 
                            'ramesh@m365x65088219.onmicrosoft.com';

            // Check if the current user has attendance record with valid duration
            const userAttendance = result.attendance?.records?.find(
              (record: any) => record.email === userEmail
            );
            
            // Only check duration, don't require user attendance for unmatched meetings
            // This allows meetings with valid duration to be shown even if they're unmatched
            if (timeInHours <= 0) {
              console.info('Skipping meeting due to zero duration:', {
                subject: meetingSubject,
                duration: timeInHours
              });
              addLog(`Skipped meeting with zero duration: ${meetingSubject}`, 'info');
              return;
            }

            // Create attendance record with proper structure and validation
            const attendanceRecord = {
              name: result.organizer?.name || result.attendance?.records?.[0]?.name || 'Ramesh',
              email: userEmail,
              duration: durationInSeconds,
              role: 'Organizer',
              intervals: [{
                joinDateTime: startTime.toISOString(),
                leaveDateTime: endTime.toISOString(),
                durationInSeconds: durationInSeconds
              }]
            };

            const unmatchedResult: MatchResult = {
              meeting: {
                subject: meetingSubject || 'Untitled Meeting',
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                isTeamsMeeting: true,
                attendanceRecords: [attendanceRecord],
                meetingInfo: {
                  meetingId: meetingId || `unmatched-${Date.now()}`
                }
              },
              confidence: 0,
              reason: 'No matching task found',
              matchDetails: {
                titleSimilarity: 0,
                projectRelevance: 0,
                contextMatch: 0,
                timeRelevance: 0
              },
              selectedTask: result.selectedTask || null
            };

            // Only add to unmatched if we have valid duration and meeting info
            // We don't require hasValidAttendance here to allow all meetings with duration
            if (timeInHours > 0 && meetingId) {
              results.unmatched.push(unmatchedResult);
              addLog(`No match found for: ${meetingSubject}`, 'error');
              
              // Update unmatchedMeetings state with validated data
              setUnmatchedMeetings(prev => [...prev, {
                id: meetingId,
                subject: meetingSubject || 'Untitled Meeting',
                startTime: startTime.toISOString(),
                duration: durationInSeconds,
                reason: 'No matching task found'
              }]);
            } else {
              addLog(`Skipped invalid meeting: ${meetingSubject} (Invalid duration or missing ID)`, 'error');
            }
          }
        });

        setMatchResults(results);
        setMatchSummary({
          total: data.data.matchResults.length,
          highConfidence: results.high.length,
          mediumConfidence: results.medium.length,
          lowConfidence: results.low.length,
          unmatched: results.unmatched.length
        });
      }

      if (data.data.timeEntries) {
        data.data.timeEntries.forEach((entry: any) => {
          if (entry.error) {
            addLog(`Failed to create time entry for: ${entry.meetingSubject} - ${entry.error}`, 'error');
          } else {
            addLog(`Created time entry for: ${entry.meetingSubject}`, 'success');
          }
        });
      }
      
      const successMessage = `Successfully processed ${data.data.uniqueMeetings} meetings`;
      if (data.data.uniqueMeetings > 0) {
        success(successMessage);
      }
      addLog(successMessage, 'success');
      
      // Refresh posted meetings after processing
      await fetchPostedMeetings();
    } catch (error) {
      // Don't show error if it was a cancellation
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Error processing meetings:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        addLog(`Error: ${message}`, 'error');
      } else {
        addLog('Processing was cancelled by user', 'info');
        // Set agent to disabled when cancelled via AbortError
        setAgentEnabled(false);
      }
    } finally {
      setIsProcessing(false);
      setIsCancelling(false);
      abortControllerRef.current = null;
      
      // If cancellation occurred but agentEnabled is still true, update it
      if (!intervalRef.current && agentEnabled) {
        setAgentEnabled(false);
      }
    }
  };

  const handleProcessMeetings = async () => {
    await processMeetings();
  };

  const toggleAgent = (enabled: boolean) => {
    // If we're currently processing and trying to disable, we should cancel
    if (isProcessing && !enabled) {
      cancelProcessing();
      return; // Don't actually toggle the state yet - wait for cancel to complete
    }
    
    setAgentEnabled(enabled);
    
    // Store the state in localStorage for UI purposes
    localStorage.setItem('aiAgentEnabled', enabled.toString());
    
    // Call the PM2 service API through our Next.js API proxy
    fetch('/api/pm2/agent-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: session?.user?.email || 'default-user',
        enabled
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        if (enabled) {
          addLog('AI Agent enabled - will run continuously in the background', 'success');
          success('AI Agent enabled and will run even when browser is closed');
        } else {
          addLog('AI Agent disabled', 'info');
          success('AI Agent disabled');
        }
      } else {
        error(`Failed to ${enabled ? 'enable' : 'disable'} AI Agent: ${data.error}`);
        addLog(`Failed to ${enabled ? 'enable' : 'disable'} AI Agent: ${data.error}`, 'error');
        // Revert UI state if the server call failed
        setAgentEnabled(!enabled);
        localStorage.setItem('aiAgentEnabled', (!enabled).toString());
      }
    })
    .catch(err => {
      console.error('Error toggling AI Agent:', err);
      error(`Failed to ${enabled ? 'enable' : 'disable'} AI Agent: Network error`);
      addLog(`Failed to ${enabled ? 'enable' : 'disable'} AI Agent: Network error`, 'error');
      // Revert UI state if the server call failed
      setAgentEnabled(!enabled);
      localStorage.setItem('aiAgentEnabled', (!enabled).toString());
    });
  };

  // Initialize agent state from PM2 service on component mount
  useEffect(() => {
    // Check the PM2 service for current status
    const userEmail = session?.user?.email || 'default-user';
    
    fetch(`/api/pm2/agent-status?userId=${encodeURIComponent(userEmail)}`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          setAgentEnabled(data.enabled);
          localStorage.setItem('aiAgentEnabled', data.enabled.toString());
          
          if (data.enabled) {
            addLog('AI Agent is enabled and running in the background', 'info');
          }
        }
      })
      .catch(err => {
        console.error('Error fetching AI Agent status:', err);
        // Fall back to localStorage if the server is not available
        const storedAgentState = localStorage.getItem('aiAgentEnabled');
        if (storedAgentState === 'true') {
          setAgentEnabled(true);
        }
      });
    
    // Regular polling to update the UI with the latest status
    const statusInterval = setInterval(() => {
      fetch('/api/pm2/status')
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            // Update any UI elements with the latest status if needed
            // This could show things like uptime, number of users, etc.
          }
        })
        .catch(() => {
          // Ignore errors during status polling
        });
    }, 60000); // Poll every minute
    
    return () => {
      clearInterval(statusInterval);
    };
  }, [session]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Add a date formatter function near the other utility functions
  const formatDateTime = (dateString: string) => {
    return formatDateIST(dateString, DEFAULT_DATE_FORMAT);
  };

  // Add clearPostedMeetings handler - FRONTEND ONLY (preserves SQLite data)
  const clearPostedMeetings = async () => {
    try {
      // Only clear the frontend display - DO NOT delete from SQLite database
      // This preserves data integrity and prevents duplicate processing issues
      
      if (session?.user?.email) {
        const userEmail = session.user.email;
        
        // Clear only from local state - SQLite data remains intact
        setPostedMeetings(prevMeetings => 
          prevMeetings.filter(meeting => meeting.userId !== userEmail)
        );
        
        // Store user preference to hide cleared meetings in localStorage
        const hiddenMeetingsKey = `hiddenMeetings_${userEmail}`;
        const currentHidden = JSON.parse(localStorage.getItem(hiddenMeetingsKey) || '[]');
        const userMeetingIds = postedMeetings
          .filter(meeting => meeting.userId === userEmail)
          .map(meeting => meeting.meetingId);
        
        const updatedHidden = [...new Set([...currentHidden, ...userMeetingIds])];
        localStorage.setItem(hiddenMeetingsKey, JSON.stringify(updatedHidden));
        
        success('Successfully cleared your posted meetings from view (data preserved in database)');
        addLog('Cleared posted meetings from view - database data preserved', 'success');
      } else {
        throw new Error('User session not found');
      }
    } catch (err) {
      console.error('Error clearing meetings view:', err);
      error('Failed to clear your meetings view');
      addLog('Failed to clear posted meetings view', 'error');
    }
  };

  // Function to restore hidden meetings
  const restoreHiddenMeetings = async () => {
    try {
      if (session?.user?.email) {
        const hiddenMeetingsKey = `hiddenMeetings_${session.user.email}`;
        localStorage.removeItem(hiddenMeetingsKey);
        
        // Refresh the meetings list to show all data
        await fetchPostedMeetings();
        
        success('Hidden meetings restored successfully');
        addLog('Restored hidden meetings to view', 'success');
      }
    } catch (err) {
      console.error('Error restoring hidden meetings:', err);
      error('Failed to restore hidden meetings');
      addLog('Failed to restore hidden meetings', 'error');
    }
  };

  // Update clearFilters to include sorting reset
  const clearFilters = () => {
    setFilterText("");
    setModuleFilter("all");
    setWorkTypeFilter("all");
    setDateFilter("all");
    setClientFilter("all");
    setProjectFilter("all");
    setSortConfig({
      field: 'date',
      direction: 'desc'
    });
  };

  const [status, setStatus] = useState<string>('');
  
  const handleRefresh = async () => {
    try {
      const response = await fetch('/api/ai-agent/status');
      const data = await response.json();
      setStatus(data.status);
    } catch (error) {
      console.error('Error refreshing status:', error);
    }
  };

  const handleRestart = async () => {
    try {
      await fetch('/api/ai-agent/restart', { method: 'POST' });
      // Refresh status after restart
      handleRefresh();
    } catch (error) {
      console.error('Error restarting agent:', error);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-6">
      {/* Header Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">AI Agent Dashboard</CardTitle>
          <div className="relative w-10 h-10 border-2 border-blue-500 rounded-lg">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-blue-500 font-bold text-sm">AI</span>
            </div>
            {/* Chip pins */}
            <div className="absolute w-1 h-1 bg-blue-500 -left-1 top-1/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -left-1 top-2/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -left-1 top-3/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -right-1 top-1/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -right-1 top-2/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -right-1 top-3/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -top-1 left-1/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -top-1 left-2/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -top-1 left-3/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -bottom-1 left-1/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -bottom-1 left-2/4"></div>
            <div className="absolute w-1 h-1 bg-blue-500 -bottom-1 left-3/4"></div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Automatically process your meetings and create time entries using AI Agent.
              </p>
              <div className="text-sm text-muted-foreground mt-2 space-y-2">
                <p>Fetches meetings for full IST day (Indian Standard Time):</p>
        
                <p className="text-sm">All times are processed in UTC and converted to IST for display.</p>
              </div>
              <div className="flex items-center space-x-2 mt-2 p-2 bg-yellow-50 border-2 border-yellow-500 rounded-md relative overflow-hidden">
                <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#fef9c3,#fef9c3_10px,#fef08a_10px,#fef08a_20px)] opacity-20"></div>
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 z-10" />
                <p className="text-sm font-bold text-yellow-700 z-10">WARNING: Agent can make mistakes. Read the information below.</p>
              </div>
            </div>
            <div className="flex items-start space-x-2 bg-yellow-50 p-3 rounded-md">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-sm text-yellow-800 mb-1">For Better AI Task Matching:</h4>
                <ul className="text-xs text-yellow-700 space-y-1">
                  <li>• Use clear meeting names (e.g., "Sprint Planning - Project X" instead of "Discussion")</li>
                  <li>• Match meeting names with task names</li>
                  <li>• Use format: [Project] - [Meeting Type]</li>
                  <li>• Verify AI matches before posting</li>
                  <li>• Use full names, avoid abbreviations</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {isProcessing ? (
                  <X className={`h-4 w-4 text-red-500 ${isCancelling ? "animate-pulse" : ""}`} />
                ) : (
                  <Power className={`h-4 w-4 ${agentEnabled ? 'text-green-500' : 'text-gray-400'}`} />
                )}
                <span className={`${isProcessing ? "text-red-500 font-medium" : ""} ${isCancelling ? "animate-pulse" : ""}`}>
                  {isCancelling
                    ? "Cancelling..."
                    : isProcessing
                      ? "Stop AI Agent"
                      : "Enable AI Agent"}
                </span>
              </div>
              <Switch 
                checked={agentEnabled} 
                onCheckedChange={toggleAgent}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {isCancelling
                ? "Cancelling the current process..."
                : isProcessing 
                  ? "Click the toggle to stop the currently running process."
                  : agentEnabled
                    ? "Click the toggle to disable the AI Agent."
                    : "Click the toggle to enable the AI Agent. AI Agent will automatically check for new meetings every 30 minutes."}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meeting Matches */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Meeting Review</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[350px] overflow-auto">
          <div className="meeting-matches-component">
            <MeetingMatches
              summary={matchSummary}
              matches={matchResults}
              onMeetingPosted={handleMeetingPosted}
              postedMeetingIds={postedMeetings.map(m => m.meetingId)}
              source="ai-agent"
            />
          </div>
        </CardContent>
      </Card>

      {/* Recently Posted Meetings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Recently Posted Meetings</CardTitle>
          <div className="flex space-x-2">
            {postedMeetings.length > 0 && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Filters
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-4">
                      <h4 className="font-medium">Filter Meetings</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="text-sm font-medium">Date</label>
                          <Select
                            value={dateFilter}
                            onValueChange={setDateFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select date" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Dates</SelectItem>
                              {uniqueDates.map(date => (
                                <SelectItem key={date} value={date}>{date}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Client</label>
                          <Select
                            value={clientFilter}
                            onValueChange={setClientFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Clients</SelectItem>
                              {uniqueClients.map(client => (
                                <SelectItem key={client} value={client}>{client}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Project</label>
                          <Select
                            value={projectFilter}
                            onValueChange={setProjectFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Projects</SelectItem>
                              {uniqueProjects.map(project => (
                                <SelectItem key={project} value={project}>{project}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Module</label>
                          <Select
                            value={moduleFilter}
                            onValueChange={setModuleFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select module" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Modules</SelectItem>
                              {uniqueModules.map(module => (
                                <SelectItem key={module} value={module}>{module}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Work Type</label>
                          <Select
                            value={workTypeFilter}
                            onValueChange={setWorkTypeFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select work type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Work Types</SelectItem>
                              {uniqueWorkTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button onClick={clearFilters} variant="outline" size="sm" className="w-full">
                        Clear Filters
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      Sort
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60">
                    <div className="space-y-4">
                      <h4 className="font-medium">Sort Meetings</h4>
                      <div className="space-y-2">
                        <Select
                          value={sortConfig.field}
                          onValueChange={(value: SortField) => setSortConfig(prev => ({ 
                            ...prev, 
                            field: value
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field to sort" />
                          </SelectTrigger>
                          <SelectContent>
                            {sortOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSortConfig(prev => ({
                            ...prev,
                            direction: prev.direction === 'asc' ? 'desc' : 'asc'
                          }))}
                          className="w-full"
                        >
                          {sortConfig.direction === 'asc' ? 'Sort Ascending ↑' : 'Sort Descending ↓'}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="relative h-8">
                  <Search className="h-4 w-4 absolute left-2 top-2 text-muted-foreground" />
                  <Input
                    placeholder="Search meetings..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="h-8 pl-8 pr-4 w-[150px] sm:w-[200px]"
                  />
                </div>
                
                {/* Action Buttons */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearPostedMeetings}
                  className="h-8"
                  title="Hide your posted meetings from view (preserves database data)"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear History
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={restoreHiddenMeetings}
                  className="h-8"
                  title="Restore previously hidden meetings to view"
                  disabled={true}
                >
                  Restore Hidden
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : postedMeetings.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredMeetings.length)} of {filteredMeetings.length} meetings
                  {filteredMeetings.length !== postedMeetings.length && ` (filtered from ${postedMeetings.length} total)`}
                  {(filterText || moduleFilter !== "all" || workTypeFilter !== "all" || dateFilter !== "all" || clientFilter !== "all" || projectFilter !== "all") && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={clearFilters}
                      className="h-6 p-0 ml-2"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows per page:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Meeting Date
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Meeting Name
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Task Name
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Duration
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Client
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Project
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Module
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Work Type
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Billable
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Posted Date & Time
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedMeetings.map((meeting) => (
                    <TableRow key={`${meeting.meetingId}-${meeting.timeEntry.time}-${meeting.postedAt}`}>
                      <TableCell>{meeting.timeEntry.date}</TableCell>
                      <TableCell>{decodeHtmlEntities(meeting.timeEntry.description)}</TableCell>
                      <TableCell>
                        {meeting.timeEntry.taskTitle ? decodeHtmlEntities(meeting.timeEntry.taskTitle) : (
                          <span className="text-muted-foreground">
                            {`No task title available`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{meeting.timeEntry.time}</TableCell>
                      <TableCell>{meeting.timeEntry.client || "N/A"}</TableCell>
                      <TableCell>{meeting.timeEntry.project || meeting.timeEntry.projectid || "N/A"}</TableCell>
                      <TableCell>{decodeHtmlEntities(meeting.timeEntry.module)}</TableCell>
                      <TableCell>{decodeHtmlEntities(normalizeWorktype(meeting))}</TableCell>
                      <TableCell>{meeting.timeEntry.billable === 't' ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{formatDateTime(meeting.postedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="h-8"
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8"
                    >
                      Previous
                    </Button>
                    <span className="flex items-center gap-1 text-sm">
                      {Math.max(1, currentPage - 2) !== 1 && (
                        <>
                          <Button
                            variant={1 === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            className="h-8 w-8"
                          >
                            1
                          </Button>
                          {Math.max(1, currentPage - 2) > 2 && <span>...</span>}
                        </>
                      )}
                      
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                          if (pageNum <= totalPages) {
                            return (
                              <Button
                                key={pageNum}
                                variant={pageNum === currentPage ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(pageNum)}
                                className="h-8 w-8"
                              >
                                {pageNum}
                              </Button>
                            );
                          }
                          return null;
                        }
                      )}
                      
                      {Math.min(totalPages, currentPage + 2) !== totalPages && totalPages > 5 && (
                        <>
                          {Math.min(totalPages, currentPage + 2) < totalPages - 1 && <span>...</span>}
                          <Button
                            variant={totalPages === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            className="h-8 w-8"
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8"
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="h-8"
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No meetings posted yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Agent Status Card - Hidden but code preserved for future use */}
      {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <PM2Status />
      </div> */}
    </div>
  );
} 