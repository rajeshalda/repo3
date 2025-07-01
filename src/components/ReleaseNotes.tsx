import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import ReactMarkdown from 'react-markdown';

const releaseNotes = `
# Meeting Time Tracker - Release Notes

## Version 2.2.2 (June 2025)

### Timezone Bug Fixes
- **Timezone Consistency**: Resolved timezone-related issues to ensure consistent meeting count across all user timezones
- **Date Range Conversion**: Fixed convertDateRangeToUTC function to properly preserve calendar dates
- **Data Processing**: Eliminated redundant date manipulation in both API and frontend components
- **User Experience**: All users now see identical meetings for the same calendar date regardless of their timezone setting

### User Interface Improvements
- **Display Clarity**: Enhanced timezone display formatting and standardized font sizes in AI Agent view
- **Visual Consistency**: Improved overall interface consistency and readability

### Recurring Meetings Enhancement
- **Session Display**: Multiple attendance sessions for recurring meetings are now displayed separately
- **Backend Processing**: Enhanced backend logic to maintain separate records for different report IDs
- **Frontend Updates**: Modified frontend to display each attendance session as individual table rows
- **API Matching**: Improved API matching logic to process each session separately during task assignment
- **Code Optimization**: Removed redundant frontend date filtering logic
- **Session Identification**: Added session numbering for better identification of multi-session meetings

**Issue Resolved**: Fixed a critical issue where recurring meetings with multiple attendance sessions were incorrectly merged into single entries instead of being displayed separately.

### Attendance Processing Improvements
- **Comprehensive Processing**: Enhanced system to process all attendance reports for recurring meetings
- **Method Enhancement**: Added processAllValidReports() method to handle multiple reports efficiently
- **Instance Creation**: Implemented separate meeting instance creation for each unposted report ID
- **Data Accuracy**: Enhanced attendance data fetching to ensure accurate billing per report
- **Revenue Protection**: Prevents revenue loss from users who rejoin recurring meetings

### Interface Text Updates
- **Status Clarity**: Updated duration column text from "Not Attended" to "Meeting did not start" for better clarity

### Review Queue System Fixes
- **AI Agent Processing**: Resolved issue preventing AI agent from processing existing review queue meetings
- **Manual Posting**: Added missing review queue removal functionality for manual posting operations
- **Matching Algorithm**: Implemented reportId-based matching for reliable deduplication
- **State Management**: Enhanced UI state management for immediate user interface updates
- **Error Handling**: Added comprehensive error handling and logging capabilities

**Issue Resolved**: Fixed critical issues where meetings would remain in the review queue after posting, previously requiring manual page refresh. Both AI agent and manual posting operations now consistently remove meetings from the review queue immediately upon completion.
`;

export function ReleaseNotes() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Release Notes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Release Notes</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{releaseNotes}</ReactMarkdown>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
} 