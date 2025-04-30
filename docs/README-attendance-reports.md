# Attendance Report Handler

## Quick Start

```typescript
import { AttendanceReportManager } from './services/meeting/attendance-report-manager';

// Initialize manager
const reportManager = new AttendanceReportManager();

// Process reports
const result = await reportManager.processAttendanceReports(
    reports,          // Array of attendance reports
    meetingDate,      // Target meeting date
    isRecurring       // Whether this is a recurring meeting
);
```

## Features

- 🎯 Smart report selection for recurring meetings
- 🤖 AI-powered decision making
- ✅ Date-based validation
- 🔄 Fallback mechanisms
- 📊 Detailed metadata

## Usage Guide

### 1. Basic Usage

```typescript
const reports = [
    {
        id: "report-1",
        meetingStartDateTime: "2025-04-29T06:29:19.173Z",
        meetingEndDateTime: "2025-04-29T06:35:33.487Z",
        totalParticipantCount: 1
    }
];

const result = await reportManager.processAttendanceReports(
    reports,
    "2025-04-29T00:00:00Z",
    true
);
```

### 2. Handling Results

```typescript
if (result.selectedReportId) {
    console.log(`Selected report: ${result.selectedReportId}`);
    console.log(`Confidence: ${result.confidence}`);
    console.log(`Reason: ${result.reason}`);
    
    // Access metadata
    const { date, duration, isRecurring, totalReports } = result.metadata;
} else {
    console.log('No valid report found');
}
```

### 3. Error Handling

```typescript
try {
    const result = await reportManager.processAttendanceReports(
        reports,
        meetingDate,
        isRecurring
    );
} catch (error) {
    console.error('Error processing reports:', error);
}
```

## Validation Rules

1. Date Matching
   - Reports must match meeting date
   - Timezone differences are handled
   - Strict validation for recurring meetings

2. Duration Validation
   - Must be positive
   - Must be reasonable length
   - Zero durations are rejected

3. Recurring Meeting Rules
   - Only use reports from current instance
   - Never use previous instance data
   - Date-specific validation

## AI Selection Criteria

The AI considers:
- Date accuracy
- Duration validity
- Participant count
- Meeting context
- Historical patterns

## Troubleshooting

### Common Issues

1. No Report Selected
```typescript
// Check if any reports were valid
if (result.metadata.totalReports === 0) {
    console.log('No reports available');
} else if (!result.selectedReportId) {
    console.log('No valid reports for date:', result.metadata.date);
}
```

2. Wrong Report Selected
```typescript
// Verify date matching
const isDateMatch = result.metadata.date === expectedDate;
if (!isDateMatch) {
    console.log('Date mismatch in selected report');
}
```

### Best Practices

1. Always provide accurate meeting dates
2. Include all available reports
3. Specify recurring status correctly
4. Handle timezone differences
5. Implement proper error handling

## Example Scenarios

### 1. Single Report

```typescript
const reports = [oneReport];
const result = await reportManager.processAttendanceReports(
    reports,
    meetingDate,
    false
);
// Will select the report if valid
```

### 2. Multiple Reports

```typescript
const reports = [report1, report2, report3];
const result = await reportManager.processAttendanceReports(
    reports,
    meetingDate,
    true
);
// Will use AI to select best report
```

### 3. No Valid Reports

```typescript
const reports = [oldReport];
const result = await reportManager.processAttendanceReports(
    reports,
    currentDate,
    true
);
// Will return empty selection with reason
``` 