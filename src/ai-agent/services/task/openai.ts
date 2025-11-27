import { openAIClient } from '../../core/azure-openai/client';
import { generateTaskMatchingPrompt } from '../../core/azure-openai/prompts/task-matching';
import { ProcessedMeeting } from '../../../interfaces/meetings';
import { IntervalsAPI, Task } from './intervals';
import { fetchTasksDirectly } from './direct-fetcher';
import { reviewService } from '../review/review-service';
import { ReviewMeeting } from '../review/types';
import fs from 'fs/promises';
import path from 'path';
import { DateTime } from 'luxon';
import { database } from '../../../lib/database';
import { logDebug } from '../../../lib/ndjson-logger';

interface TaskMatch {
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

interface MatchingResult {
    meetingSubject: string;
    matchedTasks: TaskMatch[];
}

interface UserData {
    userId: string;
    email: string;
    intervalsApiKey: string;
    lastSync: string;
}

interface UserDataFile {
    users: UserData[];
    postedMeetings: string[];
}

interface MeetingAnalysis {
    summary: string;
    keyTopics: string[];
    actionItems: string[];
    decisions: string[];
    nextSteps: string[];
    sentiment: string;
    // ... any other existing properties ...
}

export class TaskService {
    private static instance: TaskService;

    private constructor() {}

    public static getInstance(): TaskService {
        if (!TaskService.instance) {
            TaskService.instance = new TaskService();
        }
        return TaskService.instance;
    }

    private async getUserIntervalsApiKey(userId: string): Promise<string> {
        try {
            // Get API key from SQLite database
            console.log('Getting API key from SQLite for user:', userId);
            const user = database.getUserByEmail(userId);
            
            if (!user?.intervals_api_key) {
                throw new Error(`No Intervals API key found for user ${userId}`);
            }
            
            console.log('API key found in SQLite database for user:', userId);
            return user.intervals_api_key;
        } catch (error) {
            console.error('Error getting Intervals API key:', error);
            throw new Error('Failed to get Intervals API key');
        }
    }

    private async fetchTasksFromIntervals(apiKey: string): Promise<Task[]> {
        try {
            console.log('Fetching tasks using standard API implementation...');
            const api = new IntervalsAPI(apiKey);
            const tasks = await api.getTasks();

            // If we got a reasonable number of tasks, return them
            if (tasks.length > 0) {
                console.log(`Standard API returned ${tasks.length} tasks`);
                return tasks;
            }

            // If we didn't get any tasks, try the direct fetcher as backup
            console.log('No tasks found with standard API, trying direct fetcher...');
            const directTasks = await fetchTasksDirectly(apiKey);
            console.log(`Direct fetcher returned ${directTasks.length} tasks`);

            return directTasks;
        } catch (error) {
            console.error('Error using standard API, falling back to direct fetcher:', error);
            const directTasks = await fetchTasksDirectly(apiKey);
            console.log(`Direct fetcher returned ${directTasks.length} tasks`);
            return directTasks;
        }
    }

    /**
     * Prioritize tasks based on user's relationship with the task
     * Priority order:
     * 1. Assigned tasks (user is the assignee)
     * 2. Followed tasks (user is a follower)
     * 3. Owned tasks (user is the owner)
     *
     * This ensures the AI agent matches meetings to the most relevant tasks first
     */
    private prioritizeTasksByRelationship(tasks: Task[], userPersonId: string): Task[] {
        console.log(`\n╔════════════════════ TASK PRIORITIZATION ════════════════════╗`);
        console.log(`║ Prioritizing ${tasks.length} tasks for user ${userPersonId}`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

        // Separate tasks by relationship type
        const assignedTasks: Task[] = [];
        const followedTasks: Task[] = [];
        const ownedTasks: Task[] = [];

        tasks.forEach(task => {
            // Priority 1: Assigned tasks (can be comma-separated list)
            if (task.assigneeid && task.assigneeid.split(',').map(f => f.trim()).includes(userPersonId)) {
                assignedTasks.push(task);
                console.log(`✓ [ASSIGNED] ${task.title} (Task ID: ${task.id})`);
            }
            // Priority 2: Followed tasks (check if user is in followers list)
            else if (task.followerid && task.followerid.split(',').map(f => f.trim()).includes(userPersonId)) {
                followedTasks.push(task);
                console.log(`👁 [FOLLOWED] ${task.title} (Task ID: ${task.id})`);
            }
            // Priority 3: Owned tasks (can be comma-separated list)
            else if (task.ownerid && task.ownerid.split(',').map(f => f.trim()).includes(userPersonId)) {
                ownedTasks.push(task);
                console.log(`👤 [OWNED] ${task.title} (Task ID: ${task.id})`);
            }
        });

        console.log(`\n┌─────────────── PRIORITIZATION SUMMARY ───────────────┐`);
        console.log(`│ Assigned Tasks: ${assignedTasks.length}`);
        console.log(`│ Followed Tasks: ${followedTasks.length}`);
        console.log(`│ Owned Tasks: ${ownedTasks.length}`);
        console.log(`│ Total: ${assignedTasks.length + followedTasks.length + ownedTasks.length}`);
        console.log(`└──────────────────────────────────────────────────────┘\n`);

        // Return tasks in priority order: assigned → followed → owned
        return [...assignedTasks, ...followedTasks, ...ownedTasks];
    }

    private async queueForReview(meeting: ProcessedMeeting, confidence: number, reason: string, userId: string, suggestedTasks?: TaskMatch[]): Promise<void> {
        // Check if the user actually attended this meeting
        let userDuration = 0;
        if (meeting.attendance?.records) {
            const userRecord = meeting.attendance.records.find(record =>
                record.email.toLowerCase() === userId.toLowerCase()
            );

            if (userRecord) {
                userDuration = userRecord.duration;
                console.log(`Found user's attendance record with duration: ${userDuration} seconds`);
            } else {
                console.log(`User ${userId} did not attend meeting "${meeting.subject}". Skipping review.`);
                return; // Skip queuing for review if user didn't attend
            }
        }

        // Skip if user's duration is zero
        if (userDuration <= 0) {
            console.log(`User ${userId} has zero duration for meeting "${meeting.subject}". Skipping review.`);
            return;
        }

        const reviewMeeting: ReviewMeeting = {
            id: meeting.id, // This will be the instance ID if the meeting was split into multiple reports
            userId: userId,
            subject: meeting.subject,
            startTime: meeting.start.dateTime,
            endTime: meeting.end.dateTime,
            duration: userDuration, // Use the user's actual duration
            participants: meeting.attendees?.map(a => a.email) || [],
            keyPoints: meeting.analysis?.keyPoints,
            suggestedTasks: suggestedTasks?.map(task => ({
                id: task.taskId,
                title: task.taskTitle,
                project: '', // TaskMatch doesn't have project, set empty
                module: '', // TaskMatch doesn't have module, set empty
                confidence: task.confidence,
                reason: task.reason
            })) || [], // Convert TaskMatch to SuggestedTask format
            status: 'pending',
            confidence: confidence,
            reason: reason,
            reportId: meeting.attendance?.reportId // Include the report ID for attendance tracking
        };

        // Log when we're queuing a meeting with a reportId
        if (meeting.attendance?.reportId) {
            console.log(`Meeting queued for review with reportId: ${meeting.attendance.reportId}`);
        }

        await reviewService.queueForReview(reviewMeeting);
    }

    public async matchTasksToMeeting(meeting: ProcessedMeeting, userId: string): Promise<any> {
        try {
            // Check if the user actually attended this meeting
            let userDuration = 0;
            if (meeting.attendance?.records) {
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord) {
                    userDuration = userRecord.duration;
                    console.log(`Found user's attendance record with duration: ${userDuration} seconds`);
                } else {
                    console.log(`User ${userId} did not attend meeting "${meeting.subject}". Skipping task matching.`);
                    return null; // Skip task matching if user didn't attend
                }
            }
            
            // Skip if user's duration is zero
            if (userDuration <= 0) {
                console.log(`User ${userId} has zero duration for meeting "${meeting.subject}". Skipping task matching.`);
                return null;
            }
            
            // Get Intervals API key and fetch tasks
            const apiKey = await this.getUserIntervalsApiKey(userId);
            console.log('Fetching tasks from Intervals for user:', userId);
            const allTasks = await this.fetchTasksFromIntervals(apiKey);
            console.log(`Found ${allTasks.length} tasks in Intervals:`,
                allTasks.map(t => `\n- ${t.title} (${t.id})`).join(''));

            // Get user's personId from Intervals API to prioritize tasks
            const api = new IntervalsAPI(apiKey);
            const currentUser = await api.getCurrentUser();
            const userPersonId = currentUser.personid;
            console.log(`User's Intervals personId: ${userPersonId}`);

            // Apply task prioritization based on relationship: assigned → followed → owned
            const availableTasks = this.prioritizeTasksByRelationship(allTasks, userPersonId);
            console.log(`After prioritization: ${availableTasks.length} tasks to match against`);

            // Format meeting analysis data with enhanced context
            const meetingAnalysis = {
                subject: meeting.subject,
                startTime: meeting.seriesMasterId && meeting.attendance?.records?.[0]?.attendanceIntervals?.[0]?.joinDateTime
                    ? DateTime.fromISO(meeting.attendance.records[0].attendanceIntervals[0].joinDateTime)
                        .setZone('Asia/Kolkata')
                        .toFormat("yyyy-MM-dd'T'HH:mm:ss.0000000")
                    : meeting.start.dateTime,
                endTime: meeting.seriesMasterId && meeting.attendance?.records?.[0]?.attendanceIntervals?.[0]?.leaveDateTime
                    ? DateTime.fromISO(meeting.attendance.records[0].attendanceIntervals[0].leaveDateTime)
                        .setZone('Asia/Kolkata')
                        .toFormat("yyyy-MM-dd'T'HH:mm:ss.0000000")
                    : meeting.end.dateTime,
                duration: userDuration, // Use the user's actual duration
                analysis: {
                    keyPoints: meeting.analysis?.keyPoints || [],
                    suggestedCategories: meeting.analysis?.suggestedCategories || [],
                    confidence: meeting.analysis?.confidence || 0,
                    context: meeting.analysis?.context || {}
                },
                attendance: meeting.attendance
            };
            console.log('Meeting analysis for matching:', JSON.stringify(meetingAnalysis, null, 2));

            // Format tasks data with enhanced details
            const tasksData = availableTasks.map(task => ({
                ...task,
                matchingContext: {
                    isActive: task.status?.toLowerCase().includes('active'),
                    hasPriority: !!task.priority,
                    hasDescription: !!task.description,
                    projectContext: task.project
                }
            }));
            console.log('Tasks data for matching:', JSON.stringify(tasksData, null, 2));

            // Generate prompt and get matches from OpenAI
            const prompt = generateTaskMatchingPrompt(
                JSON.stringify(meetingAnalysis, null, 2),
                JSON.stringify(tasksData, null, 2)
            );
            console.log('Generated prompt for OpenAI:', prompt);
            logDebug('task_matching_prompt', 'Generated prompt for OpenAI:', { prompt, meeting: meeting.subject });

            const matchingResult = await openAIClient.sendRequest(prompt, {
                // temperature removed for GPT-5 compatibility (only supports default value 1)
                maxTokens: 3000  // Increased for GPT-5 reasoning tokens + response content
            });
            console.log('OpenAI response:', matchingResult);
            logDebug('task_matching_response', 'OpenAI response:', { matchingResult, meeting: meeting.subject });

            // Parse the matching result
            const result = this.parseMatchingResult(matchingResult, meeting.subject);
            console.log('Parsed matching result:', JSON.stringify(result, null, 2));

            // Check if we need to queue for review
            if (!result.matchedTasks || result.matchedTasks.length === 0) {
                console.log(`No matches found for meeting: ${meeting.subject}, queueing for review`);
                await this.queueForReview(meeting, 0, 'No matching tasks found', userId);
                return null; // Return null to prevent time entry creation
            }

            // Find the best match by confidence
            const bestMatch = result.matchedTasks.reduce((a, b) =>
                a.confidence > b.confidence ? a : b
            );

            // Only auto-post if confidence >= 0.8 (80%)
            if (bestMatch.confidence >= 0.8) {
                console.log(`High confidence match (${bestMatch.confidence}) for meeting "${meeting.subject}": Auto-posting to Intervals - Task ${bestMatch.taskId} (${bestMatch.taskTitle})`);
                // Return the result with the best match to create time entry automatically
                return result;
            } else {
                console.log(`Low/medium confidence match (${bestMatch.confidence}) for meeting "${meeting.subject}": Queueing for review - Suggested task: ${bestMatch.taskTitle}`);
                // Pass the matched tasks as suggestions for the user to review
                await this.queueForReview(meeting, bestMatch.confidence,
                    `Confidence below 80% threshold. Suggested task: ${bestMatch.taskTitle} (${Math.round(bestMatch.confidence * 100)}% confidence)`,
                    userId,
                    result.matchedTasks); // Pass suggested tasks
                return null; // Return null to prevent automatic time entry creation
            }

        } catch (error) {
            console.error('Error matching tasks to meeting:', error);
            // Queue for review due to error
            await this.queueForReview(meeting, 0, 'Error during task matching', userId);
            return null; // Return null to prevent time entry creation
        }
    }

    private parseMatchingResult(result: string, meetingSubject: string): MatchingResult {
        try {
            // Find the JSON object in the response
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('No JSON found in response');
                return { meetingSubject, matchedTasks: [] };
            }

            // Parse the JSON response
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and transform the response
            const matchedTasks = (parsed.matchedTasks || [])
                .filter((task: Partial<TaskMatch>) => this.isValidTaskMatch(task))
                .sort((a: TaskMatch, b: TaskMatch) => b.confidence - a.confidence);

            // Debug logging
            console.log('Raw OpenAI response:', result);
            console.log('Extracted JSON:', jsonMatch[0]);
            console.log('Parsed tasks:', JSON.stringify(matchedTasks, null, 2));
            logDebug('task_matching_parsed', 'Parsed matching result:', { rawResponse: result, extractedJSON: jsonMatch[0], parsedTasks: matchedTasks });

            return {
                meetingSubject,
                matchedTasks
            };
        } catch (error) {
            console.error('Error parsing matching result:', error);
            console.log('Failed to parse response:', result);
            return { meetingSubject, matchedTasks: [] };
        }
    }

    private isValidTaskMatch(task: Partial<TaskMatch>): boolean {
        return !!(
            task.taskId &&
            task.taskTitle &&
            task.meetingDetails?.subject &&
            task.meetingDetails?.startTime &&
            task.meetingDetails?.endTime &&
            task.meetingDetails?.actualDuration !== undefined &&
            task.confidence &&
            task.reason
        );
    }

    // Add a method to get task name by taskId
    async getTaskNameById(taskId: string, apiKey: string): Promise<string | null> {
        try {
            console.log(`Fetching task name for taskId: ${taskId}`);
            const intervalsApi = new IntervalsAPI(apiKey);
            
            // First try getting tasks from the regular API
            const tasks = await intervalsApi.getTasks();
            
            let task = tasks.find(t => t.id === taskId);
            
            // If task not found with regular API, try direct fetcher
            if (!task) {
                console.log(`Task with ID ${taskId} not found in regular API, trying direct fetcher...`);
                // The direct fetcher now properly filters tasks by assignee
                const directTasks = await fetchTasksDirectly(apiKey);
                task = directTasks.find(t => t.id === taskId);
            }
            
            if (task) {
                console.log(`Found task name: ${task.title} for taskId: ${taskId}`);
                return task.title;
            }
            
            console.log(`No task found for taskId: ${taskId} in either API or direct fetch`);
            return null;
        } catch (error) {
            console.error(`Error fetching task name for taskId ${taskId}:`, error);
            return null;
        }
    }
}

export const taskService = TaskService.getInstance(); 