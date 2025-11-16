'use client';

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { MeetingMatches } from "./meeting-matches";
import type { MatchResult } from "@/lib/types";
import { useSession } from "next-auth/react";

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

export function MeetingReviewView() {
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
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

  // Fetch posted meetings to track which meetings have been posted
  const fetchPostedMeetings = async () => {
    try {
      const response = await fetch('/api/posted-meetings');
      if (response.ok) {
        const data = await response.json();
        setPostedMeetings(data.meetings || []);
      }
    } catch (error) {
      console.error('Error fetching posted meetings:', error);
    }
  };

  // Load match results from AI agent processing and review queue
  const loadMatchResults = async () => {
    try {
      setIsLoading(true);

      // Load from localStorage first (saved from AI agent processing)
      const savedMatches = localStorage.getItem('ai_agent_match_results');
      let localResults: {
        high: MatchResult[];
        medium: MatchResult[];
        low: MatchResult[];
        unmatched: MatchResult[];
      } = {
        high: [],
        medium: [],
        low: [],
        unmatched: []
      };
      let localSummary = {
        total: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        unmatched: 0
      };

      if (savedMatches) {
        const parsed = JSON.parse(savedMatches);
        localResults = parsed.matches || localResults;
        localSummary = parsed.summary || localSummary;
      }

      // Also fetch meetings from the review queue API
      try {
        const response = await fetch('/api/reviews');
        if (response.ok) {
          const reviewData = await response.json();
          console.log('Review queue data:', reviewData);

          // Convert review queue meetings to match results format
          if (reviewData.reviews && reviewData.reviews.length > 0) {
            // Filter for pending reviews only
            const pendingReviews = reviewData.reviews.filter((review: any) => review.status === 'pending');

            const reviewMatches = pendingReviews.map((review: any) => {
              const startTime = new Date(review.startTime || new Date());
              const endTime = new Date(startTime.getTime() + ((review.duration || 0) * 1000));

              return {
                meeting: {
                  subject: review.subject || 'Untitled Meeting',
                  startTime: startTime.toISOString(),
                  endTime: endTime.toISOString(),
                  isTeamsMeeting: true,
                  meetingInfo: {
                    meetingId: review.id,
                    reportId: review.reportId
                  },
                  attendanceRecords: [{
                    name: session?.user?.name || 'User',
                    email: session?.user?.email || '',
                    duration: review.duration || 0,
                    intervals: [{
                      joinDateTime: startTime.toISOString(),
                      leaveDateTime: endTime.toISOString(),
                      durationInSeconds: review.duration || 0
                    }]
                  }]
                },
                matchedTask: null,
                confidence: 0,
                reason: review.reason || 'No matching task found',
                matchDetails: {
                  titleSimilarity: 0,
                  projectRelevance: 0,
                  contextMatch: 0,
                  timeRelevance: 0
                },
                selectedTask: undefined
              };
            });

            // Merge with local unmatched results
            localResults.unmatched = [...localResults.unmatched, ...reviewMatches];
            localSummary.unmatched = localResults.unmatched.length;
            localSummary.total = localResults.high.length + localResults.medium.length +
                                  localResults.low.length + localResults.unmatched.length;
          }
        }
      } catch (error) {
        console.error('Error fetching review queue:', error);
      }

      setMatchResults(localResults);
      setMatchSummary(localSummary);
    } catch (error) {
      console.error('Error loading match results:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle when a meeting is posted
  const handleMeetingPosted = (meetingKey: string) => {
    console.log('Meeting posted with key:', meetingKey);

    // Immediately update matchResults to remove the posted meeting
    setMatchResults(prev => {
      const filterMeeting = (m: any) => {
        // Generate the same meeting key that was used for posting
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
          if (userAttendance.rawRecord && userAttendance.rawRecord.reportId) {
            reportId = userAttendance.rawRecord.reportId;
          }
        }

        if (!reportId && m.meeting.attendanceRecords && m.meeting.attendanceRecords.length > 0) {
          for (const record of m.meeting.attendanceRecords) {
            if (record.rawRecord?.reportId) {
              reportId = record.rawRecord.reportId;
              break;
            }
          }
        }

        const currentMeetingKey = `${(userId || '').trim()}_${reportId || 'no-report'}_${meetingName}_${meetingId}_${meetingTime}_${totalDuration}`;

        return currentMeetingKey !== meetingKey;
      };

      const updated = {
        high: prev.high.filter(filterMeeting),
        medium: prev.medium.filter(filterMeeting),
        low: prev.low.filter(filterMeeting),
        unmatched: prev.unmatched.filter(filterMeeting)
      };

      // Update match summary with the new counts
      setTimeout(() => {
        setMatchSummary({
          highConfidence: updated.high.length,
          mediumConfidence: updated.medium.length,
          lowConfidence: updated.low.length,
          unmatched: updated.unmatched.length,
          total: updated.high.length + updated.medium.length + updated.low.length + updated.unmatched.length
        });
      }, 0);

      // Save updated results to localStorage
      localStorage.setItem('ai_agent_match_results', JSON.stringify({
        matches: updated,
        summary: {
          highConfidence: updated.high.length,
          mediumConfidence: updated.medium.length,
          lowConfidence: updated.low.length,
          unmatched: updated.unmatched.length,
          total: updated.high.length + updated.medium.length + updated.low.length + updated.unmatched.length
        }
      }));

      return updated;
    });

    // Refresh posted meetings list
    fetchPostedMeetings();
  };

  // Load data on mount
  useEffect(() => {
    loadMatchResults();
    fetchPostedMeetings();
  }, []);

  return (
    <div className="space-y-6 px-4 sm:px-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Meeting Review</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[600px] overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="meeting-matches-component">
              <MeetingMatches
                summary={matchSummary}
                matches={matchResults}
                onMeetingPosted={handleMeetingPosted}
                postedMeetingIds={postedMeetings.map(m => m.meetingId)}
                source="ai-agent"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
