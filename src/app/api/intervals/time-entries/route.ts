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
            // FIRST: Update review status BEFORE creating any entries
            try {
                const storageManager = StorageManager.getInstance();
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
                throw new Error('Failed to update meeting review status. Aborting time entry creation.');
            }

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
                    timeToUse = userRecord.duration;
                    
                    if (timeToUse <= 0) {
                        throw new Error(`You did not attend this meeting (duration: ${timeToUse} seconds). Cannot create time entry.`);
                    }
                } else if (!isManualPost) {
                    throw new Error('You did not attend this meeting. No attendance record found.');
                }
            }

            // Convert seconds to decimal hours for Intervals API
            const timeInHours = timeToUse ? Number((timeToUse / 3600).toFixed(2)) : 0;

            // Get task details first for billable status determination
            const tasks = await intervalsApi.getTasks();
            const task = tasks.find((t: { id: string; title?: string; client?: string; project?: string }) => t.id === taskId);
            
            // Determine billable status
            const client = task?.client?.toLowerCase() || '';
            const project = task?.project?.toLowerCase() || '';
            const isInternal = client === 'internal' || client === 'nathcorp' || project.includes('internal');
            const billableStr = isInternal ? 'f' : 't';

            // SECOND: Create the intervals entry
            const result = await intervalsApi.createTimeEntry({
                taskId,
                date,
                time: timeInHours > 0 ? timeInHours : 0.01,
                description: description || 'No description provided',
                workType: workType || 'Meeting',
                billable: billableStr
            });

            // THIRD: Store in the appropriate storage system
            if (isManualPost) {
                const taskName = task?.title || `Task ${taskId}`;
                const module = task?.module || null;

                // Add additional client and project information
                if (result.time) {
                    result.time.client = client || null;
                    result.time.project = project || null;
                    result.time.module = module;
                    result.time.worktype = workType || 'India-Meeting';
                }

                const storageForManual = new AIAgentPostedMeetingsStorage();
                await storageForManual.addPostedMeeting(
                    session.user.email,
                    {
                        meetingId: primaryMeetingId || '',
                        userId: session.user.email,
                        timeEntry: result.time,
                        rawResponse: result,
                        postedAt: convertToIST(date)
                    }
                );
                console.log('Meeting stored in AI Agent storage format');
            } else {
                // Handle automated posts
                const storageForAgent = new AIAgentPostedMeetingsStorage();
                
                if (result.time) {
                    result.time.client = task?.client || null;
                    result.time.project = task?.project || null;
                    
                    if (typeof result.time.time === 'number') {
                        result.time.time = result.time.time.toFixed(2);
                    }
                }
                
                await storageForAgent.addPostedMeeting(
                    session.user.email,
                    {
                        meetingId: primaryMeetingId || '',
                        userId: session.user.email,
                        timeEntry: result.time,
                        rawResponse: result,
                        postedAt: convertToIST(date)
                    }
                );
                console.log('Meeting stored in AI Agent storage');
            }

            console.log('Successfully created time entry:', result);
            return NextResponse.json({
                success: true,
                message: `Successfully logged ${result.time ? Number((result.time.time / 3600).toFixed(2)) : 0} hours`,
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