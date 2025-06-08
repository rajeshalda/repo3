import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import ReactMarkdown from 'react-markdown';

const releaseNotes = `
# 📌 Meeting Time Tracker - Release Notes

&nbsp;

## 🌟 Version 2.2.2 (June 2025)

&nbsp;

### 🔧 Timezone Bug Fixes
- 🌏 Fixed timezone bug: ensure same meeting count across all timezones
- 📅 Fixed convertDateRangeToUTC to preserve calendar dates
- 🔄 Removed redundant date manipulation in API and frontend
- ✅ Now all users see same meetings for same calendar date regardless of timezone

&nbsp;

### 🎨 UI Improvements
- 🖥️ Clarify timezone display and standardize font sizes in AI Agent view

&nbsp;

### 📊 Recurring Meetings Fix
- 🔁 Display multiple attendance sessions separately for recurring meetings
- 🛠️ Fix backend to preserve separate records for different report IDs
- 📋 Update frontend to show each attendance session as individual table row
- 🎯 Fix API matching to process each session separately during task assignment
- 🧹 Remove redundant frontend date filtering
- 🔢 Improve display of multi-session meetings with session numbering

Fixes issue where recurring meetings with multiple attendance sessions were being merged into single entries instead of showing separately.

&nbsp;

### 💰 Attendance Processing Improvements
- 📊 Process all attendance reports for recurring meetings
- ➕ Add processAllValidReports() method to handle multiple reports
- 🔄 Create separate meeting instances for each unposted report ID
- 📈 Fetch specific attendance data per report for accurate billing
- 💵 Prevents missing revenue from users rejoining recurring meetings

&nbsp;

### 🏷️ UI Text Updates
- 📝 Change "Not Attended" to "Meeting did not start" in duration column

&nbsp;

### 🔄 Review Queue Fixes
- 🤖 Fix AI agent not processing existing review queue meetings
- ➕ Add missing review queue removal for manual posting
- 🎯 Implement reportId-based matching for reliable deduplication
- 🎨 Enhance UI state management for immediate updates
- 🛡️ Add comprehensive error handling and logging

Fixes issues where meetings would remain in review queue after posting, requiring manual page refresh. Both AI agent and manual posting now consistently remove meetings from review queue immediately.

&nbsp;

---

&nbsp;

## ⚠️ Important Note from Dev Team

**AI Agent Time Window Behavior:**
- 🕐 Agent skips meetings between 12:00 AM - 5:30 AM UTC (intended behavior)
- ✅ Agent resumes processing after 5:30 AM UTC 
- 🖱️ Manual posting works normally for early morning meetings
- 🎯 This prevents duplicate entries - not a malfunction

*If you need to post meetings during 12:00 AM - 5:30 AM UTC, use manual posting.*
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