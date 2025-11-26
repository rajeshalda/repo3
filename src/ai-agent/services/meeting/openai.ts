import { openAIClient } from '../../core/azure-openai/client';
import { Meeting, MeetingAnalysis, ProcessedMeeting, AttendanceRecord } from '../../../interfaces/meetings';
import { database } from '../../../lib/database';
import { QueueManager } from '../queue/queue-manager';
import { BatchProcessor } from './batch-processor';
import { RateLimiter } from '../../core/rate-limiter/token-bucket';
import { AttendanceReportManager } from './attendance-report-manager';

export class MeetingService {
    private static instance: MeetingService;
    private queueManager: QueueManager;
    private batchProcessor: BatchProcessor;
    private rateLimiter: RateLimiter;

    private constructor() {
        this.queueManager = QueueManager.getInstance();
        this.batchProcessor = BatchProcessor.getInstance();
        this.rateLimiter = RateLimiter.getInstance();
        
        // Set the process function in the batch processor to avoid circular dependency
        this.batchProcessor.setProcessFunction((meeting, userId) => 
            this.analyzeMeetingInternal(meeting, userId)
        );
    }

    public static getInstance(): MeetingService {
        if (!MeetingService.instance) {
            MeetingService.instance = new MeetingService();
        }
        return MeetingService.instance;
    }

    private async getGraphToken(): Promise<string> {
        try {
            const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_AD_APP_TENANT_ID}/oauth2/v2.0/token`;
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: process.env.AZURE_AD_APP_CLIENT_ID!,
                    client_secret: process.env.AZURE_AD_APP_CLIENT_SECRET!,
                    grant_type: 'client_credentials',
                    scope: 'https://graph.microsoft.com/.default'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get access token');
            }

            const data = await response.json();
            return data.access_token;
        } catch (error) {
            console.error('Error getting graph token:', error);
            throw error;
        }
    }

    private extractMeetingInfo(joinUrl: string): { meetingId: string | undefined; organizerId: string | undefined } {
        const result = {
            meetingId: undefined as string | undefined,
            organizerId: undefined as string | undefined
        };

        try {
            const decodedUrl = decodeURIComponent(joinUrl);
            
            const meetingMatch = decodedUrl.match(/19:meeting_([^@]+)@thread\.v2/);
            if (meetingMatch) {
                result.meetingId = `19:meeting_${meetingMatch[1]}@thread.v2`;
            }

            const organizerMatch = decodedUrl.match(/"Oid":"([^"]+)"/);
            if (organizerMatch) {
                result.organizerId = organizerMatch[1];
            }
        } catch (error) {
            console.error('Error extracting meeting info:', error);
        }

        return result;
    }

    private async getAttendanceRecords(userId: string, meetingId: string, organizerId: string, accessToken: string): Promise<AttendanceRecord[]> {
        try {
            const formattedString = `1*${organizerId}*0**${meetingId}`;
            const base64MeetingId = Buffer.from(formattedString).toString('base64');

            // First get the user info
            const userResponse = await fetch(
                `https://graph.microsoft.com/v1.0/users/${userId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!userResponse.ok) {
                console.log('Failed to get user info');
                return [];
            }

            const userData = await userResponse.json();
            const targetUserId = userData.id;

            // Get attendance reports
            const reportsResponse = await fetch(
                `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!reportsResponse.ok) {
                return [];
            }

            const reportsData = await reportsResponse.json();
            if (!reportsData.value || reportsData.value.length === 0) {
                return [];
            }

            // Initialize the attendance report manager
            const reportManager = new AttendanceReportManager();
            
            // Process all reports using the manager
            // Use meeting's start date if available, otherwise current date
            const currentDate = new Date().toISOString();
            const meetingDate = currentDate; // Default to current date
            const isRecurring = true;
            
            // Enhanced logging for debugging time-related issues
            console.log(`
┌─────────────────── ATTENDANCE REPORT REQUEST ─────────────────┐
│ 📊 Processing attendance report with:                         │
│ 📅 Meeting Date UTC: ${meetingDate}                           │
│ 🕒 Meeting Date IST: ${new Date(meetingDate).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} │
│ 🔄 Is Recurring: ${isRecurring}                               │
└─────────────────────────────────────────────────────────────┘`);
            
            const reportSelection = await reportManager.processAttendanceReports(
                reportsData.value,
                meetingDate,
                isRecurring
            );

            if (!reportSelection.selectedReportId) {
                console.log('No valid report selected:', reportSelection.reason);
                return [];
            }

            // Use the selected report ID
            const reportId = reportSelection.selectedReportId;
            console.log('Selected report ID:', reportId, 'Reason:', reportSelection.reason);

            // Get attendance records for the selected report
            const recordsResponse = await fetch(
                `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports/${reportId}/attendanceRecords`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!recordsResponse.ok) {
                return [];
            }

            const recordsData = await recordsResponse.json();
            return recordsData.value || [];
        } catch (error) {
            console.error('Error fetching attendance records:', error);
            return [];
        }
    }

    /**
     * Analyze a single meeting - this is the public API that maintains backward compatibility
     * It now uses the queue system internally
     */
    public async analyzeMeeting(meeting: Meeting, userId: string): Promise<ProcessedMeeting> {
        try {
            // Check if meeting was already processed (SQLite cache)
            const sqliteCache = database.getMeetingCache(meeting.id, userId);
            if (sqliteCache) {
                console.log(`Meeting ${meeting.id} already processed, returning cached result`);
                return sqliteCache.meeting;
            }

            // Use the queue manager to handle rate limiting
            return await this.queueManager.queueMeetingAnalysis(
                meeting,
                userId,
                (m, uid) => this.analyzeMeetingInternal(m, uid)
            );
        } catch (error: unknown) {
            console.error('Error analyzing meeting:', error);
            throw new Error(error instanceof Error ? error.message : 'An unknown error occurred');
        }
    }

    /**
     * Internal method used by the queue manager to process a meeting
     * This contains the actual processing logic
     */
    public async analyzeMeetingInternal(meeting: Meeting, userId: string): Promise<ProcessedMeeting> {
        try {
            // Check if meeting was already processed (double-check in case it was processed while in queue)
            // Load from SQLite cache
            let existingMeeting = null;
            let cachedReportCount = 0;

            const sqliteCache = database.getMeetingCache(meeting.id, userId);
            if (sqliteCache) {
                existingMeeting = sqliteCache.meeting;
                cachedReportCount = sqliteCache.reportCount;
                console.log(`📦 SQLite CACHE HIT: ${meeting.id.substring(0, 15)}... (reports: ${cachedReportCount})`);
            } else {
                console.log(`📦 SQLite CACHE MISS: ${meeting.id.substring(0, 15)}... (will process with AI)`);
            }

            // If we have a cached meeting, check if new reports are available
            if (existingMeeting && meeting.onlineMeeting?.joinUrl) {
                try {
                    const accessToken = await this.getGraphToken();
                    const { meetingId, organizerId } = this.extractMeetingInfo(meeting.onlineMeeting.joinUrl);
                    
                    if (meetingId && organizerId) {
                        // Get user info
                        const userResponse = await fetch(
                            `https://graph.microsoft.com/v1.0/users/${userId}`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json'
                                }
                            }
                        );
                        
                        if (userResponse.ok) {
                            const userData = await userResponse.json();
                            const targetUserId = userData.id;
                            
                            const formattedString = `1*${organizerId}*0**${meetingId}`;
                            const base64MeetingId = Buffer.from(formattedString).toString('base64');
                            
                            // Get current attendance reports
                            const reportsResponse = await fetch(
                                `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            
                            if (reportsResponse.ok) {
                                const reportsData = await reportsResponse.json();
                                const currentReportCount = reportsData.value?.length || 0;
                                // cachedReportCount already set above (from SQLite or JSON)

                                console.log(`🔧 CACHE CHECK: Meeting "${meeting.subject}"`);
                                console.log(`🔧 CACHE CHECK: Current reports: ${currentReportCount}, Cached reports: ${cachedReportCount}`);
                                
                                // If we have more reports now than when cached, force reprocessing
                                if (currentReportCount > cachedReportCount) {
                                    console.log(`🔄 NEW REPORTS DETECTED: Found ${currentReportCount} reports vs ${cachedReportCount} cached. Forcing reprocessing...`);
                                    // Don't return cached result, continue with fresh processing
                                } else {
                                    console.log(`♻️ USING CACHE: No new reports found, returning cached result`);

                                    // IMPORTANT: Enrich cached meeting with current attendance data
                                    // The cached meeting might have been created with an older schema
                                    // We need to ensure it has the current attendance structure
                                    if (meeting.attendance) {
                                        existingMeeting.attendance = meeting.attendance;
                                        console.log(`✅ CACHE ENRICHMENT: Updated cached meeting with current attendance data`);
                                    }

                                    return existingMeeting;
                                }
                            } else {
                                // If we can't check reports, use cached version
                                console.log(`Meeting ${meeting.id} already processed while in queue, returning cached result`);
                                return existingMeeting;
                            }
                        } else {
                            // If we can't check reports, use cached version
                            console.log(`Meeting ${meeting.id} already processed while in queue, returning cached result`);
                            return existingMeeting;
                        }
                    } else {
                        // If we can't extract meeting info, use cached version
                        console.log(`Meeting ${meeting.id} already processed while in queue, returning cached result`);
                        return existingMeeting;
                    }
                } catch (error) {
                    // If any error occurs during report checking, use cached version
                    console.log(`Meeting ${meeting.id} already processed while in queue, returning cached result`);
                    return existingMeeting;
                }
            } else if (existingMeeting) {
                // For non-online meetings, always use cache
                console.log(`Meeting ${meeting.id} already processed while in queue, returning cached result`);
                return existingMeeting;
            }

            // Wait for rate limiter to allow the request
            await this.rateLimiter.acquireToken();

            // Get attendance records if it's an online meeting
            let attendance;
            let selectedReportId: string | undefined;
            let allValidReports: any[] = [];
            
            if (meeting.onlineMeeting?.joinUrl) {
                try {
                    const accessToken = await this.getGraphToken();
                    const { meetingId, organizerId } = this.extractMeetingInfo(meeting.onlineMeeting.joinUrl);
                    
                    if (meetingId && organizerId) {
                        // Get attendance reports first to find the report ID
                        const formattedString = `1*${organizerId}*0**${meetingId}`;
                        const base64MeetingId = Buffer.from(formattedString).toString('base64');
                        
                        // Get user info
                        const userResponse = await fetch(
                            `https://graph.microsoft.com/v1.0/users/${userId}`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json'
                                }
                            }
                        );
                        
                        if (userResponse.ok) {
                            const userData = await userResponse.json();
                            const targetUserId = userData.id;
                            
                            // Get attendance reports
                            const reportsResponse = await fetch(
                                `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports`,
                                {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    }
                                }
                            );
                            
                            if (reportsResponse.ok) {
                                const reportsData = await reportsResponse.json();
                                
                                if (reportsData.value && reportsData.value.length > 0) {
                                    // Initialize the attendance report manager
                                    const reportManager = new AttendanceReportManager();
                                    
                                    // Process all reports using the manager
                                    // Use timeEntryDate if set by agent, otherwise fall back to scheduled dateTime
                                    const meetingDate = meeting.timeEntryDate ? `${meeting.timeEntryDate}T00:00:00.0000000` : meeting.start.dateTime;
                                    const isRecurring = !!meeting.seriesMasterId;
                                    
                                    // Check if there are multiple reports (user rejoined multiple times)
                                    const hasMultipleReports = reportsData.value.length > 1;
                                    
                                    // Enhanced logging for time-related issues
                                    const meetingStartIST = new Date(meeting.start.dateTime).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
                                    const meetingStartHourIST = new Date(meetingStartIST).getHours();
                                    const isEarlyMorning = meetingStartHourIST >= 0 && meetingStartHourIST < 5.5;
                                    
                                    console.log(`
┌─────────────────── MEETING TIME INFO ─────────────────────┐
│ 📅 Meeting UTC: ${meeting.start.dateTime}                 │
│ 🕒 Meeting IST: ${meetingStartIST}                        │
│ ⏰ Hour (IST): ${meetingStartHourIST}                     │
│ 🌅 Early Morning: ${isEarlyMorning ? 'YES' : 'NO'}        │
│ 🎯 Target Date: ${meeting.timeEntryDate || 'Not set (using scheduled)'}        │
│ 📊 Validation Date: ${meetingDate}                        │
└─────────────────────────────────────────────────────────┘`);
                                    
                                    // For meetings with multiple reports (recurring OR user rejoined multiple times), get ALL valid reports
                                    if (hasMultipleReports) {
                                        const allReportSelections = await reportManager.processAllValidReports(
                                            reportsData.value,
                                            meetingDate,
                                            isRecurring
                                        );
                                        
                                        if (allReportSelections.length > 0) {
                                            console.log(`🔄 Found ${allReportSelections.length} valid reports for meeting (${isRecurring ? 'recurring' : 'user rejoined multiple times'})`);

                                            // Store all valid reports for later processing
                                            allValidReports = allReportSelections;

                                            // For the main meeting object, find the report that matches the scheduled meeting date
                                            // Parse the scheduled meeting date to get just the date part in IST (YYYY-MM-DD)
                                            const scheduledDate = new Date(meeting.start.dateTime);
                                            const scheduledDateStr = scheduledDate.toLocaleDateString('en-CA', {
                                                timeZone: 'Asia/Kolkata',
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit'
                                            }); // YYYY-MM-DD in IST

                                            // Find the report whose meeting start date matches the scheduled date (in IST)
                                            let matchingReport = allReportSelections.find(report => {
                                                const reportDate = new Date(report.metadata.date);
                                                const reportDateStr = reportDate.toLocaleDateString('en-CA', {
                                                    timeZone: 'Asia/Kolkata',
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit'
                                                }); // YYYY-MM-DD in IST
                                                return reportDateStr === scheduledDateStr;
                                            });

                                            // If no exact match found, fall back to the most recent report
                                            if (!matchingReport) {
                                                console.log(`⚠️ No report found matching scheduled date ${scheduledDateStr}, using most recent report`);
                                                matchingReport = allReportSelections.sort((a, b) =>
                                                    new Date(b.metadata.date).getTime() - new Date(a.metadata.date).getTime()
                                                )[0];
                                            } else {
                                                console.log(`✅ Found report matching scheduled date ${scheduledDateStr}`);
                                            }

                                            selectedReportId = matchingReport.selectedReportId;
                                            console.log('Using report for main meeting object:', selectedReportId, 'with date:', matchingReport.metadata.date);

                                            // Override the meeting date but keep the scheduled time
                                            // Extract the date from the report (when attended) and time from the schedule
                                            const reportDate = new Date(matchingReport.metadata.date);
                                            const reportDateStr = reportDate.toLocaleDateString('en-CA', {
                                                timeZone: 'Asia/Kolkata',
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit'
                                            });

                                            const scheduledTime = new Date(meeting.start.dateTime);
                                            const scheduledTimeStr = scheduledTime.toLocaleTimeString('en-US', {
                                                timeZone: 'Asia/Kolkata',
                                                hour12: false,
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            });

                                            const scheduledEndTime = new Date(meeting.end.dateTime);
                                            const scheduledEndTimeStr = scheduledEndTime.toLocaleTimeString('en-US', {
                                                timeZone: 'Asia/Kolkata',
                                                hour12: false,
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            });

                                            // Combine report date with scheduled time
                                            meeting.start.dateTime = `${reportDateStr}T${scheduledTimeStr}.0000000`;
                                            meeting.end.dateTime = `${reportDateStr}T${scheduledEndTimeStr}.0000000`;
                                            console.log(`📅 Combined date/time: ${meeting.start.dateTime} (date from attendance, time from schedule)`);
                                        }
                                    } else {
                                        // For single report meetings, use the existing single report selection
                                        const reportSelection = await reportManager.processAttendanceReports(
                                            reportsData.value,
                                            meetingDate,
                                            isRecurring
                                        );
                                        
                                        if (reportSelection.selectedReportId) {
                                            selectedReportId = reportSelection.selectedReportId;
                                            allValidReports = [reportSelection];
                                            console.log('Selected single report ID:', selectedReportId, 'Reason:', reportSelection.reason);

                                            // Override the meeting date but keep the scheduled time
                                            const reportDate = new Date(reportSelection.metadata.date);
                                            const reportDateStr = reportDate.toLocaleDateString('en-CA', {
                                                timeZone: 'Asia/Kolkata',
                                                year: 'numeric',
                                                month: '2-digit',
                                                day: '2-digit'
                                            });

                                            const scheduledTime = new Date(meeting.start.dateTime);
                                            const scheduledTimeStr = scheduledTime.toLocaleTimeString('en-US', {
                                                timeZone: 'Asia/Kolkata',
                                                hour12: false,
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            });

                                            const scheduledEndTime = new Date(meeting.end.dateTime);
                                            const scheduledEndTimeStr = scheduledEndTime.toLocaleTimeString('en-US', {
                                                timeZone: 'Asia/Kolkata',
                                                hour12: false,
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            });

                                            // Combine report date with scheduled time
                                            meeting.start.dateTime = `${reportDateStr}T${scheduledTimeStr}.0000000`;
                                            meeting.end.dateTime = `${reportDateStr}T${scheduledEndTimeStr}.0000000`;
                                            console.log(`📅 Combined date/time: ${meeting.start.dateTime} (date from attendance, time from schedule)`);
                                        }
                                    }
                                    
                                    // Get attendance records for the selected report (for the main meeting object)
                                    if (selectedReportId) {
                                        const recordsResponse = await fetch(
                                            `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports/${selectedReportId}/attendanceRecords`,
                                            {
                                                headers: {
                                                    'Authorization': `Bearer ${accessToken}`,
                                                    'Content-Type': 'application/json'
                                                }
                                            }
                                        );
                                        
                                        if (recordsResponse.ok) {
                                            const recordsData = await recordsResponse.json();
                                            const records = recordsData.value || [];
                                            
                                            if (records.length > 0) {
                                                const attendanceRecords = records.map((record: any) => ({
                                                    name: record.identity?.displayName || 'Unknown',
                                                    email: record.emailAddress || '',
                                                    duration: record.totalAttendanceInSeconds,
                                                    role: record.role,
                                                    attendanceIntervals: record.attendanceIntervals
                                                }));
                                                
                                                const totalDuration = attendanceRecords.reduce((sum: number, record: any) => sum + record.duration, 0);
                                                
                                                attendance = {
                                                    records: attendanceRecords,
                                                    summary: {
                                                        totalDuration,
                                                        averageDuration: totalDuration / attendanceRecords.length,
                                                        totalParticipants: attendanceRecords.length
                                                    },
                                                    reportId: selectedReportId, // Store the selected report ID
                                                    allValidReports: allValidReports // Store all valid reports for later processing
                                                };
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to get attendance records for meeting ${meeting.id}:`, error);
                    // Continue processing without attendance records
                }
            }

            // Prepare meeting data for analysis
            const meetingData = this.prepareMeetingData(meeting);
            
            // Get AI analysis with retry logic
            let analysisResult;
            try {
                analysisResult = await openAIClient.analyzeMeeting(meetingData);
            } catch (error) {
                if (error instanceof Error && error.message.includes('429')) {
                    // If rate limited, wait and retry
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    analysisResult = await openAIClient.analyzeMeeting(meetingData);
                } else {
                    throw error;
                }
            }
            
            // Parse AI response
            const analysis = this.parseAnalysis(analysisResult, meeting.id);
            
            // Create processed meeting with properly formatted analysis
            const processedMeeting: ProcessedMeeting = {
                ...meeting,
                analysis: {
                    keyPoints: analysis.keyPoints || [],
                    suggestedCategories: analysis.suggestedCategories || [],
                    confidence: analysis.confidence || 0,
                    context: {
                        patterns: analysis.context?.patterns || []
                    }
                },
                attendance,
                lastProcessed: new Date().toISOString(),
                userId
            };

            // Save to SQLite cache (preserves full attendance data)
            const reportCount = attendance?.allValidReports?.length || 0;
            database.saveMeetingCache(meeting.id, userId, processedMeeting, reportCount);

            return processedMeeting;
        } catch (error: unknown) {
            console.error('Error analyzing meeting internally:', error);
            throw new Error(error instanceof Error ? error.message : 'An unknown error occurred');
        }
    }

    /**
     * New method to process multiple meetings in batches
     */
    public async analyzeMeetingBatch(meetings: Meeting[], userId: string): Promise<string> {
        return this.batchProcessor.processMeetingBatch(meetings, userId);
    }

    /**
     * Get the status of a batch processing job
     */
    public getBatchStatus(batchId: string) {
        return this.batchProcessor.getBatchStatus(batchId);
    }

    /**
     * Update rate limits for all components
     */
    public updateRateLimit(requestsPerMinute: number): void {
        this.queueManager.updateRateLimit(requestsPerMinute);
        this.batchProcessor.updateRateLimit(requestsPerMinute);
        this.rateLimiter.updateRateLimit(requestsPerMinute);
    }

    public async getProcessedMeeting(meetingId: string): Promise<ProcessedMeeting | null> {
        try {
            return database.getMeetingCacheById(meetingId);
        } catch (error: unknown) {
            console.error('Error getting processed meeting:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to get processed meeting');
        }
    }

    public async listProcessedMeetings(userId: string): Promise<ProcessedMeeting[]> {
        try {
            return database.listMeetingCacheByUser(userId);
        } catch (error: unknown) {
            console.error('Error listing processed meetings:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to list processed meetings');
        }
    }

    private prepareMeetingData(meeting: Meeting): string {
        return `
Meeting Subject: ${meeting.subject}
Date: ${meeting.start.dateTime} to ${meeting.end.dateTime}
Organizer: ${meeting.organizer.email}
Attendees: ${meeting.attendees?.map(a => a.email).join(', ') || 'None'}
Preview: ${meeting.bodyPreview || 'No preview available'}
Categories: ${meeting.categories?.join(', ') || 'None'}
Importance: ${meeting.importance || 'Normal'}
Is Cancelled: ${meeting.isCancelled ? 'Yes' : 'No'}
Is All Day: ${meeting.isAllDay ? 'Yes' : 'No'}
        `.trim();
    }

    private parseAnalysis(analysisResult: string, meetingId: string): MeetingAnalysis {
        try {
            const sections = this.extractSections(analysisResult);
            
            return {
                meetingId,
                relevanceScore: this.extractRelevanceScore(sections.relevance),
                keyPoints: this.extractKeyPoints(sections.keyPoints),
                suggestedCategories: this.extractCategories(sections.categories),
                confidence: this.extractConfidenceScore(sections.confidence),
                context: {
                    patterns: this.extractPatterns(sections.context)
                }
            };
        } catch (error: unknown) {
            console.error('Error parsing analysis:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to parse analysis');
        }
    }

    private extractSections(analysisResult: string): Record<string, string> {
        const sections: Record<string, string> = {};
        const lines = analysisResult.split('\n');
        let currentSection = '';
        let currentContent: string[] = [];

        for (const line of lines) {
            if (line.endsWith(':')) {
                if (currentSection) {
                    sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
                    currentContent = [];
                }
                currentSection = line.slice(0, -1).trim();
            } else if (currentSection && line.trim()) {
                currentContent.push(line.trim());
            }
        }

        if (currentSection) {
            sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
        }

        return sections;
    }

    private extractKeyPoints(keyPointsSection: string = ''): string[] {
        return keyPointsSection
            .split('\n')
            .map(point => point.replace(/^-\s*/, '').trim())
            .filter(point => point.length > 0);
    }

    private extractRelevanceScore(relevanceSection: string = ''): number {
        const scoreMatch = relevanceSection.match(/(\d*\.?\d+)/);
        return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
    }

    private extractCategories(categoriesSection: string = ''): string[] {
        return categoriesSection
            .split('\n')
            .map(category => category.replace(/^-\s*/, '').trim())
            .filter(category => category.length > 0);
    }

    private extractConfidenceScore(confidenceSection: string = ''): number {
        const scoreMatch = confidenceSection.match(/(\d*\.?\d+)/);
        return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
    }

    private extractPatterns(contextSection: string = ''): string[] {
        return contextSection
            .split('\n')
            .map(pattern => pattern.replace(/^-\s*/, '').trim())
            .filter(pattern => pattern.length > 0);
    }
}

export const meetingService = MeetingService.getInstance(); 