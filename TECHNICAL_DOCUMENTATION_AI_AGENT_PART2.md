# Technical Documentation - Meeting Time Tracker Application
## Part 2: AI Agent Workflow (Part 2 of 2)

**Version:** 1.0
**Last Updated:** 2025-11-13
**Application Type:** Automated Background Processing System

---

## Table of Contents (Part 2)

9. [Time Entry Creation Flow](#9-time-entry-creation-flow)
10. [Review System](#10-review-system)
11. [Attendance Report Management](#11-attendance-report-management)
12. [Rate Limiting and Throttling](#12-rate-limiting-and-throttling)
13. [Error Handling and Retry Logic](#13-error-handling-and-retry-logic)
14. [Logging System](#14-logging-system)
15. [Comparison: AI Agent vs Manual Workflow](#15-comparison-ai-agent-vs-manual-workflow)
16. [User Enablement/Disablement](#16-user-enablementdisablement)
17. [Monitoring and Troubleshooting](#17-monitoring-and-troubleshooting)

---

## 9. Time Entry Creation Flow

### IntervalsTimeEntryService

**File Location:** `src/ai-agent/services/time-entry/intervals.ts`

**Purpose:** Automatically create time entries in Intervals without user interaction

#### Complete Workflow

```
Meeting Matched to Task
  ↓
IntervalsTimeEntryService.createTimeEntry()
  ↓
1. Get Person Info (Intervals user ID)
  ↓
2. Get Task Details (project, module, client)
  ↓
3. Get Project Work Types (billable/non-billable)
  ↓
4. Convert Duration (seconds → decimal hours)
  ↓
5. Format Date (UTC → IST, YYYY-MM-DD)
  ↓
6. Build Time Entry Payload
  ↓
7. POST to /api/intervals-proxy
  ↓
8. Intervals API Creates Time Entry
  ↓
9. Save to SQLite meetings table
  ↓
10. Return Success Response
```

---

### Method 1: Create Time Entry

```typescript
public async createTimeEntry(
  meeting: ProcessedMeeting,
  taskInfo: {
    taskId: string;
    taskTitle: string;
  },
  userId: string
): Promise<TimeEntryResponse> {
  console.log(`Creating time entry for meeting: "${meeting.subject}"`);

  try {
    // Step 1: Get person info
    const personInfo = await this.getPersonInfo(userId);
    console.log(`Person ID: ${personInfo.personid}`);

    // Step 2: Get task details
    const taskDetails = await this.getTaskDetails(taskInfo.taskId, userId);
    console.log(`Task: ${taskDetails.title}`);
    console.log(`Project: ${taskDetails.project} (${taskDetails.projectid})`);
    console.log(`Module: ${taskDetails.module} (${taskDetails.moduleid})`);

    // Step 3: Get project work types
    const workTypes = await this.getProjectWorkTypes(taskDetails.projectid, userId);
    if (workTypes.length === 0) {
      throw new Error('No work types available for project');
    }

    // Use first available work type
    const workType = workTypes[0];
    console.log(`Work Type: ${workType.worktype} (${workType.id})`);

    // Step 4: Convert duration to decimal hours
    const durationHours = this.convertSecondsToDecimalHours(meeting.duration);
    console.log(`Duration: ${meeting.duration}s → ${durationHours}h`);

    // Step 5: Format date to IST
    const entryDate = this.formatDate(meeting.startTime);
    console.log(`Date (IST): ${entryDate}`);

    // Step 6: Determine billable status
    const billable = this.isBillable(taskDetails);

    // Step 7: Build time entry payload
    const timeEntry = {
      personid: personInfo.personid,
      taskid: taskInfo.taskId,
      projectid: taskDetails.projectid,
      moduleid: taskDetails.moduleid,
      worktypeid: workType.id,
      date: entryDate,
      time: durationHours,
      description: `${meeting.subject} (AI Agent)`,
      billable: billable ? 't' : 'f'
    };

    // Step 8: Create time entry via proxy
    const response = await fetch('http://localhost:8080/api/intervals-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({
        endpoint: '/time',
        method: 'POST',
        data: { time: timeEntry }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Intervals API error: ${errorText}`);
    }

    const result = await response.json();

    console.log(`✅ Successfully created time entry for: "${meeting.subject}"`);

    // Step 9: Save to database
    await this.savePostedMeeting(meeting, result, taskInfo.taskTitle, userId);

    // Step 10: Return response
    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error(`❌ Error creating time entry for "${meeting.subject}":`, error);
    throw error;
  }
}
```

**Location:** `src/ai-agent/services/time-entry/intervals.ts:45-130`

---

### Method 2: Get Person Info

```typescript
private async getPersonInfo(userId: string): Promise<IntervalsUser> {
  const response = await fetch('http://localhost:8080/api/intervals-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId
    },
    body: JSON.stringify({
      endpoint: '/person/me',
      method: 'GET'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to get person info from Intervals');
  }

  const data = await response.json();

  return {
    personid: data.data.person.id,
    firstname: data.data.person.firstname,
    lastname: data.data.person.lastname,
    email: data.data.person.email
  };
}
```

**Purpose:** Get Intervals user ID (personid) for time entry

**Returns:**
```typescript
interface IntervalsUser {
  personid: string;     // e.g., "123456"
  firstname: string;
  lastname: string;
  email: string;
}
```

**Location:** `src/ai-agent/services/time-entry/intervals.ts:132-160`

---

### Method 3: Get Task Details

```typescript
private async getTaskDetails(
  taskId: string,
  userId: string
): Promise<TaskDetails> {
  const response = await fetch('http://localhost:8080/api/intervals-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId
    },
    body: JSON.stringify({
      endpoint: `/task/${taskId}`,
      method: 'GET'
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to get task details for ${taskId}`);
  }

  const data = await response.json();
  const task = data.data.task;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    projectid: task.projectid,
    project: task.project,
    moduleid: task.moduleid,
    module: task.module,
    clientid: task.clientid,
    client: task.client,
    status: task.status
  };
}
```

**Purpose:** Get full task information including project, module, and client

**Returns:**
```typescript
interface TaskDetails {
  id: string;
  title: string;
  description?: string;
  projectid: string;
  project: string;
  moduleid: string;
  module: string;
  clientid: string;
  client: string;
  status: string;
}
```

**Location:** `src/ai-agent/services/time-entry/intervals.ts:162-205`

---

### Method 4: Get Project Work Types

```typescript
private async getProjectWorkTypes(
  projectId: string,
  userId: string
): Promise<WorkType[]> {
  const response = await fetch('http://localhost:8080/api/intervals-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId
    },
    body: JSON.stringify({
      endpoint: '/projectworktype/',
      method: 'GET'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to get project work types');
  }

  const data = await response.json();

  // Filter work types for this project
  const projectWorkTypes = data.data.projectworktype.filter((wt: any) => {
    return wt.projectid === projectId && wt.active === 't';
  });

  return projectWorkTypes.map((wt: any) => ({
    id: wt.worktypeid,
    worktype: wt.worktype,
    billable: wt.billable === 't',
    active: wt.active === 't'
  }));
}
```

**Purpose:** Get available work types for the project (e.g., "India-Meeting", "Development", "Bug Fix")

**Returns:**
```typescript
interface WorkType {
  id: string;
  worktype: string;        // e.g., "India-Meeting"
  billable: boolean;
  active: boolean;
}
```

**Location:** `src/ai-agent/services/time-entry/intervals.ts:207-245`

---

### Method 5: Convert Duration

```typescript
private convertSecondsToDecimalHours(seconds: number): number {
  return Number((seconds / 3600).toFixed(2));
}
```

**Purpose:** Convert attendance duration from seconds to decimal hours

**Examples:**
- 3600 seconds → 1.00 hours
- 5400 seconds → 1.50 hours
- 1800 seconds → 0.50 hours
- 7200 seconds → 2.00 hours

**Location:** `src/ai-agent/services/time-entry/intervals.ts:247-250`

---

### Method 6: Format Date

```typescript
private formatDate(dateString: string): string {
  // Convert UTC to IST (UTC+05:30)
  const date = new Date(dateString);
  const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));

  // Return YYYY-MM-DD format
  return istDate.toISOString().split('T')[0];
}
```

**Purpose:** Convert meeting start time to IST date in YYYY-MM-DD format

**Examples:**
- `2025-01-15T04:00:00Z` (UTC) → `2025-01-15` (IST)
- `2025-01-15T20:00:00Z` (UTC) → `2025-01-16` (IST - next day)

**IST Offset:** UTC+05:30 (India Standard Time)

**Location:** `src/ai-agent/services/time-entry/intervals.ts:252-260`

---

### Method 7: Determine Billable Status

```typescript
private isBillable(taskDetails: TaskDetails): boolean {
  const clientName = taskDetails.client.toLowerCase();

  // Non-billable clients
  const nonBillableKeywords = ['internal', 'nathcorp', 'admin', 'overhead'];

  for (const keyword of nonBillableKeywords) {
    if (clientName.includes(keyword)) {
      return false;  // Non-billable
    }
  }

  return true;  // Billable by default
}
```

**Purpose:** Determine if time entry should be marked as billable

**Logic:**
- If client name contains "Internal", "Nathcorp", "Admin", or "Overhead" → Non-billable
- Otherwise → Billable

**Location:** `src/ai-agent/services/time-entry/intervals.ts:262-278`

---

### Method 8: Save Posted Meeting

```typescript
private async savePostedMeeting(
  meeting: ProcessedMeeting,
  intervalsResponse: any,
  taskName: string,
  userId: string
): Promise<void> {
  const db = AppDatabase.getInstance();

  db.saveMeeting({
    meeting_id: meeting.id,
    user_id: userId,
    time_entry: JSON.stringify(intervalsResponse.data),
    raw_response: JSON.stringify(intervalsResponse),
    task_name: taskName,
    report_id: meeting.reportId
  });

  console.log('✅ Successfully saved posted meeting to database');
}
```

**Purpose:** Save posted meeting to SQLite database for tracking and deduplication

**Database Table:** `meetings`

**Prevents Duplicate Posting:** Via `UNIQUE(user_id, report_id)` constraint

**Location:** `src/ai-agent/services/time-entry/intervals.ts:280-300`

---

### Time Entry Creation Example

```typescript
import { IntervalsTimeEntryService } from '@/ai-agent/services/time-entry/intervals';

const timeEntryService = IntervalsTimeEntryService.getInstance();

// Create time entry for matched meeting
const result = await timeEntryService.createTimeEntry(
  {
    id: 'meeting-123',
    subject: 'Sprint Planning',
    startTime: '2025-01-15T04:00:00Z',
    duration: 5400,  // 1.5 hours in seconds
    userId: 'user@example.com',
    reportId: 'report-abc'
  },
  {
    taskId: '789012',
    taskTitle: 'Sprint Planning & Retrospective'
  },
  'user@example.com'
);

console.log('Time Entry Created:', result);
// Output:
// {
//   success: true,
//   data: {
//     id: '567890',
//     taskid: '789012',
//     date: '2025-01-15',
//     time: 1.5,
//     description: 'Sprint Planning (AI Agent)',
//     billable: 't'
//   }
// }
```

---

## 10. Review System

### ReviewService

**File Location:** `src/ai-agent/services/review/review-service.ts`

**Purpose:** Manage queue of meetings that couldn't be automatically matched to tasks

#### Review Lifecycle

```
Meeting Processing
  ↓
Task Matching Fails (no match or low confidence)
  ↓
reviewService.queueForReview(meeting)
  ↓
Stored in SQLite reviews table (status='pending')
  ↓
User sees in UI review queue
  ↓
User makes decision:
  - Approve → Select task, create time entry
  - Reject → No time entry, mark as rejected
  - No Entry Needed → Skip, mark as completed
  ↓
reviewService.submitReview(decision)
  ↓
Update status in database
  ↓
Store decision for AI learning
```

---

### Method 1: Queue for Review

```typescript
public async queueForReview(meeting: ProcessedMeeting): Promise<void> {
  console.log(`📝 Queuing meeting for review: "${meeting.subject}"`);

  const reviewMeeting: ReviewMeeting = {
    id: meeting.id || `review_${Date.now()}`,
    userId: meeting.userId,
    subject: meeting.subject,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    duration: meeting.duration,
    status: 'pending',
    confidence: 0,  // No match = 0 confidence
    reason: 'No matching task found by AI',
    reportId: meeting.reportId,
    participants: this.extractParticipants(meeting),
    keyPoints: this.extractKeyPoints(meeting),
    suggestedTasks: []  // Could add AI suggestions here
  };

  // Store in SQLite via StorageManager
  const storage = StorageManager.getInstance();
  storage.storeMeetingForReview(reviewMeeting);

  console.log(`✅ Meeting queued for review: "${meeting.subject}"`);
}
```

**Purpose:** Add meeting to review queue when AI can't confidently match to a task

**Stored In:** SQLite `reviews` table

**Location:** `src/ai-agent/services/review/review-service.ts:25-55`

---

### Method 2: Get Pending Reviews

```typescript
public getPendingReviews(userId: string): ReviewMeeting[] {
  console.log(`📋 Getting pending reviews for user: ${userId}`);

  const storage = StorageManager.getInstance();
  const pendingReviews = storage.getPendingReviews(userId);

  console.log(`Found ${pendingReviews.length} pending reviews`);

  return pendingReviews.sort((a, b) => {
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
  });
}
```

**Purpose:** Retrieve all pending reviews for a user (sorted newest first)

**Returns:**
```typescript
interface ReviewMeeting {
  id: string;
  userId: string;
  subject: string;
  startTime: string;
  endTime: string;
  duration: number;
  status: 'pending' | 'approved' | 'rejected' | 'no_entry_needed';
  confidence: number;
  reason?: string;
  reportId?: string;
  participants: string[];
  keyPoints: string[];
  suggestedTasks: SuggestedTask[];
}
```

**Location:** `src/ai-agent/services/review/review-service.ts:57-75`

---

### Method 3: Get All Reviews

```typescript
public getAllReviews(userId: string): ReviewMeeting[] {
  console.log(`📋 Getting all reviews for user: ${userId}`);

  const storage = StorageManager.getInstance();
  return storage.getAllReviews(userId);
}
```

**Purpose:** Get all reviews regardless of status (for analytics and history)

**Location:** `src/ai-agent/services/review/review-service.ts:77-85`

---

### Method 4: Submit Review Decision

```typescript
public async submitReview(decision: ReviewDecision): Promise<void> {
  console.log(`✅ Submitting review decision: ${decision.meetingId} → ${decision.status}`);

  const storage = StorageManager.getInstance();

  // Update review status in database
  storage.updateReviewStatus(decision);

  // If approved with task, create time entry
  if (decision.status === 'approved' && decision.taskId) {
    console.log(`Creating time entry for approved review: ${decision.meetingId}`);

    // Get meeting from review queue
    const reviewMeeting = storage.getMeetingForReview(decision.meetingId);

    if (!reviewMeeting) {
      throw new Error('Review meeting not found');
    }

    // Convert ReviewMeeting to ProcessedMeeting
    const processedMeeting: ProcessedMeeting = {
      id: reviewMeeting.id,
      subject: reviewMeeting.subject,
      startTime: reviewMeeting.startTime,
      endTime: reviewMeeting.endTime,
      duration: reviewMeeting.duration,
      userId: reviewMeeting.userId,
      reportId: reviewMeeting.reportId
    };

    // Get task details
    const taskService = TaskService.getInstance();
    const task = await taskService.getTaskById(decision.taskId, reviewMeeting.userId);

    // Create time entry
    const timeEntryService = IntervalsTimeEntryService.getInstance();
    await timeEntryService.createTimeEntry(
      processedMeeting,
      {
        taskId: decision.taskId,
        taskTitle: task.title
      },
      reviewMeeting.userId
    );
  }

  // Store decision for learning
  this.storeDecisionForLearning(decision);

  console.log(`✅ Review decision submitted: ${decision.meetingId}`);
}
```

**Purpose:** Process user's decision on a review (approve, reject, or skip)

**Decision Structure:**
```typescript
interface ReviewDecision {
  meetingId: string;
  taskId?: string;                    // Required if approved
  status: 'approved' | 'rejected' | 'no_entry_needed';
  feedback?: string;                  // Optional user feedback
  decidedAt: string;                  // ISO timestamp
  decidedBy: string;                  // User ID
}
```

**Location:** `src/ai-agent/services/review/review-service.ts:87-145`

---

### Method 5: Get Review Statistics

```typescript
public getReviewStats(userId: string): ReviewStats {
  const allReviews = this.getAllReviews(userId);

  const stats = {
    totalPending: 0,
    totalReviewed: 0,
    approvalRate: 0,
    averageConfidence: 0
  };

  allReviews.forEach(review => {
    if (review.status === 'pending') {
      stats.totalPending++;
    } else {
      stats.totalReviewed++;
    }
  });

  const approved = allReviews.filter(r => r.status === 'approved').length;
  stats.approvalRate = stats.totalReviewed > 0
    ? (approved / stats.totalReviewed) * 100
    : 0;

  const totalConfidence = allReviews.reduce((sum, r) => sum + r.confidence, 0);
  stats.averageConfidence = allReviews.length > 0
    ? totalConfidence / allReviews.length
    : 0;

  return stats;
}
```

**Purpose:** Get statistics for user's review queue

**Returns:**
```typescript
interface ReviewStats {
  totalPending: number;
  totalReviewed: number;
  approvalRate: number;        // Percentage
  averageConfidence: number;   // 0-1.0
}
```

**Location:** `src/ai-agent/services/review/review-service.ts:147-180`

---

### Method 6: Store Decision for Learning

```typescript
private storeDecisionForLearning(decision: ReviewDecision): void {
  // Store in review-decisions.json for future AI training
  const storage = StorageManager.getInstance();
  storage.storeReviewDecision(decision);

  console.log(`📝 Stored decision for learning: ${decision.meetingId}`);
}
```

**Purpose:** Save user decisions to train AI model in the future

**Storage:** `review-decisions.json` (JSON file)

**Future Use:** Improve task matching algorithm based on user corrections

**Location:** `src/ai-agent/services/review/review-service.ts:182-190`

---

### Review System Usage Example

```typescript
import { ReviewService } from '@/ai-agent/services/review/review-service';

const reviewService = ReviewService.getInstance();

// Queue meeting that couldn't be matched
await reviewService.queueForReview({
  id: 'meeting-123',
  subject: 'Client Call - Acme Corp',
  userId: 'user@example.com',
  startTime: '2025-01-15T10:00:00Z',
  endTime: '2025-01-15T11:00:00Z',
  duration: 3600,
  reportId: 'report-abc'
});

// Get pending reviews for user
const pending = reviewService.getPendingReviews('user@example.com');
console.log(`${pending.length} meetings need review`);

// User approves review and selects task
await reviewService.submitReview({
  meetingId: 'meeting-123',
  taskId: 'task-789',
  status: 'approved',
  decidedBy: 'user@example.com',
  decidedAt: new Date().toISOString()
});

// Get statistics
const stats = reviewService.getReviewStats('user@example.com');
console.log('Review Stats:', stats);
// Output:
// {
//   totalPending: 5,
//   totalReviewed: 20,
//   approvalRate: 85,      // 85% approved
//   averageConfidence: 0.45
// }
```

---

## 11. Attendance Report Management

### AttendanceReportManager

**File Location:** `src/ai-agent/services/meeting/attendance-report-manager.ts`

**Purpose:** Match meetings to attendance reports and validate for accurate time entry creation

#### Why Attendance Reports Matter

- Same meeting can have multiple attendance reports (recurring meetings)
- Each report = one meeting instance
- Need to match correct report to create accurate time entry
- Prevents duplicate time entries for same meeting

---

### Report Validation Flow

```
Meeting Retrieved from Graph API
  ↓
Has Multiple Attendance Reports?
  ↓
YES → Use AI to select best report
NO → Use single report
  ↓
Validate Report:
  - Date matches meeting date (IST)
  - Duration >= 60 seconds
  - Has attendance records
  ↓
VALID → Process for time entry
INVALID → Skip or queue for review
```

---

### Method 1: Process Attendance Reports (Non-Recurring)

```typescript
public async processAttendanceReports(
  reports: AttendanceReportInfo[],
  meetingDate: string,
  isRecurring: boolean = false
): Promise<ReportSelection | null> {
  console.log(`📊 Processing ${reports.length} attendance reports`);

  if (reports.length === 0) {
    return null;
  }

  // For non-recurring meetings, select best report
  if (!isRecurring) {
    return await this.selectBestReport(reports, meetingDate);
  }

  // For recurring meetings, process all valid reports
  return null;  // Use processAllValidReports instead
}
```

**Purpose:** Process attendance reports for non-recurring meetings (selects single best report)

**Location:** `src/ai-agent/services/meeting/attendance-report-manager.ts:30-50`

---

### Method 2: Process All Valid Reports (Recurring)

```typescript
public async processAllValidReports(
  reports: AttendanceReportInfo[],
  meetingDate: string,
  isRecurring: boolean = true
): Promise<ReportSelection[]> {
  console.log(`📊 Processing all valid reports for recurring meeting`);

  const validReports: ReportSelection[] = [];

  for (const report of reports) {
    const validation = this.validateReport(report, meetingDate);

    if (validation.isValid) {
      validReports.push({
        selectedReportId: report.id,
        confidence: 1.0,  // Validated = 100% confidence
        reasoning: validation.reason,
        metadata: {
          dateMatch: true,
          durationValid: true,
          hasAttendees: report.totalParticipantCount > 0
        }
      });
    }
  }

  console.log(`✅ Found ${validReports.length} valid reports`);

  return validReports;
}
```

**Purpose:** Process all valid reports for recurring meetings (creates multiple time entries)

**Use Case:** Daily standup, weekly team sync, etc.

**Location:** `src/ai-agent/services/meeting/attendance-report-manager.ts:52-85`

---

### Method 3: Select Best Report (AI-Powered)

```typescript
private async selectBestReport(
  reports: AttendanceReportInfo[],
  meetingDate: string
): Promise<ReportSelection> {
  console.log(`🤖 Using AI to select best report from ${reports.length} options`);

  // Validate all reports first
  const validReports = reports.filter(report => {
    const validation = this.validateReport(report, meetingDate);
    return validation.isValid;
  });

  if (validReports.length === 0) {
    throw new Error('No valid attendance reports found');
  }

  // If only one valid report, use it
  if (validReports.length === 1) {
    return {
      selectedReportId: validReports[0].id,
      confidence: 1.0,
      reasoning: 'Only valid report available',
      metadata: {
        dateMatch: true,
        durationValid: true,
        hasAttendees: validReports[0].totalParticipantCount > 0
      }
    };
  }

  // Multiple valid reports - use AI to select best one
  const openAIClient = AzureOpenAIClient.getInstance();
  const selection = await openAIClient.selectAttendanceReport(
    { subject: 'Meeting', scheduledDate: meetingDate },
    validReports
  );

  return selection;
}
```

**Purpose:** Use AI to select the best report when multiple valid reports exist

**Location:** `src/ai-agent/services/meeting/attendance-report-manager.ts:87-130`

---

### Method 4: Validate Report

```typescript
public validateReport(
  report: AttendanceReportInfo,
  targetDate: string
): { isValid: boolean; reason: string } {
  // Convert dates to IST timezone
  const reportDate = this.convertToIST(report.meetingStartDateTime);
  const targetISTDate = this.convertToIST(targetDate);

  // Extract date part (YYYY-MM-DD)
  const reportDateOnly = reportDate.split('T')[0];
  const targetDateOnly = targetISTDate.split('T')[0];

  // Check 1: Date match
  if (reportDateOnly !== targetDateOnly) {
    return {
      isValid: false,
      reason: `Date mismatch: report ${reportDateOnly} != target ${targetDateOnly}`
    };
  }

  // Check 2: Duration validation
  const startTime = new Date(report.meetingStartDateTime);
  const endTime = new Date(report.meetingEndDateTime);
  const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

  if (durationSeconds < 60) {
    return {
      isValid: false,
      reason: `Duration too short: ${durationSeconds}s < 60s minimum`
    };
  }

  // Check 3: Has participants
  if (report.totalParticipantCount === 0) {
    return {
      isValid: false,
      reason: 'No participants in attendance report'
    };
  }

  return {
    isValid: true,
    reason: 'All validation checks passed'
  };
}
```

**Purpose:** Validate attendance report against strict rules

**Validation Rules:**
1. **Date Match:** Report date must exactly match meeting date (IST timezone)
2. **Duration:** Meeting duration must be ≥ 60 seconds (1 minute minimum)
3. **Participants:** Must have at least 1 participant

**Location:** `src/ai-agent/services/meeting/attendance-report-manager.ts:132-180`

---

### Method 5: Convert to IST

```typescript
private convertToIST(dateString: string): string {
  const date = new Date(dateString);

  // Add IST offset (UTC+05:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffset);

  return istDate.toISOString();
}
```

**Purpose:** Convert UTC datetime to IST (Indian Standard Time)

**IST Offset:** UTC+05:30

**Example:**
- UTC: `2025-01-15T04:00:00Z`
- IST: `2025-01-15T09:30:00.000Z` (same moment, different timezone representation)

**Location:** `src/ai-agent/services/meeting/attendance-report-manager.ts:182-192`

---

### Attendance Report Usage Example

```typescript
import { AttendanceReportManager } from '@/ai-agent/services/meeting/attendance-report-manager';

const reportManager = AttendanceReportManager.getInstance();

// Single meeting with multiple reports
const reports = [
  {
    id: 'report-1',
    meetingStartDateTime: '2025-01-15T04:00:00Z',
    meetingEndDateTime: '2025-01-15T05:00:00Z',
    totalParticipantCount: 5
  },
  {
    id: 'report-2',
    meetingStartDateTime: '2025-01-15T04:05:00Z',
    meetingEndDateTime: '2025-01-15T05:05:00Z',
    totalParticipantCount: 3
  }
];

// Select best report for non-recurring meeting
const selection = await reportManager.processAttendanceReports(
  reports,
  '2025-01-15',
  false
);

console.log('Selected Report:', selection);
// Output:
// {
//   selectedReportId: 'report-1',
//   confidence: 0.95,
//   reasoning: 'More participants and earlier start time',
//   metadata: {
//     dateMatch: true,
//     durationValid: true,
//     hasAttendees: true
//   }
// }

// For recurring meeting - process all valid reports
const recurringReports = await reportManager.processAllValidReports(
  reports,
  '2025-01-15',
  true
);

console.log(`Found ${recurringReports.length} valid instances`);
// Creates separate time entry for each valid report
```

---

## 12. Rate Limiting and Throttling

### TokenBucket Algorithm

**File Location:** `src/ai-agent/core/rate-limiter/token-bucket.ts`

**Purpose:** Prevent exceeding Azure OpenAI API rate limits

#### How Token Bucket Works

```
Bucket starts with N tokens
  ↓
Tokens refill at constant rate (e.g., 0.8 tokens/second)
  ↓
Each API request consumes 1 token
  ↓
If no tokens available → WAIT until refilled
  ↓
Never exceed max bucket capacity
```

---

### TokenBucket Class

```typescript
class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;  // tokens per millisecond
  private lastRefillTimestamp: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;  // Start full
    this.refillRate = refillRate;
    this.lastRefillTimestamp = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefillTimestamp;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefillTimestamp = now;
  }

  public async consume(tokensToConsume: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokensToConsume) {
      this.tokens -= tokensToConsume;
      console.log(`✅ Consumed ${tokensToConsume} tokens, ${this.tokens.toFixed(2)} remaining`);
      return;
    }

    // Not enough tokens - calculate wait time
    const tokensNeeded = tokensToConsume - this.tokens;
    const waitTime = tokensNeeded / this.refillRate;

    console.log(`⏳ Waiting ${(waitTime / 1000).toFixed(2)}s for ${tokensNeeded} tokens...`);

    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Consume all tokens
    this.tokens = 0;
  }

  public hasCapacity(tokensNeeded: number = 1): boolean {
    this.refill();
    return this.tokens >= tokensNeeded;
  }

  public getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}
```

**Location:** `src/ai-agent/core/rate-limiter/token-bucket.ts:1-60`

---

### RateLimiter Class

```typescript
class RateLimiter {
  private tokenBucket: TokenBucket;
  private requestsPerMinute: number;

  constructor(requestsPerMinute: number = 48) {
    this.requestsPerMinute = requestsPerMinute;

    // Calculate refill rate (tokens per millisecond)
    const refillRate = requestsPerMinute / 60000;

    this.tokenBucket = new TokenBucket(requestsPerMinute, refillRate);
  }

  public async waitForCapacity(tokensNeeded: number = 1): Promise<void> {
    await this.tokenBucket.consume(tokensNeeded);
  }

  public hasCapacity(tokensNeeded: number = 1): boolean {
    return this.tokenBucket.hasCapacity(tokensNeeded);
  }

  public getStatus(): { available: number; max: number; rate: number } {
    return {
      available: this.tokenBucket.getAvailableTokens(),
      max: this.requestsPerMinute,
      rate: this.requestsPerMinute / 60  // requests per second
    };
  }
}
```

**Default Configuration:**
- **Requests per minute:** 48 (Azure OpenAI S0 tier)
- **Refill rate:** 0.8 requests/second
- **Max burst:** 48 requests

**Location:** `src/ai-agent/core/rate-limiter/token-bucket.ts:62-95`

---

### Rate Limiting Integration Points

#### 1. Queue Manager

```typescript
// In QueueManager.processQueue()
while (this.queue.length > 0) {
  // Wait for rate limiter
  await this.rateLimiter.waitForCapacity();

  // Process item
  const item = this.queue.shift();
  await item.processFunction(item.meeting, item.userId);

  // Wait processing interval
  await this.sleep(this.processingInterval);
}
```

**Strategy:** One token per meeting, sequential processing

---

#### 2. Batch Processor

```typescript
// In BatchProcessor.processMeetingBatch()
for (const chunk of chunks) {
  // Check if enough tokens available
  const tokensNeeded = chunk.length;  // 5 tokens for 5 meetings
  await this.rateLimiter.waitForCapacity(tokensNeeded);

  // Process all 5 in parallel
  await Promise.all(chunk.map(m => processMeeting(m)));

  // Wait before next batch
  await this.sleep(1000);
}
```

**Strategy:** Batch token consumption (5 tokens at once), parallel processing within batch

---

#### 3. Azure OpenAI Client

```typescript
// In AzureOpenAIClient.sendRequest()
public async sendRequest(prompt: string): Promise<string> {
  // Wait for rate limiter
  await this.rateLimiter.waitForCapacity();

  // Make API request
  const response = await fetch(url, { ... });

  return response;
}
```

**Strategy:** One token per API call, automatic waiting

---

### Rate Limiting Configuration

**Default Rates:**
```typescript
// Azure OpenAI S0 Tier
const DEFAULT_RATE = 48;  // requests per minute

// Azure OpenAI S1 Tier (higher quota)
const S1_RATE = 100;  // requests per minute

// Custom rate
const CUSTOM_RATE = 60;  // requests per minute
```

**Update Rate Limit Dynamically:**
```typescript
// In queue manager
queueManager.updateRateLimit(100);  // Increase to 100 req/min

// In batch processor
batchProcessor.updateRateLimit(100);

// In OpenAI client
openAIClient.updateRateLimit(100);
```

---

### Rate Limiting Example

```typescript
import { RateLimiter } from '@/ai-agent/core/rate-limiter/token-bucket';

// Create rate limiter (48 requests/minute)
const rateLimiter = new RateLimiter(48);

// Process meetings with rate limiting
for (const meeting of meetings) {
  // Wait for token
  await rateLimiter.waitForCapacity();

  // Make API call
  await processMeeting(meeting);
}

// Check status
const status = rateLimiter.getStatus();
console.log('Rate Limiter Status:', status);
// Output:
// {
//   available: 35.5,
//   max: 48,
//   rate: 0.8  // requests/second
// }

// Batch consumption
await rateLimiter.waitForCapacity(5);  // Wait for 5 tokens
await Promise.all([
  processmeeting1(),
  processMeeting2(),
  processMeeting3(),
  processMeeting4(),
  processMeeting5()
]);
```

---

## 13. Error Handling and Retry Logic

### Error Handling Levels

```
Level 1: Exponential Backoff (Azure OpenAI Client)
  ↓
Level 2: PM2 Process Monitoring (Auto-restart on crash)
  ↓
Level 3: API Cycle Locking (Prevent overlapping cycles)
  ↓
Level 4: Queue Error Isolation (One failure doesn't stop queue)
  ↓
Level 5: Batch Error Tracking (Track failed items separately)
  ↓
Level 6: Task Matching Fallback (Queue for review if no match)
  ↓
Level 7: Time Entry Creation Errors (Continue to next meeting)
```

---

### Level 1: Exponential Backoff

**File Location:** `src/ai-agent/core/azure-openai/client.ts`

```typescript
private async retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  retryCount: number = 0
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Special handling for rate limit errors (429)
    if (error.message?.includes('429')) {
      if (retryCount >= this.config.maxRetries) {
        throw new Error(`Max retries exceeded due to rate limiting`);
      }

      const backoffMultiplier = 2;  // 2x longer for rate limits
      const delay = this.config.retryDelay * Math.pow(2, retryCount) * backoffMultiplier;

      console.warn(`[Azure OpenAI] Rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1})`);

      await this.sleep(delay);
      return this.retryWithExponentialBackoff(operation, retryCount + 1);
    }

    // Other errors: standard exponential backoff
    if (retryCount >= this.config.maxRetries) {
      throw error;
    }

    const delay = this.config.retryDelay * Math.pow(2, retryCount);
    console.warn(`[Azure OpenAI] Request failed, retrying in ${delay}ms (attempt ${retryCount + 1})`);

    await this.sleep(delay);
    return this.retryWithExponentialBackoff(operation, retryCount + 1);
  }
}
```

**Retry Strategy:**
| Retry | Normal Error | Rate Limit (429) |
|-------|--------------|------------------|
| 1st | 1 second | 2 seconds |
| 2nd | 2 seconds | 4 seconds |
| 3rd | 4 seconds | 8 seconds |
| Max | 3 retries | 3 retries |

**Location:** `src/ai-agent/core/azure-openai/client.ts:200-240`

---

### Level 2: PM2 Auto-Restart

**Configuration:** `pm2.config.js`

```javascript
{
  autorestart: true,            // Auto-restart on crash
  max_memory_restart: '500M',   // Restart if memory > 500MB
  kill_timeout: 5000,           // 5s graceful shutdown
  restart_delay: 1000           // Wait 1s before restart
}
```

**PM2 Monitoring:**
```bash
# View restart count
pm2 list
# Shows: restarts column

# View logs during crashes
pm2 logs ai-agent --err
```

---

### Level 3: Cycle Locking

**File Location:** `ai-agent-server.js`

```javascript
async function processAllUsers() {
  // Prevent overlapping cycles
  if (global.isProcessingCycle) {
    console.log('⏸️  Processing cycle already running, skipping...');
    return;
  }

  global.isProcessingCycle = true;
  global.cycleStartTime = Date.now();

  // Set timeout to force release after 30 minutes
  const cycleTimeout = setTimeout(() => {
    const cycleAge = (Date.now() - global.cycleStartTime) / 1000;
    if (global.isProcessingCycle && cycleAge > 1800) {
      console.error('⚠️  CYCLE TIMEOUT: Forcing unlock after 30 minutes');
      global.isProcessingCycle = false;
    }
  }, 30 * 60 * 1000);

  try {
    // Process users...
  } finally {
    clearTimeout(cycleTimeout);
    global.isProcessingCycle = false;
  }
}
```

**Protection:**
- Prevents overlapping processing cycles
- Auto-releases lock after 30 minutes if hung
- Ensures only one cycle runs at a time

**Location:** `ai-agent-server.js:140-180`

---

### Level 4: Queue Error Isolation

**File Location:** `src/ai-agent/services/queue/queue-manager.ts`

```typescript
while (this.queue.length > 0) {
  const item = this.queue.shift();

  try {
    const result = await item.processFunction(item.meeting, item.userId);
    item.resolve(result);  // Success
  } catch (error) {
    console.error(`❌ Error processing "${item.meeting.subject}":`, error.message);
    item.reject(error);  // Reject promise
    // Continue to next item (don't stop queue)
  }
}
```

**Behavior:**
- One failure doesn't stop queue
- Failed items reject their promises
- Queue continues processing remaining items

**Location:** `src/ai-agent/services/queue/queue-manager.ts:80-110`

---

### Level 5: Batch Error Tracking

**File Location:** `src/ai-agent/services/meeting/batch-processor.ts`

```typescript
for (const meeting of batch) {
  try {
    await processMeeting(meeting, userId, batchId);
    batchResult.processed.push(meeting);
  } catch (error) {
    // Track failed items separately
    batchResult.failed.push({
      meeting,
      error: error as Error
    });
  }

  batchResult.completedMeetings++;  // Count as processed either way
}

// Batch completes even if some items failed
batchResult.status = 'completed';
console.log(`✅ Batch completed: ${batchResult.processed.length} succeeded, ${batchResult.failed.length} failed`);
```

**Behavior:**
- Failed items tracked in `failed` array
- Batch continues processing all items
- Returns both successes and failures
- Status = 'completed' even if some failed

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:100-140`

---

### Level 6: Task Matching Fallback

**Flow:**
```typescript
// Try to match meeting to task
const matches = await taskService.matchTasksToMeeting(meeting, userId);

if (!matches || matches.matchedTasks.length === 0) {
  // No match found - queue for review instead of failing
  console.log(`ℹ️  No task match for "${meeting.subject}", queuing for review`);

  await reviewService.queueForReview(meeting);

  // Continue to next meeting (don't throw error)
  continue;
}

// Has match - create time entry
await timeEntryService.createTimeEntry(meeting, matches.matchedTasks[0], userId);
```

**Behavior:**
- No match = queue for review (not an error)
- User can manually match later
- Processing continues

---

### Level 7: Time Entry Creation Errors

```typescript
for (const meeting of meetings) {
  try {
    await timeEntryService.createTimeEntry(meeting, task, userId);
    console.log(`✅ Time entry created for: ${meeting.subject}`);
  } catch (error) {
    console.error(`❌ Failed to create time entry for "${meeting.subject}":`, error.message);

    // Log error but continue to next meeting
    errors.push({
      meeting: meeting.subject,
      error: error.message
    });
  }
}

// Report summary
console.log(`Processed ${meetings.length} meetings: ${meetings.length - errors.length} succeeded, ${errors.length} failed`);
```

**Behavior:**
- Failed time entries logged
- Processing continues to next meeting
- User can retry manually from UI

---

### Error Handling Best Practices

**1. Never Silent Failures:**
```typescript
// ❌ Bad
try {
  await operation();
} catch (error) {
  // Silent failure
}

// ✅ Good
try {
  await operation();
} catch (error) {
  console.error('Operation failed:', error);
  // Handle or rethrow
}
```

**2. Always Log Context:**
```typescript
// ❌ Bad
console.error('Error:', error);

// ✅ Good
console.error(`Error processing meeting "${meeting.subject}" for user ${userId}:`, error);
```

**3. Validate Before Operating:**
```typescript
// ✅ Good
if (!meeting.reportId) {
  console.warn(`Skipping meeting "${meeting.subject}": no report ID`);
  return;
}

await processMeeting(meeting);
```

**4. Graceful Degradation:**
```typescript
// Try AI matching first
let match = await tryAIMatching(meeting);

if (!match) {
  // Fallback to keyword matching
  match = await tryKeywordMatching(meeting);
}

if (!match) {
  // Final fallback - queue for review
  await queueForReview(meeting);
}
```

---

## 14. Logging System

### Log Destinations

| Log Type | Destination | Purpose |
|----------|-------------|---------|
| **Standard Output** | `logs/ai-agent-out.log` | Info, success messages |
| **Standard Error** | `logs/ai-agent-error.log` | Errors, warnings |
| **Database Logs** | SQLite (implicit) | Data changes, queries |
| **Console** | PM2 console (if attached) | Real-time monitoring |

---

### Logging Formats

#### Processing Cycle Logs

```
╔════════════════════════════════════════════════════════╗
║ 🔄 STARTING NEW PROCESSING CYCLE                       ║
║ 🆔 Cycle ID: cycle_1699564800123                       ║
║ ⏰ Start Time: 2024-01-15T10:00:00.123Z                ║
╚════════════════════════════════════════════════════════╝
📊 Found 5 enabled users in database
🔄 Processing meetings for user: user@example.com
╔════════════════════════════════════════════════════════╗
║ ✅ CYCLE COMPLETED SUCCESSFULLY                        ║
║ ⏱️  Duration: 45.23s                                    ║
╚════════════════════════════════════════════════════════╝
```

**Location:** `ai-agent-server.js:145-180`

---

#### Queue Processing Logs

```
📥 QUEUE: Added meeting "Sprint Planning" [meeting-123]
📊 QUEUE STATUS: 5 items waiting
⚙️ QUEUE: Starting queue processor [queue_1699564800456]
📶 Rate limiter status: 45/48 tokens available
⏳ RATE LIMITER: Waiting for token availability...
✅ RATE LIMITER: Token acquired
🔍 PROCESSING: "Sprint Planning" [meeting-123]
✅ COMPLETED: "Sprint Planning" in 2.45s
╔════════════════════════════════════════════════════════╗
║ ✅ QUEUE: Processing cycle complete [queue_...]        ║
║ ⏱️  Duration: 15.67s                                    ║
╚════════════════════════════════════════════════════════╝
```

**Location:** `src/ai-agent/services/queue/queue-manager.ts:40-120`

---

#### Batch Processing Logs

```
╔════════════════════════════════════════════════════════╗
║ 🔄 STARTING BATCH PROCESSING [batch_123_abc]           ║
║ 📊 Total meetings: 10                                  ║
║ 🆔 Cycle ID: batch_123_abc                             ║
╚════════════════════════════════════════════════════════╝
▶️ Processing batch 1/2 (5 meetings)
✅ Acquired 5 tokens from rate limiter
  🔍 Processing: "Daily Standup" [meeting-456]
  ✅ Completed: "Daily Standup"
  🔍 Processing: "Client Call" [meeting-789]
  ✅ Completed: "Client Call"
  ...
✅ Batch 1/2 completed
✓ Progress: 5/10 meetings
⏳ Waiting 1s before next batch...
▶️ Processing batch 2/2 (5 meetings)
...
╔════════════════════════════════════════════════════════╗
║ ✅ BATCH COMPLETED [batch_123_abc]                     ║
║ ⏱️  Duration: 30.45s                                    ║
║ 📊 Processed: 10/10                                    ║
║ ❌ Failed: 0                                           ║
╚════════════════════════════════════════════════════════╝
```

**Location:** `src/ai-agent/services/meeting/batch-processor.ts:50-150`

---

#### Azure OpenAI Logs

```
[Azure OpenAI] Analyzing meeting: "Sprint Planning"
[Azure OpenAI] Request: {
  "deployment": "gpt-5",
  "endpoint": "https://xxx.openai.azure.com",
  "body": { ... }
}
[Azure OpenAI] Full API Response: {
  "choices": [{ "message": { "content": "..." } }],
  "usage": { "total_tokens": 250 }
}
```

**Location:** `src/ai-agent/core/azure-openai/client.ts:60-90`

---

#### Task Matching Logs

```
Matching tasks for meeting: "Sprint Planning"
Available tasks: 25
Found 3 matches for meeting: "Sprint Planning"
  1. Sprint Planning & Retrospective (confidence: 0.95)
  2. Project Planning (confidence: 0.65)
  3. Meeting - General (confidence: 0.30)
Matching complete for user: user@example.com
```

**Location:** `src/ai-agent/services/task/intervals.ts:80-120`

---

#### Time Entry Creation Logs

```
Creating time entry for meeting: "Sprint Planning"
Person ID: 123456
Task: Sprint Planning & Retrospective
Project: Mobile App (456)
Module: Project Management (234)
Work Type: India-Meeting (813419)
Duration: 3600s → 1.0h
Date (IST): 2025-01-15
✅ Successfully created time entry for: "Sprint Planning"
✅ Successfully saved posted meeting to database
```

**Location:** `src/ai-agent/services/time-entry/intervals.ts:50-120`

---

### Log Analysis Commands

**View last 100 lines:**
```bash
tail -100 logs/ai-agent-out.log
```

**Follow logs in real-time:**
```bash
tail -f logs/ai-agent-out.log
```

**Search for errors:**
```bash
grep "❌" logs/ai-agent-out.log
grep "Error" logs/ai-agent-error.log
```

**Count successful cycles:**
```bash
grep "CYCLE COMPLETED" logs/ai-agent-out.log | wc -l
```

**Find specific meeting:**
```bash
grep "Sprint Planning" logs/ai-agent-out.log
```

**View PM2 logs:**
```bash
pm2 logs ai-agent --lines 200
```

---

### Structured Log Data

Each log entry typically includes:
- **Timestamp:** When event occurred
- **Emoji:** Visual indicator (🔄 = processing, ✅ = success, ❌ = error)
- **Component:** Which service generated log
- **Context:** Meeting subject, user ID, etc.
- **Metrics:** Duration, counts, percentages

**Example Structured Entry:**
```
[2025-01-15 10:15:23] 🔍 PROCESSING: "Sprint Planning" [meeting-123] | User: user@example.com | Duration: 3600s | Report: report-abc
```

---

## 15. Comparison: AI Agent vs Manual Workflow

### Complete Feature Comparison

| Feature | Manual Workflow | AI Agent Workflow |
|---------|----------------|-------------------|
| **Trigger** | User clicks "Fetch Meetings" | Automatic every 30 minutes |
| **Authentication** | Delegated (user must log in) | Application (no user login) |
| **Graph API Permissions** | `User.Read`, `Calendars.Read` (delegated) | `User.Read.All`, `Calendars.Read`, `OnlineMeetings.Read.All` (application) |
| **Meeting Retrieval** | On-demand, user-selected date range | Automated, last 30 days |
| **Task Matching** | Manual selection from dropdown | AI-powered automatic matching |
| **Confidence Scoring** | N/A (user decides) | 0-1.0 score from AI |
| **Time Entry Creation** | User clicks "Post" button | Automatic if confidence high |
| **Unmatched Meetings** | User must manually match or skip | Queued for review automatically |
| **Review Queue** | N/A | Dedicated review system |
| **Processing Speed** | Immediate (user waits) | Batched (max 30 min delay) |
| **Error Handling** | User sees error, retries manually | Automatic retry, queue for review |
| **Database Updates** | On-demand | Every 30 minutes |
| **User Interaction** | Required for every meeting | One-time enable + periodic reviews |
| **Timezone** | Browser timezone | IST (hardcoded) |
| **Rate Limiting** | N/A (single user) | Token bucket, 48 req/min |
| **Logging** | Browser console | PM2 logs, file logs |
| **Monitoring** | N/A | PM2 status, system status API |
| **Scalability** | One user at a time | Multiple users in parallel |

---

### Workflow Comparison Diagram

**Manual Workflow:**
```
User Logs In
  ↓
User Opens Dashboard
  ↓
User Selects Date Range
  ↓
User Clicks "Fetch Meetings"
  ↓
Meetings Displayed
  ↓
User Clicks "Match Tasks"
  ↓
Matches Displayed
  ↓
User Reviews Each Match
  ↓
User Clicks "Post" for Each Meeting
  ↓
Time Entry Created
  ↓
User Verifies in Intervals
```

**AI Agent Workflow:**
```
User Enables AI Agent (One-Time)
  ↓
[Wait 30 minutes]
  ↓
PM2 Cycle Starts Automatically
  ↓
Fetch Meetings for All Enabled Users
  ↓
Analyze Meetings (Azure OpenAI)
  ↓
Match Tasks (AI-powered)
  ↓
IF High Confidence:
  → Create Time Entry Automatically
  → Save to Database
  → User sees in "Posted Meetings"
ELSE:
  → Queue for Review
  → User sees in "Review Queue"
  ↓
[Wait 30 minutes, repeat]
```

---

### When to Use Which Workflow

**Use Manual Workflow When:**
- User wants immediate processing (can't wait 30 min)
- User wants full control over task selection
- User processes meetings infrequently (< once/week)
- User needs to verify before posting
- User has complex matching requirements

**Use AI Agent When:**
- User has regular meetings (daily/weekly)
- Meetings follow consistent patterns
- User trusts AI matching
- User wants hands-off automation
- Large volume of meetings (20+ per week)

---

### Data Flow Comparison

**Manual Workflow Data Flow:**
```
1. User Session (NextAuth) → Access Token
2. Frontend → GET /api/meetings → Graph API → Meetings
3. Frontend → POST /api/meetings/match → OpenAI → Matches
4. User Reviews → Selects Task
5. Frontend → POST /api/intervals-proxy → Intervals API → Time Entry
6. Frontend → Save to SQLite
```

**AI Agent Data Flow:**
```
1. PM2 Cycle Timer → processAllUsers()
2. Get Enabled Users from SQLite
3. For Each User:
   a. Get App Token → Graph API → Meetings
   b. Queue → OpenAI Analysis → Analyzed Meetings
   c. Task Service → OpenAI Matching → Matched Tasks
   d. IF Match: Time Entry Service → Intervals API → Time Entry
   e. ELSE: Review Service → SQLite Review Queue
4. Save to SQLite
```

---

## 16. User Enablement/Disablement

### How Users Enable AI Agent

**Step 1: User Navigates to Dashboard**
- Opens application
- Logs in (NextAuth → Azure AD)
- Sees AI Agent toggle in UI

**Step 2: User Enables AI Agent**
```
User Clicks Toggle → ON
  ↓
Frontend Sends Request:
  POST /api/user/settings
  { enabled: true }
  ↓
Backend Updates Database:
  INSERT INTO user_settings (user_id, enabled)
  VALUES ('user@example.com', 1)
  ↓
Response: { success: true, enabled: true }
  ↓
UI Shows: "AI Agent Enabled ✅"
```

**Step 3: Next PM2 Cycle Picks Up User**
```
30 minutes later...
  ↓
PM2 Cycle: getAllEnabledUsers()
  ↓
Query: SELECT * FROM user_settings WHERE enabled = 1
  ↓
Returns: ['user@example.com', 'user2@example.com', ...]
  ↓
Process Meetings for Each User
```

---

### Database Schema for Enablement

**Table:** `user_settings`

```sql
CREATE TABLE user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT false,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
)
```

**Key Points:**
- `enabled` = 1 (true) or 0 (false)
- `user_id` is unique (one setting per user)
- Foreign key cascade delete (if user deleted, settings deleted too)

---

### API Endpoints

**1. Enable/Disable (Next.js API)**
```typescript
// POST /api/user/settings
export async function POST(request: Request) {
  const { enabled } = await request.json();
  const session = await getServerSession();
  const userId = session.user.email;

  const db = AppDatabase.getInstance();

  // Create user if doesn't exist
  let user = db.getUserByEmail(userId);
  if (!user) {
    db.createUser({ user_id: userId, email: userId });
  }

  // Update settings
  db.updateUserSettings(userId, enabled);

  return Response.json({ success: true, enabled });
}
```

**Location:** `src/app/api/user/settings/route.ts`

---

**2. Get Status (Next.js API)**
```typescript
// GET /api/user/settings
export async function GET(request: Request) {
  const session = await getServerSession();
  const userId = session.user.email;

  const db = AppDatabase.getInstance();
  const settings = db.getUserSettings(userId);

  return Response.json({
    success: true,
    enabled: settings?.enabled || false,
    userId
  });
}
```

**Location:** `src/app/api/user/settings/route.ts`

---

**3. System Status (PM2 Server)**
```javascript
// GET localhost:3100/api/status
app.get('/api/status', (req, res) => {
  const enabledUsers = getAllEnabledUsers();
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();

  res.json({
    success: true,
    status: 'running',
    enabledUsers: enabledUsers.length,
    totalUsers: totalUsers.count,
    uptime: process.uptime(),
    isProcessing: global.isProcessingCycle || false
  });
});
```

**Location:** `ai-agent-server.js:280-300`

---

### UI Components

**Toggle Switch:**
```tsx
// src/components/ai-agent-view.tsx
<div className="flex items-center space-x-2">
  <Switch
    id="ai-agent-toggle"
    checked={enabled}
    onCheckedChange={async (checked) => {
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checked })
      });

      if (response.ok) {
        setEnabled(checked);
        toast({
          title: checked ? 'AI Agent Enabled' : 'AI Agent Disabled',
          description: checked
            ? 'Your meetings will be processed automatically every 30 minutes'
            : 'Automatic processing has been stopped'
        });
      }
    }}
  />
  <Label htmlFor="ai-agent-toggle">
    {enabled ? 'Enabled ✅' : 'Disabled'}
  </Label>
</div>
```

**Location:** `src/components/ai-agent-view.tsx:50-80`

---

### What Happens When User Disables

**Step 1: User Clicks Toggle → OFF**
```
Frontend Sends:
  POST /api/user/settings
  { enabled: false }
  ↓
Backend Updates:
  UPDATE user_settings SET enabled = 0 WHERE user_id = '...'
  ↓
Response: { success: true, enabled: false }
```

**Step 2: Next PM2 Cycle**
```
PM2 Cycle: getAllEnabledUsers()
  ↓
Query: SELECT * FROM user_settings WHERE enabled = 1
  ↓
User NOT in results (enabled = 0)
  ↓
User's meetings NOT processed
```

**Step 3: Existing Data**
- Already-queued meetings: Remain in queue (user can complete)
- Posted meetings: NOT deleted (remain in Intervals)
- Review queue: Remains (user can approve/reject later)
- Settings: Remain in database (can re-enable anytime)

---

### Bulk User Management

**Admin Can Enable Multiple Users:**
```sql
-- Enable all users in specific domain
UPDATE user_settings
SET enabled = 1
WHERE user_id IN (
  SELECT user_id FROM users
  WHERE email LIKE '%@company.com'
);
```

**Admin Can View Statistics:**
```sql
-- Count enabled users
SELECT
  COUNT(*) FILTER (WHERE enabled = 1) as enabled_count,
  COUNT(*) FILTER (WHERE enabled = 0) as disabled_count
FROM user_settings;
```

---

## 17. Monitoring and Troubleshooting

### Monitoring Tools

#### 1. PM2 Command-Line Monitoring

**Check Process Status:**
```bash
pm2 list
# Shows: name, status, cpu, memory, restarts, uptime
```

**Example Output:**
```
┌─────┬────────────┬─────────┬─────────┬───────┬────────┬─────────┐
│ id  │ name       │ mode    │ ↺       │ status│ cpu    │ memory  │
├─────┼────────────┼─────────┼─────────┼───────┼────────┼─────────┤
│ 0   │ ai-agent   │ fork    │ 0       │ online│ 0%     │ 120 MB  │
└─────┴────────────┴─────────┴─────────┴───────┴────────┴─────────┘
```

**Monitor in Real-Time:**
```bash
pm2 monit
# Interactive dashboard with live stats
```

**View Detailed Info:**
```bash
pm2 describe ai-agent
# Shows: PID, uptime, script path, logs, memory, environment
```

---

#### 2. Log Monitoring

**View Recent Logs:**
```bash
# Last 200 lines
pm2 logs ai-agent --lines 200

# Only errors
pm2 logs ai-agent --err

# Only output
pm2 logs ai-agent --out

# Follow logs in real-time
pm2 logs ai-agent --lines 0
```

**Search Logs:**
```bash
# Find specific meeting
grep "Sprint Planning" logs/ai-agent-out.log

# Find errors
grep "❌\|Error" logs/ai-agent-out.log

# Find cycle completions
grep "CYCLE COMPLETED" logs/ai-agent-out.log

# Count processing cycles today
grep "STARTING NEW PROCESSING CYCLE" logs/ai-agent-out.log | \
  grep $(date +%Y-%m-%d) | wc -l
```

---

#### 3. HTTP Status Endpoints

**System Status:**
```bash
curl http://localhost:3100/api/status
```

**Response:**
```json
{
  "success": true,
  "status": "running",
  "enabledUsers": 5,
  "totalUsers": 12,
  "uptime": 86400.5,
  "isProcessing": false,
  "lastCycleStart": "2025-01-15T10:00:00.000Z"
}
```

**User Status:**
```bash
curl "http://localhost:3100/api/agent-status?userId=user@example.com"
```

**Response:**
```json
{
  "success": true,
  "enabled": true
}
```

---

#### 4. Database Queries

**Check Enabled Users:**
```sql
SELECT u.email, us.enabled, us.updated_at
FROM users u
JOIN user_settings us ON u.user_id = us.user_id
WHERE us.enabled = 1;
```

**Check Recent Posted Meetings:**
```sql
SELECT
  user_id,
  COUNT(*) as total_posted,
  MAX(posted_at) as last_posted
FROM meetings
WHERE posted_at > datetime('now', '-7 days')
GROUP BY user_id;
```

**Check Pending Reviews:**
```sql
SELECT
  user_id,
  COUNT(*) as pending_reviews
FROM reviews
WHERE status = 'pending'
GROUP BY user_id;
```

---

### Common Issues and Solutions

#### Issue 1: AI Agent Not Processing

**Symptoms:**
- No new time entries created
- Logs show no processing cycles
- PM2 status shows "stopped"

**Diagnosis:**
```bash
# Check PM2 status
pm2 list

# Check logs for errors
pm2 logs ai-agent --err --lines 50

# Check if process is running
ps aux | grep ai-agent-server
```

**Solutions:**
```bash
# Restart PM2 process
pm2 restart ai-agent

# If still not working, delete and recreate
pm2 delete ai-agent
npm run pm2:start

# Check environment variables
pm2 env ai-agent
```

---

#### Issue 2: High Memory Usage

**Symptoms:**
- Memory > 400MB
- PM2 auto-restarts frequently
- Slow processing

**Diagnosis:**
```bash
# Check memory usage
pm2 list
pm2 describe ai-agent

# Monitor memory over time
pm2 monit
```

**Solutions:**
```bash
# Restart process (clears memory)
pm2 restart ai-agent

# Increase memory limit
# Edit pm2.config.js: max_memory_restart: '1G'
pm2 delete ai-agent
npm run pm2:start

# Check for memory leaks in logs
grep "memory" logs/ai-agent-out.log
```

---

#### Issue 3: Processing Cycle Hangs

**Symptoms:**
- `isProcessing` stays true for > 30 minutes
- No new cycles starting
- Logs show "cycle already running"

**Diagnosis:**
```bash
# Check status
curl http://localhost:3100/api/status
# Look for: isProcessing: true, lastCycleStart: > 30 min ago

# Check logs
grep "CYCLE TIMEOUT" logs/ai-agent-out.log
```

**Solutions:**
```bash
# Restart process (releases lock)
pm2 restart ai-agent

# If timeout protection didn't work, force restart
pm2 delete ai-agent && npm run pm2:start
```

---

#### Issue 4: Rate Limit Errors

**Symptoms:**
- Logs show "429" errors
- Processing extremely slow
- Many retries

**Diagnosis:**
```bash
grep "429\|Rate limit" logs/ai-agent-out.log

# Count rate limit hits
grep "429" logs/ai-agent-out.log | wc -l
```

**Solutions:**
1. **Reduce request rate:**
   - Edit rate limiter: 48 req/min → 30 req/min
   - Increase batch delay: 1s → 2s

2. **Upgrade Azure OpenAI tier:**
   - S0 → S1 (higher quota)
   - Update rate limiter to 100 req/min

3. **Spread processing:**
   - Process users sequentially instead of parallel
   - Add delays between users

---

#### Issue 5: Database Locked

**Symptoms:**
- Errors: "database is locked"
- Failed to save meetings
- SQLite errors in logs

**Diagnosis:**
```bash
grep "locked\|SQLITE" logs/ai-agent-error.log
```

**Solutions:**
```bash
# Check if multiple processes accessing database
ps aux | grep "ai-agent\|next"

# Stop all processes
pm2 stop all

# Restart one at a time
npm run pm2:start
npm run dev

# If persistent, check file permissions
ls -l data/application.sqlite
```

---

#### Issue 6: No Meetings Found

**Symptoms:**
- Processing runs but finds 0 meetings
- User has meetings in calendar
- Logs show "No meetings found"

**Diagnosis:**
```bash
# Check Graph API token
curl -H "Authorization: Bearer $(cat token.txt)" \
  https://graph.microsoft.com/v1.0/me

# Check user enablement
sqlite3 data/application.sqlite \
  "SELECT * FROM user_settings WHERE user_id = 'user@example.com'"

# Check logs for Graph API errors
grep "Graph\|401\|403" logs/ai-agent-error.log
```

**Solutions:**
1. **Check permissions:**
   - Verify app has `Calendars.Read`, `OnlineMeetings.Read.All`
   - Re-grant admin consent in Azure portal

2. **Check date range:**
   - AI agent fetches last 30 days
   - Meetings might be outside range

3. **Check meeting type:**
   - Only processes Teams meetings
   - Regular calendar events skipped

---

### Health Check Script

**Create:** `scripts/health-check.sh`

```bash
#!/bin/bash

echo "=== AI Agent Health Check ==="
echo ""

# 1. PM2 Status
echo "1. PM2 Process Status:"
pm2 list | grep ai-agent
echo ""

# 2. Memory Usage
echo "2. Memory Usage:"
pm2 describe ai-agent | grep memory
echo ""

# 3. Recent Errors
echo "3. Recent Errors (last 10):"
grep "❌\|Error" logs/ai-agent-out.log | tail -10
echo ""

# 4. System Status
echo "4. System Status:"
curl -s http://localhost:3100/api/status | jq .
echo ""

# 5. Enabled Users
echo "5. Enabled Users:"
sqlite3 data/application.sqlite \
  "SELECT COUNT(*) FROM user_settings WHERE enabled = 1"
echo ""

# 6. Recent Processing
echo "6. Processing Cycles (last 24h):"
grep "CYCLE COMPLETED" logs/ai-agent-out.log | \
  grep $(date -d "yesterday" +%Y-%m-%d) | wc -l
echo ""

echo "=== Health Check Complete ==="
```

**Run:**
```bash
chmod +x scripts/health-check.sh
./scripts/health-check.sh
```

---

### Alerting Setup

**Monitor Process Uptime:**
```bash
# Cron job to check every 5 minutes
*/5 * * * * /usr/local/bin/pm2 ping | grep -q "pong" || /usr/local/bin/pm2 restart ai-agent
```

**Monitor Memory:**
```bash
# Alert if memory > 450MB
*/10 * * * * if [ $(pm2 jlist | jq '.[0].monit.memory') -gt 471859200 ]; then echo "High memory" | mail -s "Alert" admin@example.com; fi
```

**Monitor Cycles:**
```bash
# Alert if no cycles in last hour
0 * * * * if [ $(grep -c "CYCLE COMPLETED" logs/ai-agent-out.log | grep $(date +%Y-%m-%d\ %H)) -eq 0 ]; then echo "No cycles" | mail -s "Alert" admin@example.com; fi
```

---

## Summary of Part 2

This document (Part 2) covers the operational aspects of the AI Agent:

✅ **Time Entry Creation** - Complete automatic workflow
✅ **Review System** - Queue management for unmatched meetings
✅ **Attendance Report Management** - Validation and selection
✅ **Rate Limiting** - Token bucket algorithm
✅ **Error Handling** - 7 levels of resilience
✅ **Logging System** - Comprehensive logging formats
✅ **Workflow Comparison** - Manual vs AI Agent
✅ **User Enablement** - Database-backed enablement tracking
✅ **Monitoring** - Tools, queries, troubleshooting guide

---

**Document Maintained By:** Development Team
**For Questions or Updates:** Refer to CLAUDE.md or project README.md
**Previous:** See TECHNICAL_DOCUMENTATION_AI_AGENT_PART1.md
**See Also:** TECHNICAL_DOCUMENTATION_MANUAL_WORKFLOW.md
