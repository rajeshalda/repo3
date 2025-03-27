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
  };
  postedAt: string;
  taskName?: string;
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
  const { error, success } = useToast();
  const [isCancelling, setIsCancelling] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Add new state for filtering
  const [filterText, setFilterText] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [workTypeFilter, setWorkTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [filteredMeetings, setFilteredMeetings] = useState<PostedMeeting[]>([]);
  
  // Extract unique modules and work types for filter dropdowns
  const uniqueModules = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.module)));
  const uniqueWorkTypes = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.worktype)));
  const uniqueDates = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.date)));

  // Update filtered meetings whenever filters or meetings change
  useEffect(() => {
    let filtered = [...postedMeetings];
    
    // Filter by search text
    if (filterText) {
      const searchLower = filterText.toLowerCase();
      filtered = filtered.filter(meeting => 
        meeting.timeEntry.description.toLowerCase().includes(searchLower) ||
        (meeting.taskName && meeting.taskName.toLowerCase().includes(searchLower))
      );
    }
    
    // Filter by module
    if (moduleFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.module === moduleFilter);
    }
    
    // Filter by work type
    if (workTypeFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.worktype === workTypeFilter);
    }
    
    // Filter by date
    if (dateFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.date === dateFilter);
    }
    
    setFilteredMeetings(filtered);
  }, [postedMeetings, filterText, moduleFilter, workTypeFilter, dateFilter]);

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
  }, []);

  // Save unmatched meetings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('unmatchedMeetings', JSON.stringify(unmatchedMeetings));
  }, [unmatchedMeetings]);

  // Update handleMeetingPosted to remove from localStorage
  const handleMeetingPosted = (meetingKey: string) => {
    console.log('Meeting posted with key:', meetingKey);
    
    // Extract the meeting ID from the key if possible
    const parts = meetingKey.split('_');
    const meetingId = parts.length >= 3 ? parts[2] : meetingKey;
    
    console.log('Extracted meeting ID:', meetingId);
    
    // Remove from unmatched meetings
    setUnmatchedMeetings(prev => {
      const filtered = prev.filter(m => m.id !== meetingId);
      console.log(`Removed meeting from unmatched meetings. Before: ${prev.length}, After: ${filtered.length}`);
      return filtered;
    });
    
    // Update matchResults to remove the posted meeting based on the meeting ID
    setMatchResults(prev => {
      const updated = {
        high: prev.high.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId),
        medium: prev.medium.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId),
        low: prev.low.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId),
        unmatched: prev.unmatched.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId)
      };
      
      console.log('Updated match results after posting:', updated);
      return updated;
    });
    
    // Add the meeting ID to the postedMeetings list without a full refresh
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
        
        // Force a refresh of the match summary counts
        setMatchSummary(prev => {
          const unmatched = unmatchedMeetings.length - 1; // Subtract the one we just removed
          return {
            ...prev,
            unmatched: unmatched >= 0 ? unmatched : 0,
            total: prev.highConfidence + prev.mediumConfidence + prev.lowConfidence + (unmatched >= 0 ? unmatched : 0)
          };
        });
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
      
      setPostedMeetings(data.meetings || []);
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
            const pendingReviews = reviewsData.reviews
              .filter((review: any) => review.status === 'pending')
              .filter((review: any) => !postedIds.has(review.id));
            
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

  // Initialize agent state from localStorage on component mount
  useEffect(() => {
    const storedAgentState = localStorage.getItem('aiAgentEnabled');
    if (storedAgentState === 'true') {
      // We need to use this approach instead of directly setting state
      // to ensure the toggle function is called properly
      toggleAgent(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAgent = (enabled: boolean) => {
    // If we're currently processing and trying to disable, we should cancel
    if (isProcessing && !enabled) {
      cancelProcessing();
      return; // Don't actually toggle the state yet - wait for cancel to complete
    }
    
    setAgentEnabled(enabled);
    
    // Store the state in localStorage
    localStorage.setItem('aiAgentEnabled', enabled.toString());
    
    if (enabled) {
      addLog('AI Agent enabled - will check for meetings every 5 minutes', 'info');
      success('AI Agent enabled');
      
      // Start the interval
      processMeetings(); // Process immediately when enabled
      
      intervalRef.current = setInterval(() => {
        addLog('Scheduled check for new meetings...', 'info');
        processMeetings();
      }, 5 * 60 * 1000); // 5 minutes in milliseconds
    } else {
      addLog('AI Agent disabled', 'info');
      success('AI Agent disabled');
      
      // Clear the interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

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

  // Add clearPostedMeetings handler
  const clearPostedMeetings = async () => {
    try {
      const response = await fetch('/api/ai-agent/clear-meetings', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear meetings');
      }
      
      // Clear the local state
      setPostedMeetings([]);
      success('Successfully cleared posted meetings');
      addLog('Cleared all posted meetings', 'success');
    } catch (err) {
      console.error('Error clearing meetings:', err);
      error('Failed to clear meetings');
      addLog('Failed to clear posted meetings', 'error');
    }
  };

  // Add clearFilters function
  const clearFilters = () => {
    setFilterText("");
    setModuleFilter("all");
    setWorkTypeFilter("all");
    setDateFilter("all");
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">AI Agent Dashboard</CardTitle>
          <div className="h-10 w-10 flex items-center justify-center border-2 border-blue-500 rounded-md relative">
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
          <p className="text-muted-foreground">
            Automatically process your meetings and create time entries using AI.
            <span className="block mt-1 text-xs">Fetches meetings from the past 7 days.</span>
          </p>
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
                  {isCancelling ? "Cancelling..." : isProcessing ? "Stop AI Agent" : "Enable AI Agent"}
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
                  : "When enabled, the AI Agent will automatically check for new meetings every 5 minutes."}
            </div>
            
            <div className="border-t pt-4 mt-2">
              <Button 
                className="w-full sm:w-auto"
                onClick={isProcessing ? cancelProcessing : handleProcessMeetings}
                disabled={agentEnabled && !isProcessing || isCancelling}
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : isProcessing ? (
                  <>
                    <X className="mr-2 h-4 w-4" />
                    Cancel Processing
                  </>
                ) : (
                  'Process Meetings Now'
                )}
              </Button>
              <div className="text-sm text-muted-foreground mt-2">
                {isCancelling
                  ? "Cancelling the operation. This may take a moment..."
                  : isProcessing 
                    ? "Cancel the current processing operation."
                    : "Manually process your recent meetings and create time entries."}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meeting Matches */}
      <Card>
        <CardHeader>
          <CardTitle>Meeting Review</CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingMatches
            summary={matchSummary}
            matches={matchResults}
            onMeetingPosted={handleMeetingPosted}
            postedMeetingIds={postedMeetings.map(m => m.meetingId)}
          />
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
                <div className="relative h-8">
                  <Search className="h-4 w-4 absolute left-2 top-2 text-muted-foreground" />
                  <Input
                    placeholder="Search meetings..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="h-8 pl-8 pr-4 w-[150px] sm:w-[200px]"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearPostedMeetings}
                  className="h-8"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear History
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
              <div className="text-xs text-muted-foreground mb-2">
                Showing {filteredMeetings.length} of {postedMeetings.length} meetings
                {(filterText || moduleFilter !== "all" || workTypeFilter !== "all" || dateFilter !== "all") && (
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Task Name</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Work Type</TableHead>
                    <TableHead>Posted Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMeetings.map((meeting) => (
                    <TableRow key={meeting.meetingId}>
                      <TableCell>{meeting.timeEntry.date}</TableCell>
                      <TableCell>{meeting.timeEntry.description}</TableCell>
                      <TableCell>
                        {meeting.taskName || (
                          <span className="text-muted-foreground">
                            {`Loading task name...`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{meeting.timeEntry.time}h</TableCell>
                      <TableCell>{meeting.timeEntry.module}</TableCell>
                      <TableCell>{meeting.timeEntry.worktype}</TableCell>
                      <TableCell>{meeting.postedAt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No meetings posted yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 