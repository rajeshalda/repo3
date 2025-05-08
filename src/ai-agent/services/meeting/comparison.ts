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

    private constructor() {}

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
            
            if (!meeting1Date || !meeting2Date) {
                return false;
            }

            // If meeting IDs match (possibly a recurring meeting), but dates differ,
            // we should not consider them duplicate meetings
            if (meeting1.id === meeting2.id && meeting1Date !== meeting2Date) {
                return false;
            }

            // Get user duration if available
            let duration1 = 0;
            if (meeting1?.attendance?.records && meeting1.userId) {
                const userRecord = meeting1.attendance.records.find(record => 
                    record.email.toLowerCase() === meeting1.userId.toLowerCase()
                );
                if (userRecord) {
                    duration1 = userRecord.duration;
                }
            }

            let duration2 = 0;
            if (meeting2?.attendance?.records && meeting2.userId) {
                const userRecord = meeting2.attendance.records.find(record => 
                    record.email.toLowerCase() === meeting2.userId.toLowerCase()
                );
                if (userRecord) {
                    duration2 = userRecord.duration;
                }
            }

            // For meetings with same ID and date, consider them the same only 
            // if they have similar durations (within 10 seconds)
            const durationDiff = Math.abs(duration1 - duration2);
            const isSimilarDuration = durationDiff < 10; // 10 second threshold

            if (meeting1.id === meeting2.id && meeting1Date === meeting2Date && !isSimilarDuration) {
                console.log(`Meetings have same ID and date but different durations (diff: ${durationDiff}s), considered different meetings`);
            }

            return meeting1.id === meeting2.id && 
                   meeting1Date === meeting2Date && 
                   isSimilarDuration;
        } catch (error) {
            console.error('Error in simpleCompare:', error);
            return false;
        }
    }

    private async batchCompare(newMeetings: ProcessedMeeting[], postedMeetings: ProcessedMeeting[]): Promise<BatchComparisonResult> {
        try {
            // Load posted meetings storage to check for time entries
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.loadData();

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
                        
                        // Pass both duration and start time to isPosted to handle recurring meetings correctly
                        const hasTimeEntry = await storage.isPosted(
                            postedMeeting.userId, 
                            postedMeeting.id, 
                            userDuration,
                            newMeeting.start?.dateTime // Pass the dateTime string, not the entire object
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
        try {
            console.log(`
╔══════════════════════════════════════════════════════════╗
║ 🔍 MEETING FILTER STARTING                                ║
║ 📊 Total meetings to check: ${meetings.length}                           ║
║ 🔄 Batch size: ${this.BATCH_SIZE} | Delay: ${this.DELAY_MS/1000}s                        ║
╚══════════════════════════════════════════════════════════╝`);
            
            // Get posted meetings from the new storage
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.loadData();
            
            // Process meetings in smaller batches with longer delays
            const uniqueMeetings: ProcessedMeeting[] = [];
            
            for (let i = 0; i < meetings.length; i += this.BATCH_SIZE) {
                const batch = meetings.slice(i, i + this.BATCH_SIZE);
                const batchNumber = Math.floor(i/this.BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(meetings.length/this.BATCH_SIZE);
                
                console.log(`
┌─────────────────────────────────────────────────┐
│ 📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} meetings) ║
└─────────────────────────────────────────────────┘`);
                
                let batchDuplicates = 0;
                
                // Check each meeting in the batch
                for (const meeting of batch) {
                    const truncatedSubject = meeting.subject 
                        ? `"${meeting.subject.substring(0, 30)}${meeting.subject.length > 30 ? '...' : ''}"`
                        : 'Untitled meeting';
                        
                    // Get user's duration for this meeting
                    let userDuration = 0;
                    if (meeting.attendance?.records && meeting.userId) {
                        const userRecord = meeting.attendance.records.find(record => 
                            record.email.toLowerCase() === meeting.userId.toLowerCase()
                        );
                        
                        if (userRecord) {
                            userDuration = userRecord.duration;
                        }
                    }
                    
                    // Pass duration to isPosted to handle recurring meetings correctly
                    const isPosted = await storage.isPosted(
                        meeting.userId, 
                        meeting.id, 
                        userDuration,
                        meeting.start?.dateTime // Also pass the start time here
                    );
                    
                    if (!isPosted) {
                        uniqueMeetings.push(meeting);
                        console.log(`✅ Unique: ${truncatedSubject} [${meeting.id}]`);
                    } else {
                        batchDuplicates++;
                        console.log(`⏭️ Duplicate: ${truncatedSubject} [${meeting.id}]`);
                    }
                }

                // Log results for this batch
                console.log(`
┌─────────────────────────────────────────────────┐
│ ✓ Batch ${batchNumber}/${totalBatches} completed                      ║
│ 📊 Total: ${batch.length} | Unique: ${batch.length - batchDuplicates} | Duplicates: ${batchDuplicates}   ║
└─────────────────────────────────────────────────┘`);

                // Add longer delay between batches
                if (i + this.BATCH_SIZE < meetings.length) {
                    console.log(`⏱️ Waiting ${this.DELAY_MS/1000} seconds before next batch...`);
                    await this.delay(this.DELAY_MS);
                }
            }

            console.log(`
╔══════════════════════════════════════════════════════════╗
║ 🏁 MEETING FILTER COMPLETED                               ║
║ 📊 Total: ${meetings.length} | Duplicates: ${meetings.length - uniqueMeetings.length} | Unique: ${uniqueMeetings.length}     ║
║ 📈 Duplication rate: ${Math.round(((meetings.length - uniqueMeetings.length)/meetings.length)*100)}%                                   ║
╚══════════════════════════════════════════════════════════╝`);

            return uniqueMeetings;
        } catch (error) {
            console.error('❌ ERROR filtering new meetings:', error);
            throw error;
        }
    }
}

export const meetingComparisonService = MeetingComparisonService.getInstance(); 