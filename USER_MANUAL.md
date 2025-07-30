# Meeting Time Tracker - User Manual
## Complete Guide to Automated Meeting Time Tracking and AI-Powered Task Matching

---

## Abstract

Meeting Time Tracker automates the conversion of Microsoft Teams meeting attendance into Intervals time entries using AI-powered task matching. This manual guides users through both manual and automated workflows, from initial setup to advanced features.

The application offers dual operation modes: manual control for precise meeting-to-task matching, and AI agent automation for hands-free time tracking. Key features include real-time attendance tracking, intelligent task suggestions, and automated time entry creation.

**Target Audience**: End users, project managers, and team leads using Microsoft Teams and Intervals for time tracking.

**Prerequisites**: Microsoft 365 account with Teams access and Intervals time tracking account.

---

## Table of Contents
1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Manual Meeting Management](#manual-meeting-management)
4. [AI Agent Features](#ai-agent-features)
5. [Settings & Configuration](#settings--configuration)
6. [Troubleshooting](#troubleshooting)
7. [Tips for Best Results](#tips-for-best-results)

---

## Getting Started

### What is Meeting Time Tracker?

Meeting Time Tracker is a powerful web application that automatically tracks your Microsoft Teams meeting attendance and creates time entries in Intervals time tracking system. It eliminates the need for manual time entry by:

- **Fetching meetings directly from Microsoft Teams** - Real attendance time tracking
- **AI-powered task matching** - Intelligent matching of meetings to project tasks
- **Automated time entry creation** - Seamless integration with Intervals
- **Two working modes** - Manual control or fully automated AI agent

### System Requirements

- **Browser**: Modern web browser (Chrome, Edge, Firefox, Safari)
- **Accounts Required**:
  - Microsoft 365 account with Teams access
  - Intervals time tracking account with API access
- **Permissions**: Microsoft Teams application access policies (configured by admin)

### First Time Setup

1. **Access the Application**
   - Navigate to your Meeting Time Tracker URL
   - You'll see the login page with Microsoft authentication

   *[Image Suggestion: Screenshot of login page showing Microsoft authentication button]*

2. **Sign In with Microsoft**
   - Click "Sign in with Microsoft" button
   - Enter your Microsoft 365 credentials
   - Grant permissions when prompted

   *[Image Suggestion: Screenshot of Microsoft OAuth consent screen]*

3. **Configure Intervals API Key**
   - On first login, you'll see an API key dialog
   - To get your Intervals API key:
     - Log into your Intervals account
     - Go to **My Account** → **API Access** (under Options)
     - Generate or view your API Access Token (11-character code like: `a78828gq6t4`)
     - Copy and paste the token into the dialog
   - Click "Save Key"

   *[Image Suggestion: Screenshot of Intervals API key dialog with example token]*

4. **Verify Setup**
   - Dashboard should load showing your user profile
   - Status indicators should show green for Microsoft Graph and Intervals APIs

   *[Image Suggestion: Screenshot of successful dashboard with green status indicators]*

---

## Dashboard Overview

### Main Interface

The dashboard features a clean, modern interface with:

- **Header Bar**: Logo, app name, date picker, user profile menu
- **Sidebar**: Navigation between Manual and AI Agent modes
- **Main Content**: Different views based on selected mode
- **Footer**: Version information and copyright

*[Image Suggestion: Full dashboard screenshot with labeled UI elements (header, sidebar, main content, footer)]*

### Navigation Options

**Manual Mode** - Direct control over meeting processing
**AI Agent Mode** - Automated processing with AI assistance

### Status Indicators

Throughout the app, you'll see status indicators for:
- ✅ **Green**: Service connected and working
- ⚠️ **Yellow**: Warning or attention needed
- ❌ **Red**: Error or service unavailable
- 🔄 **Loading**: Processing in progress

---

## Manual Meeting Management

### Selecting Date Range

1. **Choose Your Time Period**
   - Click the date range picker in the main interface
   - Select start date (From) and end date (To)
   - **Important**: Select one day after your intended date due to timezone processing
   - Click outside the picker to confirm selection

2. **Fetch Meetings**
   - Meetings automatically load for the selected date range
   - Loading indicator shows progress
   - You'll see a summary of total meetings and attendance time

### Understanding Meeting Data

**Meeting Overview Cards**
- **Total Meetings**: Number of meetings in selected date range
- **Total Time**: Your actual attendance time (not scheduled time)

*[Image Suggestion: Screenshot of meeting overview cards showing statistics]*

**Meeting List Table** shows:
- **Meeting Name**: Subject line from Teams
- **Schedule Date/Time**: When the meeting was scheduled
- **Schedule Duration**: Originally planned meeting length
- **Attended Duration**: How long you actually participated
- **Attendance Status**: Attended (green) or Not Attended (gray)

*[Image Suggestion: Screenshot of meeting list table with sample data showing different attendance statuses]*

### Working with Meetings

**Viewing Meeting Details**
- Each row shows one meeting attendance record
- Teams meetings display a "Teams" badge
- Multiple attendance records for the same meeting are shown separately
- Scheduled vs. actual times are clearly differentiated

**Meeting Status**
- **Attended**: Green checkmark - you joined and participated
- **Not Attended**: Gray X - meeting scheduled but you didn't join

### Task Matching Process

1. **Fetch Your Meetings** (as described above)

2. **Match Tasks**
   - Click the blue "Match Tasks" button
   - AI analyzes each meeting and suggests matching Intervals tasks
   - Progress indicator shows matching in progress
   - Results appear in the "Task Matches" tab

3. **Review Match Results**
   - Switch to "Task Matches" tab to see results
   - Matches are organized by confidence level:
     - **High Confidence** (80%+): Very likely correct matches
     - **Medium Confidence** (50-79%): Probably correct, review recommended
     - **Low Confidence** (1-49%): Uncertain matches, manual review needed
     - **Unmatched**: No suitable task found

   *[Image Suggestion: Screenshot of Task Matches tab showing confidence level sections with sample meetings]*

4. **Create Time Entries**
   - Review each suggested match
   - Modify task selection if needed
   - Click "Post" to create time entry in Intervals
   - Successfully posted meetings are removed from the list

---

## AI Agent Features

### What is the AI Agent?

The AI Agent is an automated system that:
- Runs continuously in the background
- Automatically fetches new meetings every 30 minutes  
- Uses AI to match meetings with tasks
- Creates time entries for high-confidence matches
- Queues uncertain matches for your review

### Enabling the AI Agent

1. **Navigate to AI Agent**
   - Click "AI Agent" in the sidebar
   - You'll see the AI Agent Dashboard

2. **Enable Automatic Processing**
   - Toggle the "Enable AI Agent" switch to ON
   - The agent will start running in the background
   - Green power indicator shows it's active

3. **Understanding the Status**
   - **Green Power Icon**: Agent is running
   - **Red X Icon**: Agent is stopped or has issues
   - Status text explains current state

### AI Agent Dashboard

**Key Sections:**

*[Image Suggestion: Full AI Agent dashboard screenshot showing all three main sections]*

**Actions Card**
- Toggle to enable/disable the AI agent
- Shows current processing status
- Manual trigger for immediate processing

*[Image Suggestion: Close-up of Actions Card with AI Agent toggle in "ON" position]*

**Meeting Review**
- Shows meetings waiting for your decision
- Organized by confidence levels (same as manual mode)
- Allows you to accept, modify, or reject AI suggestions

**Recently Posted Meetings**
- Table of all time entries created by the AI
- Advanced filtering and search capabilities
- Ability to clear your posted meeting history

*[Image Suggestion: Screenshot of Recently Posted Meetings table with filtering options visible]*

### Advanced Features

**Filtering & Search**
- **Search Box**: Find meetings by name or task
- **Date Filter**: Show meetings from specific dates
- **Client/Project Filter**: Filter by business categories
- **Module/Work Type Filter**: Filter by work categories
- **Clear Filters**: Reset all filters at once

*[Image Suggestion: Screenshot of filter dropdown menu and search box in action]*

**Sorting Options**
- Sort by meeting date, duration, client, project, etc.
- Ascending or descending order
- Click column headers or use sort controls

**Pagination**
- Adjust rows per page (5, 10, 25, 50, 100)
- Navigate between pages with First/Previous/Next/Last buttons
- Shows current page position and total results

**History Management**
- **Clear History**: Hide your posted meetings from view (preserves database)
- **Restore Hidden**: Show previously hidden meetings again

---

## Settings & Configuration

### Intervals API Key Management

**Updating Your API Key**
1. Click your profile picture (top right)
2. Select "Intervals Settings"
3. Update or verify your API Access Token
4. Click "Save Key" to confirm

*[Image Suggestion: Screenshot of user profile dropdown menu showing "Intervals Settings" option]*

**Getting a New API Key**
1. Log into Intervals
2. Go to My Account → API Access
3. Generate new token if needed
4. Copy the 11-character code
5. Paste into the Meeting Time Tracker dialog

### Theme Settings

**Switch Between Light/Dark Mode**
1. Click your profile picture (top right)
2. Select "Light Mode" or "Dark Mode"
3. Theme changes immediately and is saved for future sessions

### Session Management

**Sign Out**
1. Click your profile picture (top right)
2. Select "Sign Out"
3. You'll be redirected to the login page
4. All local data is cleared for security

---

## Troubleshooting

### Common Issues and Solutions

**"No meetings found in selected date range"**
- Try selecting one day after your intended date
- Verify you attended meetings in the selected period
- Check your Microsoft Teams permissions

**"Invalid API Access Token"**
- Verify your Intervals API key is correct (11 characters)
- Check if your Intervals account has API access enabled
- Generate a new API key from Intervals if needed

**"Session expired" message**
- Sign out and sign back in with Microsoft
- Clear your browser cache if the issue persists
- Contact your admin if permissions were revoked

**AI Agent not processing meetings**
- Check that the toggle is enabled (green power icon)
- Verify Azure OpenAI service is available
- Try processing manually first to test connections

**Meetings not appearing after posting**
- Wait a few seconds and refresh the view
- Check the "Posted Meetings" section
- Verify the time entry was created in Intervals

### Error Messages

**"Failed to fetch meetings"**
- Check your internet connection
- Verify Microsoft Graph API permissions
- Try signing out and back in

**"Rate limiting" errors**
- Too many requests in a short time
- Wait a few minutes before trying again
- AI Agent automatically handles rate limits

**"Permission denied"**
- Contact your Microsoft 365 administrator
- Teams application access policies may need updating
- Verify your account has calendar access

### Performance Tips

**For Large Date Ranges**
- Process smaller date ranges if experiencing timeouts
- Use the AI Agent for automatic batch processing
- Clear posted meeting history periodically

**For Better Matching**
- Use descriptive meeting names
- Keep task names similar to meeting names
- Verify AI suggestions before accepting

---

## Tips for Best Results

### Meeting Naming Best Practices

**For Better AI Matching:**
- Use clear, descriptive meeting names
- Format: `[Project] - [Meeting Type]` (e.g., "Project Alpha - Sprint Planning")
- Avoid abbreviations and acronyms
- Match meeting names with your Intervals task names
- Be consistent with naming conventions across your organization

**Examples of Good Meeting Names:**
- ✅ "Website Redesign - Client Review Meeting"
- ✅ "Mobile App Development - Daily Standup"
- ✅ "Q4 Planning - Strategy Session"

**Examples of Poor Meeting Names:**
- ❌ "Discussion"
- ❌ "Call"
- ❌ "Meeting"
- ❌ "Sync"

*[Image Suggestion: Side-by-side comparison showing good vs poor meeting names with AI matching confidence scores]*

### Workflow Recommendations

**Daily Workflow**
1. Start your day by checking AI Agent results
2. Review any meetings requiring manual decision
3. Let AI Agent handle routine meetings automatically
4. End-of-day: verify all important meetings were captured

**Weekly Workflow**
1. Review weekly time tracking totals
2. Handle any missed or incorrectly matched meetings
3. Update Intervals API key if needed
4. Clear posted meeting history for better performance

**Best Practices**
- Enable AI Agent for hands-off time tracking
- Use manual mode when you need precise control
- Review AI suggestions before accepting automatically
- Keep Intervals task structure organized and up-to-date
- Regularly verify time entries in Intervals match your actual work

### Security & Privacy

**Data Protection**
- API keys are stored securely
- Meeting data is processed locally when possible
- Session data is cleared on logout
- Only meetings you attended are processed

**Access Control**
- Each user sees only their own data
- Posted meetings are user-specific
- Settings and preferences are individual

### Getting Help

**Application Issues**
- Check the status indicators for service availability
- Try refreshing the page for temporary issues
- Use manual mode if AI Agent has problems

**Account Issues**
- Verify your Microsoft 365 permissions
- Check Intervals account API access
- Contact your system administrator for permission issues

**Feature Requests**
- Document any workflows that could be improved
- Note any missing features that would help your productivity
- Share feedback about AI matching accuracy

---

## Version Information

**Current Version**: v2.2.4  
**AI Engine**: GPT-4.1  
**Copyright**: © 2025 NathCorp Inc.

This user manual covers the core functionality of the Meeting Time Tracker application. For technical support or advanced configuration, contact your system administrator or IT support team.

---

## Image Placement Summary

**Recommended images to enhance user experience:**

### Getting Started Section
1. **Login page** - Microsoft authentication button
2. **OAuth consent screen** - Microsoft permission dialog
3. **API key dialog** - Intervals token input with example
4. **Dashboard success** - Green status indicators

### Dashboard Overview
5. **Full dashboard** - Labeled UI elements (header, sidebar, main content, footer)

### Manual Meeting Management
6. **Meeting overview cards** - Statistics display
7. **Meeting list table** - Sample data with attendance statuses
8. **Task Matches tab** - Confidence level sections with meetings

### AI Agent Features
9. **AI Agent dashboard** - Full view of all sections
10. **Actions Card** - Toggle switch in "ON" position
11. **Posted meetings table** - With filtering options visible
12. **Filter interface** - Dropdown menus and search box

### Settings & Configuration
13. **User profile dropdown** - Settings menu options

### Best Practices
14. **Meeting names comparison** - Good vs poor examples with confidence scores

**Total: 14 strategic image placements** to guide users through key workflows and interface elements. 