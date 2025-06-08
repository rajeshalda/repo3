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
                    temperature: 0.3,
                    maxTokens: 1000
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
        
        console.log(`
╔══════════════════════════════════════════════════════════╗
║ 🔍 MEETING FILTER STARTING                                ║
║ 📊 Total meetings to check: ${meetings.length}                           ║
║ 🔄 Batch size: 3 | Delay: 15s                        ║
╚══════════════════════════════════════════════════════════╝`);

        const uniqueMeetings: ProcessedMeeting[] = [];
        const batchSize = 3;
        let duplicatesCount = 0;

        // Process meetings in batches
        for (let i = 0; i < meetings.length; i += batchSize) {
            const batch = meetings.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(meetings.length / batchSize);

            console.log(`
┌─────────────────────────────────────────────────┐
│ 📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} meetings) ║
└─────────────────────────────────────────────────┘`);

            const batchResults = await Promise.all(
                batch.map(async (meeting) => {
                    try {
                        // For meetings with multiple reports (recurring or user rejoining), create separate instances
                        const allValidReports = meeting.attendance?.allValidReports || [];
                        
                        if (allValidReports.length > 1) {
                            console.log(`🔄 Meeting "${meeting.subject}" has ${allValidReports.length} report instances (user rejoined multiple times)`);
                            
                            const newInstances: ProcessedMeeting[] = [];
                            
                            for (const reportSelection of allValidReports) {
                                const isPosted = await this.storage.isPosted(
                                    meeting.userId,
                                    meeting.id,
                                    0, // duration not needed for report ID check
                                    '', // dateTime not needed for report ID check
                                    reportSelection.selectedReportId
                                );
                                
                                if (!isPosted) {
                                    // Create attendance records specific to this report
                                    const specificAttendanceRecords = meeting.attendance?.records?.map(record => ({
                                        ...record,
                                        duration: reportSelection.metadata?.duration || record.duration,
                                        // Keep original attendance intervals since we don't have specific ones
                                        attendanceIntervals: record.attendanceIntervals
                                    })) || [];
                                    
                                    // Create a new meeting instance for this specific report with deep cloning
                                    const reportInstance: ProcessedMeeting = {
                                        ...meeting,
                                        // Create a unique ID for this instance by appending report ID
                                        id: `${meeting.id}-${reportSelection.selectedReportId.substring(0, 8)}`,
                                        attendance: {
                                            records: specificAttendanceRecords,
                                            summary: {
                                                totalDuration: reportSelection.metadata?.duration || 0,
                                                averageDuration: reportSelection.metadata?.duration || 0,
                                                totalParticipants: meeting.attendance?.summary?.totalParticipants || 1
                                            },
                                            reportId: reportSelection.selectedReportId,
                                            // Clear allValidReports to avoid infinite recursion
                                            allValidReports: undefined
                                        }
                                    };
                                    
                                    newInstances.push(reportInstance);
                                    console.log(`✅ Report ${reportSelection.selectedReportId} not posted - creating instance`);
                                    console.log(`🔧 DEBUG: Created instance with reportId = ${reportInstance.attendance?.reportId}, instanceId = ${reportInstance.id}`);
                                } else {
                                    console.log(`⏭️ Report ${reportSelection.selectedReportId} already posted - skipping`);
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
                            
                            const isPosted = await this.storage.isPosted(
                                meeting.userId,
                                meeting.id,
                                0,
                                '',
                                reportId
                            );
                            
                            if (!isPosted) {
                                console.log(`✅ Unique: "${meeting.subject}" [${meeting.id.substring(0, 15)}...]`);
                                return [meeting];
                            } else {
                                console.log(`⏭️ Duplicate: "${meeting.subject}" already posted`);
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
            if (i + batchSize < meetings.length) {
                await this.delay(this.DELAY_MS);
            }
        }

        console.log(`
╔══════════════════════════════════════════════════════════╗
║ 🏁 MEETING FILTER COMPLETED                               ║
║ 📊 Total: ${meetings.length} | Duplicates: ${duplicatesCount} | Unique: ${uniqueMeetings.length}     ║
║ 📈 Duplication rate: ${Math.round((duplicatesCount / meetings.length) * 100)}%                                   ║
╚══════════════════════════════════════════════════════════╝`);

        return uniqueMeetings;
    }
}

export const meetingComparisonService = MeetingComparisonService.getInstance(); 