import { openAIClient } from '../../core/azure-openai/client';
import { generateMeetingComparisonPrompt } from '../../core/azure-openai/prompts/meeting-comparison';
import { ProcessedMeeting } from '../../../interfaces/meetings';
import { AIAgentPostedMeetingsStorage } from '../storage/posted-meetings';

interface ComparisonResult {
    isDuplicate: boolean;
    confidence: number;
    reason: string;
    matchingCriteria: {
        titleMatch: boolean;
        dateMatch: boolean;
        durationMatch: boolean;
    };
}

interface BatchComparisonResult {
    duplicates: ProcessedMeeting[];
    unique: ProcessedMeeting[];
}

export class MeetingComparisonService {
    private static instance: MeetingComparisonService;
    private readonly DELAY_MS = 15000; // Increased to 15 seconds
    private readonly BATCH_SIZE = 3;   // Reduced batch size to 3
    private storage: AIAgentPostedMeetingsStorage;

    private constructor() {
        this.storage = new AIAgentPostedMeetingsStorage();
    }

    public static getInstance(): MeetingComparisonService {
        if (!MeetingComparisonService.instance) {
            MeetingComparisonService.instance = new MeetingComparisonService();
        }
        return MeetingComparisonService.instance;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private formatMeetingForComparison(meeting: ProcessedMeeting) {
        try {
            // Find the user's attendance record if available
            let userDuration = 0;
            if (meeting.attendance?.records && meeting.userId) {
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === meeting.userId.toLowerCase()
                );
                
                if (userRecord) {
                    userDuration = userRecord.duration;
                }
            }
            
            return {
                id: meeting.id,
                subject: meeting.subject,
                startTime: meeting.start?.dateTime || '',
                endTime: meeting.end?.dateTime || '',
                actualDuration: userDuration, // Use the user's actual duration
                description: meeting.bodyPreview || '',
                attendees: meeting.attendees?.map(a => a.email) || []
            };
        } catch (error) {
            console.error('Error formatting meeting for comparison:', error);
            return null;
        }
    }

    private simpleCompare(meeting1: ProcessedMeeting, meeting2: ProcessedMeeting): boolean {
        try {
            // Safely extract dates and handle potential undefined values
            const meeting1Date = meeting1?.start?.dateTime?.split('T')[0] || '';
            const meeting2Date = meeting2?.start?.dateTime?.split('T')[0] || '';
            const meeting1Time = meeting1?.start?.dateTime?.split('T')[1] || '';
            const meeting2Time = meeting2?.start?.dateTime?.split('T')[1] || '';
            
            if (!meeting1Date || !meeting2Date) {
                return false;
            }

            // If meeting IDs match exactly, check if they're the same instance
            if (meeting1.id === meeting2.id) {
                // For same ID, they must be on the same date and have similar duration to be considered duplicate
                const sameDate = meeting1Date === meeting2Date;
                
                // Get user durations
                let duration1 = 0;
                if (meeting1?.attendance?.records && meeting1.userId) {
                    const userRecord = meeting1.attendance.records.find(record => 
                        record.email.toLowerCase() === meeting1.userId.toLowerCase()
                    );
                    duration1 = userRecord?.duration || 0;
                }

                let duration2 = 0;
                if (meeting2?.attendance?.records && meeting2.userId) {
                    const userRecord = meeting2.attendance.records.find(record => 
                        record.email.toLowerCase() === meeting2.userId.toLowerCase()
                    );
                    duration2 = userRecord?.duration || 0;
                }

                // Check if durations are similar (within 30 seconds)
                const durationDiff = Math.abs(duration1 - duration2);
                const similarDuration = durationDiff <= 30;

                // For recurring meetings, they must match both date and duration to be considered the same instance
                return sameDate && similarDuration;
            }

            // For different IDs, check if they might be the same meeting recorded differently
            // This helps catch cases where the same meeting might have slightly different IDs
            if (meeting1.subject === meeting2.subject && meeting1Date === meeting2Date) {
                // If subjects and dates match, check time proximity
                const time1 = new Date(`${meeting1Date}T${meeting1Time}`).getTime();
                const time2 = new Date(`${meeting2Date}T${meeting2Time}`).getTime();
                const timeProximity = Math.abs(time1 - time2) <= 5 * 60 * 1000; // 5 minutes

                // Get user durations for comparison
                let duration1 = 0;
                if (meeting1?.attendance?.records && meeting1.userId) {
                    const userRecord = meeting1.attendance.records.find(record => 
                        record.email.toLowerCase() === meeting1.userId.toLowerCase()
                    );
                    duration1 = userRecord?.duration || 0;
                }

                let duration2 = 0;
                if (meeting2?.attendance?.records && meeting2.userId) {
                    const userRecord = meeting2.attendance.records.find(record => 
                        record.email.toLowerCase() === meeting2.userId.toLowerCase()
                    );
                    duration2 = userRecord?.duration || 0;
                }

                // Check if durations are similar (within 30 seconds)
                const durationDiff = Math.abs(duration1 - duration2);
                const similarDuration = durationDiff <= 30;

                // Consider them the same meeting if they have similar timing and duration
                return timeProximity && similarDuration;
            }

            return false;
        } catch (error) {
            console.error('Error in simpleCompare:', error);
            return false;
        }
    }

    private async batchCompare(newMeetings: ProcessedMeeting[], postedMeetings: ProcessedMeeting[]): Promise<BatchComparisonResult> {
        try {
            // Load posted meetings storage to check for time entries
            await this.storage.loadData();

            console.log(`
╔══════════════════════════════════════════════════════════╗
║ 🔄 AI COMPARISON: Starting comparative analysis         ║
║ 📊 New meetings: ${newMeetings.length} | Posted: ${postedMeetings.length}  ║
╚══════════════════════════════════════════════════════════╝`);

            // First try simple comparison
            const simpleResult: BatchComparisonResult = {
                duplicates: [],
                unique: []
            };

            // Check each new meeting against posted meetings using simple comparison first
            for (const newMeeting of newMeetings) {
                let isDuplicate = false;
                
                for (const postedMeeting of postedMeetings) {
                    // Check if meeting is similar and has a time entry
                    if (this.simpleCompare(newMeeting, postedMeeting)) {
                        // Get user duration if available
                        let userDuration = 0;
                        if (newMeeting?.attendance?.records && newMeeting.userId) {
                            const userRecord = newMeeting.attendance.records.find(record => 
                                record.email.toLowerCase() === newMeeting.userId.toLowerCase()
                            );
                            if (userRecord) {
                                userDuration = userRecord.duration;
                            }
                        }
                        
                        // Get report ID if available
                        const reportId = newMeeting.attendance?.reportId;
                        
                        // Pass both duration, start time and report ID to isPosted
                        const hasTimeEntry = await this.storage.isPosted(
                            postedMeeting.userId, 
                            postedMeeting.id, 
                            userDuration,
                            newMeeting.start?.dateTime, // Pass the dateTime string, not the entire object
                            reportId // Pass the report ID
                        );
                        
                        if (hasTimeEntry) {
                            simpleResult.duplicates.push(newMeeting);
                            isDuplicate = true;
                            
                            const truncatedSubject = newMeeting.subject 
                                ? `"${newMeeting.subject.substring(0, 30)}${newMeeting.subject.length > 30 ? '...' : ''}"`
                                : 'Untitled meeting';
                            console.log(`🔄 Found duplicate: ${truncatedSubject} [${newMeeting.id}] (simple comparison)`);
                            
                            break;
                        }
                    }
                }

                if (!isDuplicate) {
                    simpleResult.unique.push(newMeeting);
                }
            }

            console.log(`
╔════════════════════════════════════════─────┐
│ 🔍 SIMPLE COMPARISON RESULTS:               ║
│    ✓ Duplicates found: ${simpleResult.duplicates.length}                   ║
│    ✓ Unique meetings: ${simpleResult.unique.length}                     ║
╚════════════════════════════════════════─────┘`);

            // If we have meetings that didn't match with simple comparison,
            // use OpenAI for more complex comparison
            if (simpleResult.unique.length > 0) {
                console.log(`📡 Starting AI-based deep comparison for ${simpleResult.unique.length} meetings...`);
                
                const formattedNewMeetings = simpleResult.unique
                    .map(m => this.formatMeetingForComparison(m))
                    .filter(m => m !== null);
                const formattedPostedMeetings = postedMeetings
                    .map(m => this.formatMeetingForComparison(m))
                    .filter(m => m !== null);

                const prompt = `
                Compare these sets of meetings and identify which new meetings are duplicates of any posted meetings.
                Pay special attention to meeting titles, dates, and actual durations.

                New Meetings:
                ${JSON.stringify(formattedNewMeetings, null, 2)}

                Posted Meetings:
                ${JSON.stringify(formattedPostedMeetings, null, 2)}

                Return a JSON object with two arrays:
                {
                    "duplicateIds": ["id1", "id2"],  // IDs of new meetings that are duplicates
                    "uniqueIds": ["id3", "id4"]      // IDs of new meetings that are unique
                }
                `;

                console.log(`🧠 Sending comparison request to AI service...`);
                const startTime = Date.now();

                const response = await openAIClient.sendRequest(prompt, {
                    // temperature removed for GPT-5 compatibility (only supports default value 1)
                    maxTokens: 3000  // Increased for GPT-5 reasoning tokens + response content
                });
                
                const processingTime = Date.now() - startTime;
                console.log(`✅ AI comparison completed in ${(processingTime/1000).toFixed(2)}s`);

                // Parse the response
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    
                    // Log AI results
                    console.log(`
╔═════════════════════ AI COMPARISON RESULTS ═════════════════════╗
║ 🧠 ANALYSIS COMPLETE                                            ║
║ 📊 Duplicates Found: ${result.duplicateIds.length}              ║
║ 🆕 Unique Meetings: ${result.uniqueIds.length}                  ║
║ ✨ Confidence Score: ${(result.confidence || 0).toFixed(2)}     ║
╚═══════════════════════════════════════════════════════════════╝`);
                    
                    // Update the results based on AI analysis
                    const aiDuplicates = simpleResult.unique.filter(m => result.duplicateIds.includes(m.id));
                    const aiUnique = simpleResult.unique.filter(m => result.uniqueIds.includes(m.id));

                    return {
                        duplicates: [...simpleResult.duplicates, ...aiDuplicates],
                        unique: aiUnique
                    };
                } else {
                    console.warn(`
┌─────────────────── WARNING ───────────────────┐
│ ⚠️ AI Response Format Invalid                 │
│ 📝 Falling back to simple comparison          │
└───────────────────────────────────────────────┘`);
                }
            }

            return simpleResult;
        } catch (error) {
            console.error(`
┌─────────────────── ERROR DETAILS ───────────────────┐
│ ❌ Batch comparison failed                          │
│ 🔍 Error: ${error instanceof Error ? error.message : 'Unknown error'} │
│ ℹ️ Falling back to simple comparison                │
└─────────────────────────────────────────────────────┘`);
            // If AI comparison fails, return simple comparison results
            return {
                duplicates: [],
                unique: newMeetings
            };
        }
    }

    public async filterNewMeetings(meetings: ProcessedMeeting[]): Promise<ProcessedMeeting[]> {
        await this.storage.loadData();
        
        // First, deduplicate meetings by userId + reportId to prevent processing the same report multiple times
        const uniqueInputMeetings = meetings.reduce((acc, meeting) => {
            // For meetings with multiple reports, we need to check each report
            const allValidReports = meeting.attendance?.allValidReports || [];
            
            if (allValidReports.length > 0) {
                // This meeting has multiple reports - check if we've already processed any of these reports for this user
                const hasNewReports = allValidReports.some(report => {
                    const reportKey = `${meeting.userId}_${report.selectedReportId}`;
                    return !acc.some(existingMeeting => {
                        const existingReports = existingMeeting.attendance?.allValidReports || [];
                        return existingReports.some(existingReport => 
                            `${existingMeeting.userId}_${existingReport.selectedReportId}` === reportKey
                        );
                    });
                });
                
                if (hasNewReports) {
                    acc.push(meeting);
                } else {
                    console.log(`🔄 INPUT DEDUP: Skipping meeting "${meeting.subject}" [${meeting.id}] - all reports already processed for user ${meeting.userId}`);
                }
            } else {
                // Single report meeting - use original reportId
                const reportId = meeting.attendance?.reportId;
                const reportKey = `${meeting.userId}_${reportId}`;
                
                const existingMeeting = acc.find(m => {
                    const existingReportId = m.attendance?.reportId;
                    return `${m.userId}_${existingReportId}` === reportKey;
                });
                
                if (!existingMeeting) {
                    acc.push(meeting);
                } else {
                    console.log(`🔄 INPUT DEDUP: Skipping duplicate meeting "${meeting.subject}" [${meeting.id}] - reportId ${reportId} already processed for user ${meeting.userId}`);
                }
            }
            return acc;
        }, [] as ProcessedMeeting[]);

        console.log(`
╔══════════════════════════════════════════════════════════╗
║ 🔍 MEETING FILTER STARTING                                ║
║ 📊 Input meetings: ${meetings.length} | After dedup: ${uniqueInputMeetings.length}                    ║
║ 🔄 Batch size: 3 | Delay: 15s                        ║
╚══════════════════════════════════════════════════════════╝`);

        const uniqueMeetings: ProcessedMeeting[] = [];
        const batchSize = 3;
        let duplicatesCount = 0;

        // Process meetings in batches
        for (let i = 0; i < uniqueInputMeetings.length; i += batchSize) {
            const batch = uniqueInputMeetings.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(uniqueInputMeetings.length / batchSize);

            console.log(`
┌─────────────────────────────────────────────────┐
│ 📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} meetings) ║
└─────────────────────────────────────────────────┘`);

            const batchResults = await Promise.all(
                batch.map(async (meeting) => {
                    try {
                        // For meetings with multiple reports (recurring or user rejoining), create separate instances
                        const allValidReports = meeting.attendance?.allValidReports || [];
                        
                        // DEBUG: Add detailed logging
                        console.log(`🔧 DEBUG: Checking meeting "${meeting.subject}"`);
                        console.log(`🔧 DEBUG: meeting.attendance exists: ${!!meeting.attendance}`);
                        console.log(`🔧 DEBUG: allValidReports length: ${allValidReports.length}`);
                        console.log(`🔧 DEBUG: allValidReports:`, allValidReports);
                        console.log(`🔧 DEBUG: meeting.attendance.reportId: ${meeting.attendance?.reportId}`);
                        
                        if (allValidReports && allValidReports.length > 1) {
                            console.log(`🔄 ENTERING MULTIPLE REPORTS BRANCH for "${meeting.subject}"`);
                            // Multiple reports - create separate instances for each unposted report
                            const newInstances: ProcessedMeeting[] = [];
                            
                            for (const reportSelection of allValidReports) {
                                const reportId = reportSelection.selectedReportId;
                                
                                // First check if the user actually attended this specific report session
                                const userAttendedThisReport = await this.checkUserAttendanceForReport(
                                    meeting, 
                                    reportId, 
                                    meeting.userId
                                );
                                
                                if (!userAttendedThisReport) {
                                    console.log(`⏭️ User ${meeting.userId} did not attend report ${reportId} - skipping instance creation`);
                                    continue;
                                }
                                
                                // Check if this specific report has already been posted for this user
                                const isPosted = await this.storage.isPosted(
                                    meeting.userId,
                                    meeting.id,
                                    0, // duration not needed for report ID check
                                    '', // dateTime not needed for report ID check
                                    reportId
                                );
                                
                                if (!isPosted) {
                                    // Create attendance records specific to this report with user's actual attendance
                                    const userSpecificDuration = await this.getUserDurationForReport(
                                        meeting,
                                        reportId,
                                        meeting.userId
                                    );
                                    
                                    const specificAttendanceRecords = [{
                                        name: meeting.userId.split('@')[0], // Extract name from email
                                        email: meeting.userId,
                                        duration: userSpecificDuration,
                                        role: 'Presenter', // Default role
                                        attendanceIntervals: []
                                    }];
                                    
                                    // Create a new meeting instance for this specific report with deep cloning
                                    const reportInstance: ProcessedMeeting = {
                                        ...meeting,
                                        // Create a unique ID for this instance by appending report ID
                                        id: `${meeting.id}-${reportId.substring(0, 8)}`,
                                        attendance: {
                                            records: specificAttendanceRecords,
                                            summary: {
                                                totalDuration: userSpecificDuration,
                                                averageDuration: userSpecificDuration,
                                                totalParticipants: 1 // Just this user
                                            },
                                            reportId: reportId,
                                            // Clear allValidReports to avoid infinite recursion
                                            allValidReports: undefined
                                        }
                                    };
                                    
                                    newInstances.push(reportInstance);
                                    console.log(`✅ Report ${reportId} not posted - creating instance with duration ${userSpecificDuration}s`);
                                    console.log(`🔧 DEBUG: Created instance with reportId = ${reportInstance.attendance?.reportId}, instanceId = ${reportInstance.id}`);
                                } else {
                                    console.log(`⏭️ Duplicate: "${meeting.subject}" already posted with report ID ${reportId}`);
                                    duplicatesCount++;
                                }
                            }
                            
                            if (newInstances.length > 0) {
                                console.log(`
╔════════════════════════════════════════════════════════╗
║ 🔄 MEETING SPLIT INTO ${newInstances.length} INSTANCES (MULTIPLE SESSIONS) ║
║ 📝 Meeting: "${meeting.subject}"                       ║
║ 🆔 Original ID: ${meeting.id.substring(0, 20)}...     ║
╚════════════════════════════════════════════════════════╝`);
                            }
                            
                            return newInstances;
                        } else {
                            // Single report or no reports - use existing logic
                            const reportId = meeting.attendance?.reportId;
                            
                            // Check if this meeting has already been posted using report ID if available
                            const isPosted = await this.storage.isPosted(
                                meeting.userId,
                                meeting.id,
                                0,
                                '',
                                reportId
                            );
                            
                            if (!isPosted) {
                                console.log(`✅ Unique: "${meeting.subject}" [${meeting.id.substring(0, 15)}...]${reportId ? ` with report ID ${reportId}` : ''}`);
                                return [meeting];
                            } else {
                                console.log(`⏭️ Duplicate: "${meeting.subject}" already posted${reportId ? ` with report ID ${reportId}` : ''}`);
                                duplicatesCount++;
                                return [];
                            }
                        }
                    } catch (error) {
                        console.error(`Error checking meeting ${meeting.id}:`, error);
                        // In case of error, include the meeting to avoid losing it
                        return [meeting];
                    }
                })
            );

            // Flatten the results and add to unique meetings
            const batchUnique = batchResults.flat();
            const batchDuplicates = batch.length - batchUnique.length;
            duplicatesCount += batchDuplicates;
            
            uniqueMeetings.push(...batchUnique);

            console.log(`
┌─────────────────────────────────────────────────┐
│ ✓ Batch ${batchNumber}/${totalBatches} completed                      ║
│ 📊 Total: ${batch.length} | Unique: ${batchUnique.length} | Duplicates: ${batchDuplicates}   ║
└─────────────────────────────────────────────────┘`);

            // Add delay between batches if not the last batch
            if (i + batchSize < uniqueInputMeetings.length) {
                await this.delay(this.DELAY_MS);
            }
        }

        console.log(`
╔══════════════════════════════════════════════════════════╗
║ 🏁 MEETING FILTER COMPLETED                               ║
║ 📊 Processed: ${uniqueInputMeetings.length} | Duplicates: ${duplicatesCount} | Unique: ${uniqueMeetings.length}     ║
║ 📈 Duplication rate: ${uniqueInputMeetings.length > 0 ? Math.round((duplicatesCount / uniqueInputMeetings.length) * 100) : 0}%                                   ║
╚══════════════════════════════════════════════════════════╝`);

        return uniqueMeetings;
    }

    /**
     * Check if a user actually attended a specific attendance report session
     */
    private async checkUserAttendanceForReport(
        meeting: ProcessedMeeting, 
        reportId: string, 
        userId: string
    ): Promise<boolean> {
        try {
            console.log(`🔍 Checking if user ${userId} attended report ${reportId}`);
            
            // If no online meeting info, we can't verify attendance
            if (!meeting.onlineMeeting?.joinUrl) {
                console.log(`❌ No join URL for meeting ${meeting.subject}`);
                return false;
            }

            const userDuration = await this.getUserDurationForReport(meeting, reportId, userId);
            const attended = userDuration > 0;
            
            if (attended) {
                console.log(`✅ User ${userId} attended report ${reportId} for ${userDuration} seconds`);
            } else {
                console.log(`❌ User ${userId} did not attend report ${reportId}`);
            }
            
            return attended;
        } catch (error) {
            console.error(`Error checking user attendance for report ${reportId}:`, error);
            return false;
        }
    }

    /**
     * Get the user's actual attendance duration for a specific report session
     */
    private async getUserDurationForReport(
        meeting: ProcessedMeeting, 
        reportId: string, 
        userId: string
    ): Promise<number> {
        try {
            console.log(`🔍 Getting duration for user ${userId} in report ${reportId}`);
            
            // First, check if we have attendance data with allValidReports metadata
            const attendance = meeting.attendance;
            if (!attendance || !attendance.allValidReports) {
                console.log(`❌ No attendance metadata for meeting ${meeting.subject}`);
                return 0;
            }

            // Find the specific report in allValidReports
            const targetReport = attendance.allValidReports.find(
                report => report.selectedReportId === reportId
            );
            
            if (!targetReport) {
                console.log(`❌ Report ${reportId} not found in valid reports`);
                return 0;
            }

            // Check if this report has attendanceRecords in the metadata
            if (targetReport.attendanceRecords && targetReport.attendanceRecords.length > 0) {
                const userRecord = targetReport.attendanceRecords.find((record: any) => 
                    record.email?.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord && userRecord.duration > 0) {
                    console.log(`✅ Found user duration in report metadata: ${userRecord.duration} seconds`);
                    return userRecord.duration;
                } else {
                    console.log(`❌ User not found in report ${reportId} attendance records`);
                    return 0;
                }
            }

            // Fallback: If no attendanceRecords in metadata, check if this is the main report
            const mainReportId = attendance.reportId;
            
            if (mainReportId === reportId) {
                // This is the main report, so we can use the existing attendance records
                const userRecord = attendance.records.find(record => 
                    record.email?.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord && userRecord.duration > 0) {
                    console.log(`✅ Found user duration in main report: ${userRecord.duration} seconds`);
                    return userRecord.duration;
                } else {
                    console.log(`❌ User not found in main report attendance records`);
                    return 0;
                }
            } else {
                // This is a different report - fetch the actual attendance records
                console.log(`🌐 Report ${reportId} is different from main report ${mainReportId} - fetching actual attendance`);
                
                try {
                    const actualDuration = await this.fetchUserDurationForSpecificReport(
                        meeting, 
                        reportId, 
                        userId
                    );
                    
                    if (actualDuration > 0) {
                        console.log(`✅ Fetched actual user duration for report ${reportId}: ${actualDuration} seconds`);
                        return actualDuration;
                    } else {
                        console.log(`❌ User did not attend report ${reportId} (duration: 0)`);
                        return 0;
                    }
                } catch (fetchError) {
                    console.error(`Failed to fetch attendance for report ${reportId}:`, fetchError);
                    // If we can't fetch, but we know the report exists, assume they attended
                    console.log(`⚠️ Assuming user attended report ${reportId} (fetch failed)`);
                    return 1; // 1 second to indicate attendance
                }
            }
        } catch (error) {
            console.error(`Error getting user duration for report ${reportId}:`, error);
            return 0;
        }
    }

    /**
     * Fetch user attendance duration for a specific report by calling Microsoft Graph API
     */
    private async fetchUserDurationForSpecificReport(
        meeting: ProcessedMeeting, 
        reportId: string, 
        userId: string
    ): Promise<number> {
        try {
            console.log(`📡 Fetching actual attendance for user ${userId} in report ${reportId}`);
            
            // Get Graph token
            const accessToken = await this.getGraphToken();
            
            // Extract meeting info from join URL
            if (!meeting.onlineMeeting?.joinUrl) {
                console.log(`❌ No join URL available for meeting ${meeting.subject}`);
                return 0;
            }
            
            const { meetingId, organizerId } = this.extractMeetingInfo(meeting.onlineMeeting.joinUrl);
            
            if (!meetingId || !organizerId) {
                console.log(`❌ Could not extract meeting info from join URL`);
                return 0;
            }
            
            // Get user info to get their Graph ID
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
                console.log(`❌ Failed to get user info for ${userId}`);
                return 0;
            }
            
            const userData = await userResponse.json();
            const targetUserId = userData.id;
            
            // Format the meeting ID for API call
            const formattedString = `1*${organizerId}*0**${meetingId}`;
            const base64MeetingId = Buffer.from(formattedString).toString('base64');
            
            // Fetch attendance records for this specific report
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
                console.log(`❌ Failed to fetch attendance records for report ${reportId}: ${recordsResponse.status}`);
                return 0;
            }
            
            const recordsData = await recordsResponse.json();
            const records = recordsData.value || [];
            
            console.log(`📊 Fetched ${records.length} attendance records for report ${reportId}`);
            
            // Find the current user's record
            const userRecord = records.find((record: any) => 
                record.emailAddress?.toLowerCase() === userId.toLowerCase()
            );
            
            if (userRecord && userRecord.totalAttendanceInSeconds > 0) {
                const duration = userRecord.totalAttendanceInSeconds;
                console.log(`✅ Found user ${userId} in report ${reportId} with duration: ${Math.floor(duration/60)}m ${duration%60}s`);
                return duration;
            } else {
                console.log(`❌ User ${userId} not found in report ${reportId} attendance records`);
                return 0;
            }
        } catch (error) {
            console.error(`❌ Error fetching attendance for report ${reportId}:`, error);
            return 0;
        }
    }

    /**
     * Get Graph API access token
     */
    private async getGraphToken(): Promise<string> {
        const tenantId = process.env.AZURE_AD_APP_TENANT_ID;
        const clientId = process.env.AZURE_AD_APP_CLIENT_ID;
        const clientSecret = process.env.AZURE_AD_APP_CLIENT_SECRET;
        
        if (!tenantId || !clientId || !clientSecret) {
            throw new Error('Missing Microsoft Graph API configuration');
        }
        
        const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default'
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            body: params,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get access token: ${response.status}`);
        }

        const data = await response.json();
        return data.access_token;
    }

    /**
     * Extract meeting ID and organizer ID from Teams join URL
     */
    private extractMeetingInfo(joinUrl: string): { meetingId: string | undefined; organizerId: string | undefined } {
        try {
            const decodedUrl = decodeURIComponent(joinUrl);
            const meetingMatch = decodedUrl.match(/19:meeting_([^@]+)@thread\.v2/);
            const organizerMatch = decodedUrl.match(/"Oid":"([^"]+)"/);
            
            const meetingId = meetingMatch ? `19:meeting_${meetingMatch[1]}@thread.v2` : undefined;
            const organizerId = organizerMatch ? organizerMatch[1] : undefined;
            
            return { meetingId, organizerId };
        } catch (error) {
            console.error('Error extracting meeting info:', error);
            return { meetingId: undefined, organizerId: undefined };
        }
    }
}

export const meetingComparisonService = MeetingComparisonService.getInstance(); 