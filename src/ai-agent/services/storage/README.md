# AI Agent Storage Service

This service handles storage of AI Agent data, including posted meetings and review decisions.

## Posted Meetings Storage

The AIAgentPostedMeetingsStorage class is responsible for storing meetings that have been posted to Intervals.

### Key Features

- **Deduplication**: Prevents duplicate time entries by checking for existing meetings with the same meetingId, date, or reportId.
- **Report ID Tracking**: Uses attendance report IDs to track unique meeting instances for recurring meetings.
- **JSON Storage**: Stores data in JSON format for easy inspection and debugging.

### Meeting Identification

Meetings can be identified in several ways:

1. **Meeting ID + Date**: The primary way to identify a meeting.
2. **Report ID**: A unique identifier for each meeting attendance instance, especially useful for recurring meetings.
3. **Description + Date + Duration**: Used as a fallback for manual entries.

### Report ID

The `reportId` field is particularly important as it comes from Microsoft Graph API's attendance reports and uniquely identifies a specific meeting instance regardless of whether it's a recurring meeting or not. This allows for more accurate deduplication.

- When a meeting is posted from the review section, the reportId is retrieved from the review meeting record.
- The reportId is included when creating new meeting entries and can be updated later if needed.
- Deduplication logic checks for matching reportIds to prevent duplicate entries.

## Usage

```typescript
// Create a new instance
const storage = new AIAgentPostedMeetingsStorage();

// Add a posted meeting
await storage.addPostedMeeting(userId, {
  meetingId: "AAMkA...",
  userId: "user@example.com",
  timeEntry: { ... },
  rawResponse: { ... },
  postedAt: new Date().toISOString(),
  reportId: "3184fd0a-2b8c-4ae5-9d70-e669d1365b90" // Attendance report ID
});

// Update reportId for an existing meeting
await storage.updatePostedMeetingReportId(
  userId,
  meetingId,
  reportId
);

// Check if a meeting is already posted
const isPosted = await storage.isPosted(
  userId,
  meetingId,
  durationInSeconds,
  dateTime,
  reportId
);
```

## File Structure

- `ai-agent-meetings.json`: Stores all posted meetings with their time entries and reportIds.
- `reviews.json`: Stores meetings pending review, also including reportIds.
- `review-decisions.json`: Stores decisions made about reviewed meetings. 