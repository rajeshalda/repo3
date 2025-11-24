import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { IntervalsAPI } from '@/lib/intervals-api';
import { database } from '@/lib/database';
import { PostedMeetingsStorage } from '@/lib/posted-meetings-storage';
import { reviewService } from '@/ai-agent/services/review/review-service';
import { AIAgentPostedMeetingsStorage } from '@/ai-agent/services/storage/posted-meetings';
import { StorageManager } from '@/ai-agent/data/storage/manager';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get API key from SQLite database
        console.log('Getting API key for user:', session.user.email);
        const user = database.getUserByEmail(session.user.email);
        const apiKey = user?.intervals_api_key;
        console.log('API key found:', apiKey ? 'Yes' : 'No');

        if (!apiKey) {
            return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
        }

        const payload = await request.json();
        const { 
            taskId, date, time, description, workType, billable, 
            meetingId, subject, startTime, confidence, isManualPost,
            attendanceRecords, taskTitle 
        } = payload;

        console.log('Received time entry request:', {
            taskId,
            date,
            time: time ? `${time} seconds (${(time / 3600).toFixed(2)} hours)` : 'not provided',
            description,
            workType,
            billable,
            meetingId,
            subject,
            confidence,
            isManualPost,
            taskTitle,
            attendanceRecords: attendanceRecords ? 'provided' : 'not provided'
        });

        // Log the actual meetingId received
        console.log('Actual meetingId received:', meetingId);
        
        // Check if it has the Microsoft Graph ID format (long string with equals signs at the end)
        const isGraphIdFormat = typeof meetingId === 'string' && 
                               meetingId.startsWith('AAMkA') && 
                               meetingId.includes('=');
        
        console.log('Is meetingId in Microsoft Graph format:', isGraphIdFormat);

        // We ONLY want to use Graph ID format from now on
        // If the payload already contains a Graph ID, use it
        // Otherwise check if we can extract it from the meetingInfo
        let graphId = isGraphIdFormat ? meetingId : null;
        
        // If we don't have a Graph ID yet, check if it's in the payload.meetingInfo
        if (!graphId && payload.meetingInfo?.graphId) {
            if (typeof payload.meetingInfo.graphId === 'string' && 
                payload.meetingInfo.graphId.startsWith('AAMkA') && 
                payload.meetingInfo.graphId.includes('=')) {
                graphId = payload.meetingInfo.graphId;
                console.log('Found Graph ID in meetingInfo:', graphId);
            }
        }
        
        // For manual posts, we should ONLY use Graph ID format
        if (isManualPost && !graphId) {
            console.error('CRITICAL ERROR: Manual post without Graph ID is not allowed.');
            return NextResponse.json({ 
                error: 'A valid Microsoft Graph ID is required for manual meeting posts.' 
            }, { status: 400 });
        }
        
        // Use the Graph ID as the primary ID for storage
        const primaryMeetingId = graphId || meetingId;

        // Required fields validation
        if (!taskId) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        if (!time && !isManualPost) {
            return NextResponse.json({ error: 'Time duration is required' }, { status: 400 });
        }

        const intervalsApi = new IntervalsAPI(apiKey);
        
        try {
            // For manual posts, verify the user actually attended the meeting if attendance records are provided
            let timeToUse = time;
            let actualMeetingDate = date; // Default to the provided date
            
            if (attendanceRecords && Array.isArray(attendanceRecords)) {
                console.log('Checking user attendance in provided records');
                const userEmail = session.user?.email || '';
                const userRecord = attendanceRecords.find(record => 
                    record.email.toLowerCase() === userEmail.toLowerCase()
                );
                
                if (userRecord) {
                    console.log(`Found user's attendance record with duration: ${userRecord.duration} seconds`);
                    // Use the user's actual duration if available
                    timeToUse = userRecord.duration;
                    
                    // Extract the actual meeting date from attendance records for manual posts
                    if (isManualPost && userRecord.intervals && userRecord.intervals.length > 0) {
                        // Use the join date time from the first interval as the actual meeting date
                        const joinDateTime = userRecord.intervals[0].joinDateTime;
                        if (joinDateTime) {
                            // Convert UTC to IST first, then extract date portion
                            const joinUTC = new Date(joinDateTime);
                            const joinIST = new Date(joinUTC.getTime() + (5.5 * 60 * 60 * 1000));
                            actualMeetingDate = joinIST.toISOString().split('T')[0];
                            console.log(`📅 Using actual attendance date (IST): ${actualMeetingDate} (from joinDateTime: ${joinDateTime})`);
                        }
                    } else if (isManualPost && userRecord.rawRecord?.reportId) {
                        // Fallback: check if we have report metadata with meeting start time
                        console.log('⚠️ No attendance intervals found, using provided date as fallback');
                    }
                    
                    if (timeToUse <= 0) {
                        return NextResponse.json({ 
                            error: `You did not attend this meeting (duration: ${timeToUse} seconds). Cannot create time entry.` 
                        }, { status: 400 });
                    }
                } else if (!isManualPost) {
                    // Only block non-manual posts if user didn't attend
                    console.log(`User ${userEmail} did not attend this meeting`);
                    return NextResponse.json({ 
                        error: 'You did not attend this meeting. No attendance record found.' 
                    }, { status: 400 });
                }
            }
            
            // Validate time duration
            if (timeToUse <= 0 && !isManualPost) {
                return NextResponse.json({ 
                    error: 'Invalid time duration. Must be greater than 0 seconds.' 
                }, { status: 400 });
            }

            // Convert seconds to decimal hours for Intervals API
            // For meetings under 30 seconds, use minimum billable time of 0.01 hours
            let timeInHours: number;
            if (timeToUse < 30 && timeToUse > 0) {
                timeInHours = 0.01;
                console.log(`⚡ Meeting duration ${timeToUse}s is less than 30s. Using minimum billable time: 0.01 hours`);
            } else {
                timeInHours = timeToUse ? Number((timeToUse / 3600).toFixed(2)) : 0;
            }

            console.log('Time conversion:', {
                timeToUseSeconds: timeToUse,
                calculatedHours: timeInHours,
                rawCalculation: timeToUse / 3600
            });
            
            // For manual posts, allow user to specify time directly
            if (timeInHours <= 0 && !isManualPost) {
                return NextResponse.json({ 
                    error: 'Invalid time duration. Must be greater than 0 hours.' 
                }, { status: 400 });
            }
            
            // Get task details first
            const tasks = await intervalsApi.getTasks();
            const task = tasks.find((t: { id: string; title?: string; client?: string; project?: string }) => t.id === taskId);
            
            // Fetch specific task details directly to get accurate client/project info
            console.log('Fetching task directly by ID for billable determination:', taskId);
            const initialTaskDetails = await intervalsApi.getTaskById(taskId);
            
            // Use taskDetails if available, otherwise fall back to task
            const detailedTask = initialTaskDetails || task;
            
            // Simplified billable status determination:
            // 1. If client is "Internal" OR "Nathcorp" OR project contains "Internal" -> non-billable ('f')
            // 2. All other meetings -> billable ('t')
            const client = (detailedTask?.client || '').toLowerCase();
            const project = (detailedTask?.project || '').toLowerCase();
            
            const isInternal = 
                client === 'internal' || 
                client.includes('nathcorp') || 
                project.includes('internal');
            
            // Set billable status based on internal check
            const billableStr = isInternal ? 'f' : 't';
            
            console.log('Billable status determination:', {
                client: detailedTask?.client,
                project: detailedTask?.project,
                isInternal,
                billableStatus: billableStr,
                rule: 'Internal/Nathcorp = Non-billable, Everything else = Billable'
            });
            
            // For manual posts, check for duplicates BEFORE creating the time entry
            if (isManualPost) {
                console.log(`
╔════════════════════════ MANUAL POST DUPLICATE CHECK ════════════════════════╗
║ 🔍 Performing comprehensive duplicate detection for manual post             ║
║ 🆔 Meeting ID: ${primaryMeetingId ? primaryMeetingId.substring(0, 15) + '...' : 'N/A'} ║
║ 📅 Date: ${actualMeetingDate || 'N/A'}                                     ║
║ 📝 Description: ${description ? description.substring(0, 20) + '...' : 'N/A'}    ║
╚═══════════════════════════════════════════════════════════════════════════════╝`);
                
                // Before adding a new meeting, check if it's already in the AI Agent storage
                // to avoid duplicate entries
                const aiAgentStorage = new AIAgentPostedMeetingsStorage();
                await aiAgentStorage.loadData();
                
                // Create meeting ID in both possible formats to check
                const standardMeetingId = primaryMeetingId;
                
                console.log('Checking for duplicates with meetingId:', standardMeetingId);
                
                // Convert time in hours to seconds for duration-based duplicate check
                const durationSeconds = Math.round(timeInHours * 3600);
                console.log(`Manual post meeting duration: ${durationSeconds}s (${timeInHours} hours)`);
                
                // Get all posted meetings for this user
                const postedMeetings = await aiAgentStorage.getPostedMeetings(session.user.email);

                // Extract reportId from the request data
                let requestReportId = undefined;
                if (attendanceRecords && Array.isArray(attendanceRecords) && 
                    attendanceRecords.length > 0 && attendanceRecords[0].rawRecord?.reportId) {
                    requestReportId = attendanceRecords[0].rawRecord.reportId;
                } else if (payload.meetingInfo?.reportId) {
                    requestReportId = payload.meetingInfo.reportId;
                }

                // Check if this meeting ID exists for the same date (this catches rejoined meetings)
                const meetingExists = postedMeetings.some(m => {
                    // PRIORITY 1: If both meetings have reportIds, use ONLY reportId for duplicate detection
                    // This is the most reliable method for meetings with attendance tracking
                    if (requestReportId && m.reportId) {
                        const sameReportId = requestReportId === m.reportId;
                        if (sameReportId) {
                            console.log(`
┌─────────────────────── DUPLICATE DETECTED BY REPORT ID (MANUAL) ───────────────────────┐
│ 📊 Report ID: ${requestReportId}                                                      │
│ 📊 Stored Report ID: ${m.reportId}                                                    │
│ 🆔 Meeting ID: ${standardMeetingId.substring(0, 15)}...                              │
│ 📅 Request Date: ${actualMeetingDate}                                                │
│ 📅 Stored Date: ${m.timeEntry?.date}                                                 │
│ ⏱️ Duration: ${durationSeconds}s (${timeInHours} hours)                            │
│ ✅ Match Method: Report ID (most reliable)                                           │
└─────────────────────────────────────────────────────────────────────────────────────┘`);
                            return true;
                        }
                        // CRITICAL: If BOTH have reportIds but they DON'T match, it's NOT a duplicate
                        // Even if same meeting ID and date - different reports mean different attendance instances
                        console.log(`  ℹ️ Different reportIds (${requestReportId.substring(0, 8)}... vs ${m.reportId.substring(0, 8)}...) - NOT a duplicate`);
                        return false;
                    }

                    // PRIORITY 2: Only use fallback matching if NEITHER meeting has reportId
                    // If one has reportId and the other doesn't, they can't be compared reliably
                    if (requestReportId || m.reportId) {
                        // One has reportId, one doesn't - can't determine if duplicate
                        return false;
                    }

                    // PRIORITY 3: Fallback to meeting ID + date matching ONLY if no reportIds at all
                    const sameId = m.meetingId === standardMeetingId;
                    let sameDate = true;

                    // If date info is available, check if it's the same date
                    if (m.timeEntry?.date && actualMeetingDate) {
                        sameDate = m.timeEntry.date === actualMeetingDate;
                    }

                    const isDuplicate = sameId && sameDate;

                    if (isDuplicate) {
                        console.log(`
┌─────────────────────── DUPLICATE DETECTED BY MEETING ID (MANUAL) ───────────────────────┐
│ 🆔 Meeting ID: ${standardMeetingId.substring(0, 15)}...                              │
│ 📅 Date: ${actualMeetingDate}                                                        │
│ ⏱️ Duration: ${durationSeconds}s (${timeInHours} hours)                            │
│ ✅ Match Method: Meeting ID + Date (fallback - no reportIds)                        │
└─────────────────────────────────────────────────────────────────────────────────────┘`);
                    }

                    return isDuplicate;
                });
                
                // Additional check: For manual posts, also check by description for same date
                // BUT: Only if meetings don't have reportIds (fallback for legacy meetings)
                let descriptionExists = false;
                if (description && !requestReportId) {
                    // Only check description-based duplicates if no reportId available
                    // If reportId exists, we already checked above and that's more reliable
                    descriptionExists = postedMeetings.some(meeting => {
                        // Skip this check if stored meeting has reportId
                        // (we already checked reportId-based duplicates above)
                        if (meeting.reportId) {
                            return false;
                        }

                        // Same description
                        const sameDescription =
                            meeting.timeEntry?.description?.toLowerCase() === description.toLowerCase();

                        // Same date (if we have date information)
                        let sameDate = true;
                        if (actualMeetingDate && meeting.timeEntry?.date) {
                            sameDate = meeting.timeEntry.date === actualMeetingDate;
                        }

                        // Same duration (approximately)
                        let similarDuration = true;
                        if (durationSeconds > 0 && meeting.timeEntry?.time) {
                            const meetingTimeInHours = parseFloat(meeting.timeEntry.time.toString());
                            const meetingDurationSeconds = Math.round(meetingTimeInHours * 3600);
                            const durationDiff = Math.abs(meetingDurationSeconds - durationSeconds);
                            similarDuration = durationDiff < 60; // Within 1 minute
                        }

                        const isDuplicate = sameDescription && sameDate && similarDuration;

                        if (isDuplicate) {
                            console.log(`
┌─────────────────────── DUPLICATE BY DESCRIPTION (MANUAL) ───────────────────────┐
│ 📝 Description: ${description.substring(0, 25)}...                            │
│ 📅 Date: ${actualMeetingDate}                                                │
│ ℹ️ Note: Legacy duplicate check (no reportIds available)                     │
└───────────────────────────────────────────────────────────────────────────────┘`);
                        }

                        return isDuplicate;
                    });
                }
                
                if (meetingExists || descriptionExists) {
                    console.log(`
╔════════════════════════ DUPLICATE MEETING ════════════════════════╗
║ ⚠️ Meeting already exists in storage                             ║
║ 👤 User: ${session.user.email}                                   ║
║ 🆔 Meeting ID: ${standardMeetingId.substring(0, 15)}...          ║
${requestReportId ? `║ 📊 Report ID: ${requestReportId}                                     ║` : ''}
║ 🔎 Detected by: ${meetingExists ? 'Meeting ID + Date' : 'Description + Date'} ║
╚═══════════════════════════════════════════════════════════════════╝`);

                    // IMPORTANT: Remove ALL instances from review queue for duplicates
                    // This handles meetings with multiple attendance reports where one was already posted
                    // We need to remove all report instances for the same base meeting
                    try {
                        const storageManager = StorageManager.getInstance();
                        const reviewMeetings = await storageManager.getPendingReviews(session.user.email);

                        // Extract base meeting ID (without report suffix)
                        const baseMeetingId = standardMeetingId;

                        // Find the EXACT review instance for this meeting
                        // When a report ID is provided, we should only remove that specific instance
                        // When no report ID, remove all instances with the same base meeting ID
                        const relatedReviews = reviewMeetings.filter(rm => {
                            // If we have a report ID, match ONLY that specific report instance
                            if (requestReportId) {
                                return rm.reportId === requestReportId;
                            }

                            // If no report ID, match by base meeting ID
                            // This catches both exact match and instances with report suffix
                            return rm.id.startsWith(baseMeetingId);
                        });

                        if (relatedReviews.length > 0) {
                            console.log(`
╔════════════════════════ DUPLICATE - REMOVING FROM REVIEW ═════════════════════╗
║ 🎯 Found ${relatedReviews.length} related review instance(s) to remove                           ║
║ 🆔 Base Meeting ID: ${baseMeetingId.substring(0, 20)}...                     ║
║ 📊 Request Report ID: ${requestReportId || 'N/A'}                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝`);

                            // Remove all related reviews
                            for (const reviewMeeting of relatedReviews) {
                                console.log(`  Removing: ${reviewMeeting.id.substring(0, 30)}... (reportId: ${reviewMeeting.reportId || 'N/A'})`);

                                await storageManager.updateReviewStatus({
                                    meetingId: reviewMeeting.id,
                                    status: 'approved',
                                    decidedAt: new Date().toISOString(),
                                    decidedBy: session.user.email,
                                    feedback: `Duplicate - already posted`
                                });
                            }

                            console.log(`✅ Removed ${relatedReviews.length} duplicate review instance(s) from queue`);
                        } else {
                            console.log(`⚠️ No related review meetings found for ${baseMeetingId.substring(0, 20)}... (may already be removed)`);
                        }
                    } catch (error) {
                        console.error(`❌ Failed to remove duplicates from review queue:`, error);
                        // Don't fail the request if this fails
                    }

                    return NextResponse.json({
                        success: true,
                        message: 'Already posted. Skipping entry.'
                    });
                }
            }
            
            // Create time entry with hours
            let result;
            try {
                result = await intervalsApi.createTimeEntry({
                    taskId,
                    date: actualMeetingDate, // Use the actual meeting date (corrected for manual posts)
                    time: timeInHours > 0 ? timeInHours : 0.01, // Minimum time entry of 0.01 hours for manual posts
                    description: description || 'No description provided',
                    workType: workType || 'Meeting',
                    billable: billableStr
                });
            } catch (error) {
                // Check if this is a worktype validation error
                if (error instanceof Error && error.message) {
                    try {
                        const errorData = JSON.parse(error.message);
                        if (errorData.code === 'WORKTYPE_NOT_AVAILABLE') {
                            console.error('❌ WORKTYPE_NOT_AVAILABLE error:', errorData);
                            return NextResponse.json({
                                error: 'WORKTYPE_NOT_AVAILABLE',
                                taskId: errorData.taskId,
                                taskTitle: errorData.taskTitle,
                                projectName: errorData.projectName,
                                availableWorktypes: errorData.availableWorktypes
                            }, { status: 400 });
                        }
                    } catch (parseError) {
                        // Not a JSON error, rethrow original
                    }
                }
                // Rethrow if not a worktype error
                throw error;
            }

            // Fetch the specific task details directly by ID to ensure we have complete data
            console.log('Fetching task directly by ID:', taskId);
            const taskInfo = await intervalsApi.getTaskById(taskId);
            console.log('Fetching specific task by ID:', taskId);
            const taskDetails = taskInfo ? taskInfo : tasks.find((t: any) => t.id === taskId);
            console.log('Successfully fetched task by ID:', taskId);
            
            // Helper function to decode HTML entities (like &amp;)
            const decodeHtml = (html: string | null | undefined): string | null => {
                if (!html) return null;
                return html.replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&quot;/g, '"')
                          .replace(/&#039;/g, "'");
            };
            
            // Log full task details for debugging
            console.log('Task details:', taskDetails);

            // Store in the appropriate storage system based on the source
            // Use isManualPost to determine storage destination
            if (isManualPost) {
                // For manual posts, we'll use the same storage format as AI agent
                // Get task details to store the task name - prefer the passed taskTitle if available
                const taskName = taskTitle || taskDetails?.title || `Task ${taskId}`;
                
                // Ensure client, project, and module are extracted and decoded
                const client = decodeHtml(taskDetails?.client) || null;
                const project = decodeHtml(taskDetails?.project) || null;
                const module = decodeHtml(taskDetails?.module) || null;

                console.log('Task details for manual posting:', {
                    taskId,
                    taskName,
                    client,
                    project,
                    module
                });

                console.log('Storing manual meeting with meetingId:', primaryMeetingId);
                
                // Use the AIAgentPostedMeetingsStorage for both manual and AI agent posts
                // This ensures consistency in the storage format
                
                // Add additional client and project information for the task
                // This matches how AI agent stores data
                if (result.time) {
                    try {
                        // Get full task details from the taskInfo
                        result.time.client = client;
                        result.time.project = project;
                        result.time.module = module;
                        result.time.worktype = workType || 'India-Meeting';
                        result.time.taskTitle = taskName;
                        
                        // Convert time to string format to match AI agent format
                        if (typeof result.time.time === 'number') {
                            result.time.time = result.time.time.toFixed(2);
                        }
                    } catch (error) {
                        console.error('Error enriching time entry with client/project info:', error);
                        // Continue even if this fails
                    }
                }
                
                // Storage the meeting in AI Agent storage format
                const storageForManual = new AIAgentPostedMeetingsStorage();
                
                // Extract reportId from attendance records if available
                let reportId = undefined;
                
                if (attendanceRecords && Array.isArray(attendanceRecords) && 
                    attendanceRecords.length > 0 && attendanceRecords[0].rawRecord?.reportId) {
                    // If the rawRecord contains the reportId, use it
                    reportId = attendanceRecords[0].rawRecord.reportId;
                    console.log(`Found reportId in attendance records: ${reportId}`);
                } else if (payload.meetingInfo?.reportId) {
                    // If the meetingInfo directly contains reportId, use it
                    reportId = payload.meetingInfo.reportId;
                    console.log(`Found reportId in meetingInfo: ${reportId}`);
                }
                
                // Log whether we have a reportId or not for debugging
                if (reportId) {
                    console.log(`
╔════════════════════════ REPORT ID FOUND ═══════════════════════╗
║ 🧪 MANUAL POSTING: Found report ID for deduplication           ║ 
║ 📊 Report ID: ${reportId}                                     ║
╚═══════════════════════════════════════════════════════════════════╝`);
                } else {
                    console.log(`
╔════════════════════════ NO REPORT ID ═══════════════════════╗
║ ⚠️ MANUAL POSTING: No report ID available                    ║ 
║ ℹ️ Will use fallback deduplication with meetingId + userId   ║
╚═══════════════════════════════════════════════════════════════════╝`);
                }
                
                await storageForManual.addPostedMeeting({
                    meetingId: primaryMeetingId || '', // Use the primary ID (Graph ID if available)
                    userId: session.user.email,
                    timeEntry: result.time ? { 
                        ...result.time,
                        taskTitle: taskTitle || taskName  // Prefer passed taskTitle, then fall back to taskName
                    } : null,
                    rawResponse: result,
                    postedAt: convertToIST(actualMeetingDate), // Convert date to IST format
                    reportId: reportId // Add reportId if available
                });
                
                // IMPORTANT: Remove meeting from review queue for manual posts using reportId only
                // This was missing and causing the issue where manually posted meetings stayed in review
                try {
                    const storageManager = StorageManager.getInstance();
                    
                    if (reportId) {
                        // Find the review meeting by reportId (most reliable and unique)
                        const reviewMeetings = await storageManager.getPendingReviews(session.user.email);
                        const reviewMeeting = reviewMeetings.find(rm => rm.reportId === reportId);
                        
                        if (reviewMeeting) {
                            console.log(`
╔════════════════════════ MANUAL POST REVIEW REMOVAL ═══════════════════════╗
║ 🎯 REMOVING FROM REVIEW QUEUE (by reportId)                              ║
║ 📊 Report ID: ${reportId}                                               ║
║ 🆔 Meeting ID: ${reviewMeeting.id}                                       ║
║ 📝 Subject: ${reviewMeeting.subject}                                     ║
╚═══════════════════════════════════════════════════════════════════════════╝`);
                            
                            await storageManager.updateReviewStatus({
                                meetingId: reviewMeeting.id,
                                status: 'approved',
                                decidedAt: new Date().toISOString(),
                                decidedBy: session.user.email,
                                feedback: `Manual post: matched to task ${taskTitle || taskName}`
                            });
                            
                            console.log(`
┌─────────────────── MANUAL POST REVIEW STATUS ───────────────────┐
│ ✅ Meeting removed from review queue                            │
│ 🎯 Method: Report ID                                            │
│ 📊 Report ID: ${reportId}                                       │
│ 👤 User: ${session.user.email}                                 │
└─────────────────────────────────────────────────────────────────┘`);
                        } else {
                            console.log(`
┌─────────────────── MANUAL POST REVIEW STATUS ───────────────────┐
│ ⚠️ No review meeting found with reportId: ${reportId}           │
│ 🔍 This meeting may not be in the review queue                  │
└─────────────────────────────────────────────────────────────────┘`);
                        }
                    } else {
                        console.log(`
┌─────────────────── MANUAL POST REVIEW STATUS ───────────────────┐
│ ⚠️ No reportId provided - cannot remove from review queue       │
│ 🔍 Manual posts require reportId for review queue removal       │
└─────────────────────────────────────────────────────────────────┘`);
                    }
                } catch (error) {
                    console.error(`
┌─────────────────── MANUAL POST ERROR ───────────────────┐
│ ❌ Failed to remove meeting from review queue           │
│ 🔍 Error: ${error instanceof Error ? error.message : 'Unknown error'} │
└─────────────────────────────────────────────────────────┘`);
                    // Don't fail the request if this fails
                }
                
                // We'll no longer store in the legacy storage to avoid duplication
                // The AIAgentPostedMeetingsStorage is the primary storage now
                console.log('Meeting stored in AI Agent storage format only to prevent duplication');
            } else {
                // For AI agent posts, store only in AIAgentPostedMeetingsStorage
                const storageForAgent = new AIAgentPostedMeetingsStorage();
                
                // Get additional client and project information for the task
                // This is critical for displaying this information in the UI
                if (result.time) {
                    try {
                        // Ensure client, project, and module are extracted and decoded 
                        const client = decodeHtml(taskDetails?.client) || null;
                        const project = decodeHtml(taskDetails?.project) || null;
                        const module = decodeHtml(taskDetails?.module) || null;
                        
                        // Get full task details from the taskInfo
                        result.time.client = client;
                        result.time.project = project;
                        result.time.module = module;
                        result.time.taskTitle = taskTitle || taskDetails?.title || `Task ${taskId}`; // Prefer passed taskTitle
                        
                        // Convert time to string format to ensure consistency
                        if (typeof result.time.time === 'number') {
                            result.time.time = result.time.time.toFixed(2);
                        }
                        
                        console.log('Task details for AI agent posting:', {
                            taskId,
                            taskName: taskDetails?.title,
                            client,
                            project,
                            module
                        });
                    } catch (error) {
                        console.error('Error enriching time entry with client/project info:', error);
                        // Continue even if this fails
                    }
                }
                
                // Get the meeting from review to retrieve any reportId BEFORE creating the time entry
                let reportId = undefined;
                try {
                    const storageManager = StorageManager.getInstance();
                    const reviewMeeting = await storageManager.getMeetingForReview(primaryMeetingId || '', session.user.email);
                    
                    if (reviewMeeting && reviewMeeting.reportId) {
                        reportId = reviewMeeting.reportId;
                        console.log(`
╔════════════════════════ REPORT ID FROM REVIEW ═══════════════════════╗
║ 🧪 Found report ID in review meeting (PRE-CREATION)                  ║ 
║ 📊 Report ID: ${reportId}                                          ║
║ 🆔 Meeting ID: ${primaryMeetingId?.substring(0, 20)}...            ║
╚═══════════════════════════════════════════════════════════════════╝`);
                    }
                } catch (error) {
                    console.error('Error retrieving reportId from review meeting:', error);
                    // Continue even if this fails - we'll update it later
                }
                
                console.log(`
╔══════════════════════ TIME ENTRY OPERATION ══════════════════════╗
║ 📝 CREATING TIME ENTRY                                           ║
║ 🎯 Meeting ID: ${primaryMeetingId?.substring(0, 15) || 'N/A'}   ║
║ 👤 User: ${session.user.email}                                   ║
║ 📊 Task: ${taskTitle || taskDetails?.title || `Task ${taskId}`}  ║
${reportId ? `║ 📊 Report ID: ${reportId}                                          ║` : ''}
╚═════════════════════════════════════════════════════════════════╝`);

                await storageForAgent.addPostedMeeting({
                    meetingId: primaryMeetingId || '',
                    userId: session.user.email,
                    timeEntry: result.time ? { 
                        ...result.time,
                        taskTitle: taskTitle || taskDetails?.title || `Task ${taskId}`
                    } : null,
                    rawResponse: result,
                    postedAt: convertToIST(actualMeetingDate),
                    reportId: reportId // Include reportId if we found it in the review
                });

                console.log(`
┌─────────────────── STORAGE STATUS ───────────────────┐
│ ✅ Meeting stored in AI Agent storage                │
${reportId ? `│ 📊 Report ID: ${reportId}                                │` : ''}
└─────────────────────────────────────────────────────┘`);

                // Update review status - Remove the EXACT review instance that was posted
                try {
                    const storageManager = StorageManager.getInstance();
                    const reviewMeetings = await storageManager.getPendingReviews(session.user.email);

                    // Find the EXACT review instance for this meeting
                    // When a report ID is provided, we should only remove that specific instance
                    // When no report ID, remove all instances with the same base meeting ID
                    const baseMeetingId = primaryMeetingId || '';
                    const relatedReviews = reviewMeetings.filter(rm => {
                        // If we have a report ID, match ONLY that specific report instance
                        if (reportId) {
                            return rm.reportId === reportId;
                        }

                        // If no report ID, match by base meeting ID
                        // This catches both exact match and instances with report suffix
                        return rm.id.startsWith(baseMeetingId);
                    });

                    if (relatedReviews.length > 0) {
                        console.log(`
╔════════════════════════ REMOVING FROM REVIEW QUEUE ═══════════════════════╗
║ 🎯 Found ${relatedReviews.length} review instance(s) to remove after successful post         ║
║ 🆔 Base Meeting ID: ${baseMeetingId.substring(0, 20)}...                 ║
║ 📊 Posted Report ID: ${reportId || 'N/A'}                                ║
╚═══════════════════════════════════════════════════════════════════════════╝`);

                        // Remove all related reviews
                        for (const reviewMeeting of relatedReviews) {
                            console.log(`  Approving: ${reviewMeeting.id.substring(0, 30)}... (reportId: ${reviewMeeting.reportId || 'N/A'})`);

                            await storageManager.updateReviewStatus({
                                meetingId: reviewMeeting.id,
                                status: 'approved',
                                decidedAt: new Date().toISOString(),
                                decidedBy: session.user.email,
                                feedback: 'Meeting successfully posted to Intervals'
                            });
                        }

                        console.log(`
┌─────────────────── REVIEW STATUS ───────────────────┐
│ ✅ Removed ${relatedReviews.length} review instance(s) from queue       │
│ 🔑 Base ID: ${baseMeetingId.substring(0, 15)}... │
└─────────────────────────────────────────────────────┘`);
                    } else {
                        console.log(`⚠️ No review meetings found for ${baseMeetingId.substring(0, 20)}... (may not have been in review queue)`);
                    }
                } catch (error) {
                    console.error(`
┌─────────────────── ERROR DETAILS ───────────────────┐
│ ❌ Failed to update review status                   │
│ 🔍 Error: ${error instanceof Error ? error.message : 'Unknown error'}  │
└─────────────────────────────────────────────────────┘`);
                    // Don't fail the request if this fails
                }

                console.log(`
╔══════════════════════ OPERATION COMPLETE ══════════════════════╗
║ ✅ Time entry created successfully                             ║
║ ⏱️ Duration: ${result.time?.time || 0} hours                  ║
║ 📅 Date: ${result.time?.date || 'N/A'}                        ║
╚═════════════════════════════════════════════════════════════════╝`);
            }
            
            console.log('Successfully created time entry:', result);
            return NextResponse.json({
                success: true,
                message: `Successfully logged ${timeInHours} hours`,
                result
            });
        } catch (error) {
            console.error('Error from Intervals API:', error);
            return NextResponse.json({ 
                error: error instanceof Error ? error.message : 'Failed to create time entry in Intervals'
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Error in time entries endpoint:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Failed to process time entry request' 
        }, { status: 500 });
    }
}

// Helper method to convert a date string to IST format
function convertToIST(dateStr: string): string {
    // Return current UTC time as ISO string
    // The frontend formatDateIST function will handle the IST conversion
    return new Date().toISOString();
} 