import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { IntervalsAPI } from '@/lib/intervals-api';
import { UserStorage } from '@/lib/user-storage';
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

        // Initialize storage and load data
        const storage = new UserStorage();
        await storage.loadData();
        
        console.log('Getting API key for user:', session.user.email);
        const apiKey = await storage.getUserApiKey(session.user.email);
        console.log('API key found:', apiKey ? 'Yes' : 'No');

        if (!apiKey) {
            return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
        }

        const payload = await request.json();
        const { 
            taskId, date, time, description, workType, billable, 
            meetingId, subject, startTime, confidence, isManualPost,
            attendanceRecords 
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
            const timeInHours = timeToUse ? Number((timeToUse / 3600).toFixed(2)) : 0;
            
            // For manual posts, allow user to specify time directly
            if (timeInHours <= 0 && !isManualPost) {
                return NextResponse.json({ 
                    error: 'Invalid time duration. Must be greater than 0 hours.' 
                }, { status: 400 });
            }
            
            // Get task details first
            const tasks = await intervalsApi.getTasks();
            const task = tasks.find((t: { id: string; title?: string; client?: string; project?: string }) => t.id === taskId);
            
            // Determine billable status
            const isNathcorpClient = task?.client?.toLowerCase() === 'nathcorp';
            const billableStr = isNathcorpClient ? 'f' : (billable ? 't' : 'f');
            
            // Create time entry with hours
            const result = await intervalsApi.createTimeEntry({
                taskId,
                date,
                time: timeInHours > 0 ? timeInHours : 0.01, // Minimum time entry of 0.01 hours for manual posts
                description: description || 'No description provided',
                workType: workType || 'Meeting',
                billable: billableStr
            });

            // Store in the appropriate storage system based on the source
            // Use isManualPost to determine storage destination
            if (isManualPost) {
                // Before adding a new meeting, check if it's already in the AI Agent storage
                // to avoid duplicate entries
                const aiAgentStorage = new AIAgentPostedMeetingsStorage();
                await aiAgentStorage.loadData();
                
                // Create meeting ID in both possible formats to check
                const standardMeetingId = primaryMeetingId;
                const manualMeetingId = `${session.user.email.toLowerCase()}_${subject}_${startTime}`;
                
                console.log('Checking for duplicates with meetingIds:', {
                    standardMeetingId,
                    manualMeetingId
                });
                
                // Check if either ID exists in storage
                const meetingExists = await aiAgentStorage.isPosted(session.user.email, standardMeetingId) || 
                                     await aiAgentStorage.isPosted(session.user.email, manualMeetingId);
                
                if (meetingExists) {
                    console.log('Meeting already exists in AI Agent storage, skipping duplicate entry');
                    return NextResponse.json({ 
                        success: true, 
                        message: 'Meeting already posted. Skipping duplicate entry.'
                    });
                }
                
                // For manual posts, we'll use the same storage format as AI agent
                // Get task details to store the task name
                const taskDetails = tasks.find((t: { id: string; title?: string; client?: string; project?: string }) => t.id === taskId);
                const taskName = taskDetails?.title || `Task ${taskId}`;
                const client = taskDetails?.client || null;
                const project = taskDetails?.project || null;

                console.log('Task details for manual posting:', {
                    taskId,
                    taskName,
                    client,
                    project
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
                        result.time.module = taskDetails?.module || null;
                        result.time.worktype = workType || 'Meeting';
                    } catch (error) {
                        console.error('Error enriching time entry with client/project info:', error);
                        // Continue even if this fails
                    }
                }
                
                // Store the meeting in AI Agent storage format
                await aiAgentStorage.addPostedMeeting(
                    session.user.email,
                    {
                        meetingId: primaryMeetingId || '', // Use the primary ID (Graph ID if available)
                        userId: session.user.email,
                        timeEntry: result.time,
                        rawResponse: result,
                        postedAt: convertToIST(date) // Convert date to IST format
                    }
                );
                
                // NOTE: We still store in the legacy PostedMeetingsStorage for backward compatibility
                // But the primary storage is now AIAgentPostedMeetingsStorage
                const postedMeetingsStorage = new PostedMeetingsStorage();
                await postedMeetingsStorage.addPostedMeeting(
                    session.user.email,
                    {
                        subject: subject || 'No subject',
                        startTime: startTime || new Date().toISOString(),
                        taskId: taskId,
                        taskName: taskName,
                        client: client,
                        project: project,
                        meetingId: primaryMeetingId // Pass the Graph ID if available
                    },
                    (attendanceRecords || []).map((record: { email: string; name: string; duration: number }) => ({
                        ...record,
                        duration: record.duration // Keep as seconds for consistent storage
                    })),
                    apiKey
                );
                
                console.log('Meeting stored in BOTH storage formats (AI Agent format and legacy format)');
            } else {
                // For AI agent posts, store only in AIAgentPostedMeetingsStorage
                const aiAgentStorage = new AIAgentPostedMeetingsStorage();
                
                // Get additional client and project information for the task
                // This is critical for displaying this information in the UI
                if (result.time) {
                    try {
                        // Get full task details from the taskInfo
                        result.time.client = task?.client || null;
                        result.time.project = task?.project || null;
                        
                        console.log('Task details for AI agent posting:', {
                            taskId,
                            taskName: task?.title,
                            client: task?.client,
                            project: task?.project
                        });
                    } catch (error) {
                        console.error('Error enriching time entry with client/project info:', error);
                        // Continue even if this fails
                    }
                }
                
                console.log('AI Agent: Storing meeting with meetingId:', primaryMeetingId);
                
                await aiAgentStorage.addPostedMeeting(
                    session.user.email,
                    {
                        meetingId: primaryMeetingId || '',  // Use the Graph ID when available
                        userId: session.user.email,
                        timeEntry: result.time,
                        rawResponse: result,
                        postedAt: convertToIST(date) // Convert date to IST format
                    }
                );
                console.log('Meeting stored in AI Agent storage');
            }
            
            // Remove the meeting from reviews.json after successful posting
            try {
                const storageManager = StorageManager.getInstance();
                // Create a decision to mark the meeting as 'approved'
                await storageManager.updateReviewStatus({
                    meetingId: primaryMeetingId || '',
                    status: 'approved',
                    decidedAt: new Date().toISOString(),
                    decidedBy: session.user.email,
                    feedback: 'Meeting successfully posted to Intervals'
                });
                console.log(`Marked meeting ${primaryMeetingId} as approved in reviews.json`);
            } catch (error) {
                console.error('Error updating meeting status in reviews.json:', error);
                // Don't fail the request if this fails
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
    // Instead of using the meeting date's time, use the current time
    const now = new Date();
    
    // Add 5.5 hours to convert from UTC to IST
    const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    
    // Return ISO string with IST marker
    return istDate.toISOString().replace('Z', '') + ' IST';
} 