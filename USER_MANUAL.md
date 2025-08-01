# Meeting Time Tracker - User Manual

## Table of Contents

1. [Overview](#overview)
   - [What is the App?](#what-is-the-app)
   - [System Requirements](#system-requirements)
   - [Permissions](#permissions)
   - [Prerequisites](#prerequisites)

2. [First-Time Setup](#first-time-setup)
   - [Steps in Sequence](#steps-in-sequence)

3. [Login to the App](#login-to-the-app)

4. [Login to Intervals for API Access Token](#login-to-intervals-for-api-access-token)

5. [Validation of Setup](#validation-of-setup)
   - [Overview](#validation-overview)
   - [Validation Steps](#validation-steps)

6. [Manual Meeting Posting](#manual-meeting-posting)

7. [AI Agent Feature and Steps](#ai-agent-feature-and-steps)

8. [User Preferences and Account Settings](#user-preferences-and-account-settings)

9. [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)

10. [Best Practices for High Performance](#best-practices-for-high-performance)

---

## Overview

### What is the App?

The **Meeting Time Tracker** is a comprehensive web application designed to automate time tracking for Microsoft Teams meetings. It integrates with Microsoft Graph API to fetch meeting data and Intervals time tracking service to create time entries automatically.

**Key Features:**
- **Automatic Meeting Detection**: Fetches meetings from Microsoft Teams/Outlook calendar
- **AI-Powered Task Matching**: Uses Azure OpenAI to intelligently match meetings with Intervals tasks
- **Manual Review System**: Allows users to review and approve AI suggestions
- **Time Entry Creation**: Automatically creates time entries in Intervals based on meeting attendance
- **Multi-User Support**: Supports multiple users with isolated data
- **Real-time Processing**: Processes meetings in real-time with background AI agent

**Supported Meeting Types:**
- Microsoft Teams meetings
- Recurring meetings
- Meetings with attendance records
- Cross-timezone meetings (IST/UTC support)

### System Requirements

**Browser Requirements:**
- Modern web browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- Local storage support
- Minimum screen resolution: 1024x768

**Network Requirements:**
- Stable internet connection
- Access to Microsoft Graph API
- Access to Intervals API
- Access to Azure OpenAI services

**User Account Requirements:**
- Microsoft 365 account (NathCorp organization)
- Intervals account with API access
- Valid Azure AD authentication

### Permissions

The application requires the following permissions:

**Microsoft Graph API Permissions:**
- `Calendars.Read` - Read user's calendar events
- `OnlineMeetings.Read` - Read online meeting details
- `User.Read` - Read user profile information

**Intervals API Permissions:**
- Read access to tasks and projects
- Write access to create time entries
- Access to user's time tracking data

**Application Permissions:**
- Local storage for user preferences
- Session management for authentication

### Prerequisites

Before using the application, ensure you have:

1. **Microsoft 365 Account**: Active account in the NathCorp organization
2. **Intervals Account**: Active account with API access enabled
3. **API Access Token**: Valid Intervals API access token (11-character code)
4. **Meeting Attendance**: Meetings must have attendance records for time tracking
5. **Valid Tasks**: Intervals account must have tasks available for matching

---

## First-Time Setup

### Steps in Sequence

1. **Access the Application**
   - Navigate to the Meeting Time Tracker application URL
   - The application will redirect to the login page

2. **Microsoft Authentication**
   - Click "Sign in with NathCorp Organization ID"
   - Complete Microsoft 365 authentication
   - Grant necessary permissions when prompted

3. **Intervals API Setup**
   - After successful login, the system will prompt for Intervals API Access Token
   - Follow the instructions to obtain and enter your token

4. **Initial Configuration**
   - Set your preferred date range for meeting retrieval
   - Configure any user preferences
   - Test the connection to both Microsoft Graph and Intervals APIs

5. **First Meeting Fetch**
   - Select a date range to fetch your first set of meetings
   - Verify that meetings are displayed correctly
   - Check that attendance records are available

---

## Login to the App

### Microsoft 365 Authentication

1. **Access the Login Page**
   - Open your web browser
   - Navigate to the Meeting Time Tracker application
   - You'll see the login page with the NathCorp logo

2. **Sign In Process**
   - Click the "Sign in with NathCorp Organization ID" button
   - You'll be redirected to Microsoft's authentication page
   - Enter your NathCorp email address and password
   - Complete any multi-factor authentication if required

3. **Permission Granting**
   - Review the permissions requested by the application
   - Click "Accept" to grant access to your calendar and meeting data
   - You'll be redirected back to the application dashboard

4. **Session Management**
   - Your session will be maintained for the duration of your browser session
   - You can sign out using the user menu in the top-right corner
   - Sessions automatically expire after a period of inactivity

### Authentication Troubleshooting

**Common Issues:**
- **Invalid Credentials**: Ensure you're using your NathCorp email address
- **Permission Denied**: Contact your administrator if you don't have the required permissions
- **Multi-Factor Authentication**: Complete MFA if prompted
- **Session Expired**: Re-authenticate if your session expires

---

## Login to Intervals for API Access Token

### Obtaining Your Intervals API Access Token

1. **Access Intervals Account**
   - Log into your Intervals account at intervals.com
   - Navigate to your account settings

2. **Generate API Access Token**
   - Go to "My Account" → "API Access" under Options
   - Click "Generate API Access Token" or view existing token
   - Copy the 11-character token (format: a78828gq6t4)

3. **Token Security**
   - Keep your API token secure and confidential
   - Don't share it with others
   - The token provides access to your time tracking data

### Entering the API Token

1. **Token Entry Dialog**
   - After Microsoft authentication, the system will show the Intervals API Access Token dialog
   - Enter your 11-character API token in the provided field
   - Click "Save Key" to validate and store the token

2. **Token Validation**
   - The system will validate your token against the Intervals API
   - If valid, the token will be securely stored
   - If invalid, you'll receive an error message

3. **Token Management**
   - You can update your token anytime from the user settings menu
   - The token is stored securely and encrypted
   - You can regenerate your token in Intervals if needed

### API Token Troubleshooting

**Common Issues:**
- **Invalid Token**: Ensure you've copied the complete 11-character token
- **Token Expired**: Generate a new token in Intervals if the current one has expired
- **API Access Disabled**: Ensure API access is enabled in your Intervals account
- **Network Issues**: Check your internet connection if validation fails

---

## Validation of Setup

### Validation Overview

After completing the initial setup, the system performs several validation checks to ensure everything is working correctly:

1. **Authentication Validation**: Verifies Microsoft 365 and Intervals authentication
2. **API Connectivity**: Tests connections to Microsoft Graph and Intervals APIs
3. **Data Access**: Confirms access to calendar events and time tracking data
4. **Meeting Retrieval**: Tests the ability to fetch and process meetings
5. **Task Matching**: Validates the AI-powered task matching functionality

### Validation Steps

1. **Automatic Validation**
   - The system automatically runs validation checks after setup
   - Check the status indicators in the dashboard
   - Look for any error messages or warnings

2. **Manual Validation**
   - Select a date range to fetch meetings
   - Verify that meetings are displayed with correct information
   - Check that attendance records are available
   - Test the task matching functionality

3. **AI Agent Validation**
   - Enable the AI agent to test automatic processing
   - Monitor the processing logs for any errors
   - Verify that time entries are created correctly

4. **Data Verification**
   - Check that posted meetings appear in the "Recently Posted Meetings" section
   - Verify that time entries are created in your Intervals account
   - Confirm that meeting durations are calculated correctly

### Validation Indicators

**Success Indicators:**
- ✅ Green checkmarks for all validation steps
- Meetings displayed in the dashboard
- Task matching working correctly
- Time entries created successfully

**Warning Indicators:**
- ⚠️ Yellow warnings for non-critical issues
- Some meetings without attendance records
- Low confidence task matches

**Error Indicators:**
- ❌ Red errors for critical issues
- Authentication failures
- API connection problems
- Missing required data

---

## Manual Meeting Posting

### Overview

Manual meeting posting allows you to review and manually create time entries for your meetings. This feature is useful when:
- AI confidence is low
- You want to review before posting
- Meetings require manual task selection
- You need to modify meeting details

### Manual Posting Process

1. **Access Manual Posting**
   - Navigate to the "Dashboard" view
   - Select a date range to fetch meetings
   - Click "Match Tasks" to analyze meetings

2. **Review Meeting Matches**
   - View meetings categorized by confidence level:
     - **High Confidence (80%+)**: Green indicators, likely accurate matches
     - **Medium Confidence (50-79%)**: Yellow indicators, review recommended
     - **Low Confidence (1-49%)**: Red indicators, manual review required
     - **Unmatched**: No AI match found, manual selection needed

3. **Select Tasks**
   - Click "Select Task" for unmatched meetings
   - Use the search function to find appropriate tasks
   - Review task details before selection
   - Change tasks for any meeting as needed

4. **Post Time Entries**
   - Click "Post" button for each meeting you want to submit
   - Review the confirmation dialog
   - Confirm the time entry creation
   - Monitor the posting status

### Task Selection Interface

**Search Functionality:**
- Search by task title or project name
- Real-time filtering as you type
- Case-insensitive search
- Partial matching supported

**Task Information Displayed:**
- Task title and description
- Associated project
- Module information
- Work type classification

**Selection Options:**
- Single task selection per meeting
- Change task option for any meeting
- Bulk selection for similar meetings
- Clear selection to start over

### Manual Posting Best Practices

1. **Review Before Posting**
   - Always review AI suggestions before posting
   - Check meeting duration and attendance
   - Verify task relevance and accuracy

2. **Use Search Effectively**
   - Use specific keywords to find tasks
   - Search by project name for better results
   - Review multiple options before selecting

3. **Handle Unmatched Meetings**
   - Manually select appropriate tasks
   - Consider creating new tasks if needed
   - Document any patterns for future AI learning

4. **Batch Processing**
   - Select multiple similar meetings
   - Apply the same task to multiple meetings
   - Use bulk operations for efficiency

---

## AI Agent Feature and Steps

### AI Agent Overview

The AI Agent is an automated system that continuously processes your meetings and creates time entries without manual intervention. It runs in the background and can operate even when your browser is closed.

### AI Agent Capabilities

**Automatic Processing:**
- Fetches meetings every 30 minutes
- Analyzes meeting content using Azure OpenAI
- Matches meetings with Intervals tasks
- Creates time entries automatically
- Handles recurring meetings and attendance records

**Intelligent Matching:**
- Uses natural language processing to understand meeting content
- Considers meeting titles, descriptions, and context
- Calculates confidence scores for matches
- Learns from manual corrections

**Background Operation:**
- Runs continuously in the background
- Processes meetings even when browser is closed
- Handles network interruptions gracefully
- Maintains processing state across sessions

### Enabling the AI Agent

1. **Access AI Agent Dashboard**
   - Navigate to the "AI Agent" view from the sidebar
   - Review the AI Agent status and capabilities

2. **Enable the Agent**
   - Toggle the "Enable AI Agent" switch
   - Confirm the activation
   - The agent will start processing immediately

3. **Monitor Processing**
   - View real-time processing logs
   - Check the status of posted meetings
   - Monitor confidence scores and matches

### AI Agent Processing Workflow

1. **Meeting Fetching**
   - Agent fetches meetings for the current IST day
   - Processes both scheduled and recurring meetings
   - Extracts attendance records and duration

2. **Content Analysis**
   - Analyzes meeting titles and descriptions
   - Uses Azure OpenAI for natural language processing
   - Identifies key topics and context

3. **Task Matching**
   - Compares meeting content with available tasks
   - Calculates similarity scores
   - Determines confidence levels

4. **Time Entry Creation**
   - Creates time entries for high-confidence matches
   - Queues low-confidence matches for review
   - Handles errors and retries

### AI Agent Configuration

**Processing Settings:**
- **Frequency**: Every 30 minutes (configurable)
- **Time Range**: Full IST day (00:00 to 23:59)
- **Confidence Threshold**: 80% for automatic posting
- **Retry Logic**: Exponential backoff for failures

**Matching Criteria:**
- **Title Similarity**: Exact and partial matches
- **Project Relevance**: Domain and context matching
- **Time Relevance**: Meeting timing considerations
- **Historical Learning**: Previous manual corrections

### AI Agent Monitoring

**Real-time Logs:**
- Processing status updates
- Meeting analysis results
- Task matching decisions
- Error messages and warnings

**Performance Metrics:**
- Processing speed and efficiency
- Success rates for different meeting types
- Confidence score distributions
- Error rates and resolution times

**Status Indicators:**
- **Active**: Agent is running and processing
- **Idle**: Agent is waiting for next cycle
- **Error**: Agent encountered an error
- **Disabled**: Agent is turned off

### AI Agent Best Practices

1. **Initial Setup**
   - Start with manual review to establish patterns
   - Monitor AI suggestions before enabling auto-posting
   - Adjust confidence thresholds as needed

2. **Ongoing Monitoring**
   - Regularly review posted meetings
   - Check for any incorrect matches
   - Provide feedback through manual corrections

3. **Optimization**
   - Use clear meeting names for better matching
   - Maintain consistent task naming in Intervals
   - Review and update task descriptions regularly

4. **Troubleshooting**
   - Check processing logs for errors
   - Verify API connectivity
   - Monitor confidence scores for patterns

---

## User Preferences and Account Settings

### Account Settings Access

1. **User Menu**
   - Click on your avatar in the top-right corner
   - Access the dropdown menu with account options

2. **Available Settings**
   - Intervals Settings
   - Theme preferences (Light/Dark mode)
   - Sign out option

### Intervals Settings Management

1. **Update API Token**
   - Select "Intervals Settings" from the user menu
   - Enter your new API access token
   - Validate the token before saving

2. **Token Validation**
   - System tests the token against Intervals API
   - Confirms access to tasks and time entries
   - Provides feedback on validation status

3. **Token Security**
   - Tokens are encrypted and stored securely
   - Never shared with other users
   - Can be regenerated in Intervals if compromised

### Theme Preferences

1. **Light Mode**
   - Clean, bright interface
   - High contrast for readability
   - Suitable for well-lit environments

2. **Dark Mode**
   - Reduced eye strain
   - Better for low-light conditions
   - Modern, professional appearance

3. **Theme Switching**
   - Toggle between light and dark modes
   - Setting persists across sessions
   - Automatic switching based on system preference

### Session Management

1. **Session Duration**
   - Sessions remain active during browser use
   - Automatic timeout after inactivity
   - Secure session handling

2. **Sign Out**
   - Click "Sign Out" from user menu
   - Clears session data
   - Redirects to login page

3. **Session Security**
   - Secure token storage
   - Automatic session refresh
   - Protection against unauthorized access

### Data Management

1. **Posted Meetings History**
   - View all previously posted meetings
   - Filter by date, client, project, or module
   - Search functionality for quick access

2. **Data Export**
   - Export meeting data for reporting
   - Download time entry summaries
   - Backup important information

3. **Data Privacy**
   - User data is isolated
   - No cross-user data sharing
   - Secure data transmission

---

## Common Issues and Troubleshooting

### Authentication Issues

**Problem: Cannot sign in with Microsoft 365**
- **Solution**: Verify you're using your NathCorp email address
- **Solution**: Check your internet connection
- **Solution**: Clear browser cache and cookies
- **Solution**: Contact IT support if issues persist

**Problem: Intervals API token validation fails**
- **Solution**: Verify the 11-character token is correct
- **Solution**: Check if API access is enabled in Intervals
- **Solution**: Generate a new token if current one is expired
- **Solution**: Ensure you have the necessary Intervals permissions

### Meeting Fetching Issues

**Problem: No meetings displayed**
- **Solution**: Check your date range selection
- **Solution**: Verify you have meetings in the selected period
- **Solution**: Ensure meetings have attendance records
- **Solution**: Check Microsoft Graph API permissions

**Problem: Missing attendance records**
- **Solution**: Verify you attended the meetings
- **Solution**: Check if meetings were Teams meetings
- **Solution**: Wait for attendance data to be available (may take time)
- **Solution**: Contact meeting organizer for attendance reports

**Problem: Incorrect meeting times**
- **Solution**: Check your timezone settings
- **Solution**: Verify meeting scheduling in Outlook/Teams
- **Solution**: Account for timezone differences in recurring meetings

### Task Matching Issues

**Problem: Low confidence matches**
- **Solution**: Use more descriptive meeting names
- **Solution**: Create more specific tasks in Intervals
- **Solution**: Review and manually correct matches
- **Solution**: Provide feedback to improve AI learning

**Problem: No matching tasks found**
- **Solution**: Check if tasks exist in Intervals
- **Solution**: Verify task naming conventions
- **Solution**: Create new tasks if needed
- **Solution**: Use manual task selection

**Problem: Incorrect task assignments**
- **Solution**: Manually change task assignments
- **Solution**: Review meeting content for better context
- **Solution**: Update task descriptions in Intervals
- **Solution**: Provide feedback for AI improvement

### AI Agent Issues

**Problem: AI Agent not processing meetings**
- **Solution**: Check if agent is enabled
- **Solution**: Verify API connectivity
- **Solution**: Check processing logs for errors
- **Solution**: Restart the AI agent if needed

**Problem: Processing errors or failures**
- **Solution**: Check network connectivity
- **Solution**: Verify API rate limits
- **Solution**: Review error logs for specific issues
- **Solution**: Contact support for persistent issues

**Problem: Duplicate time entries**
- **Solution**: Check for duplicate meetings
- **Solution**: Verify meeting IDs are unique
- **Solution**: Review posted meetings history
- **Solution**: Clear duplicate entries if needed

### Performance Issues

**Problem: Slow loading times**
- **Solution**: Check internet connection speed
- **Solution**: Clear browser cache
- **Solution**: Reduce date range size
- **Solution**: Close unnecessary browser tabs

**Problem: Browser crashes or freezes**
- **Solution**: Update browser to latest version
- **Solution**: Disable browser extensions
- **Solution**: Clear browser data
- **Solution**: Try a different browser

**Problem: Memory usage issues**
- **Solution**: Close unused browser tabs
- **Solution**: Restart browser periodically
- **Solution**: Reduce date range for large datasets
- **Solution**: Use pagination for large meeting lists

### Data Issues

**Problem: Missing posted meetings**
- **Solution**: Check Intervals account for time entries
- **Solution**: Verify posting was successful
- **Solution**: Check for API errors during posting
- **Solution**: Manually post if needed

**Problem: Incorrect time durations**
- **Solution**: Verify attendance records
- **Solution**: Check meeting start/end times
- **Solution**: Review timezone conversions
- **Solution**: Manually adjust if necessary

**Problem: Data synchronization issues**
- **Solution**: Refresh the application
- **Solution**: Check API connectivity
- **Solution**: Clear browser cache
- **Solution**: Re-authenticate if needed

### Network and Connectivity Issues

**Problem: API connection failures**
- **Solution**: Check internet connection
- **Solution**: Verify firewall settings
- **Solution**: Check corporate network policies
- **Solution**: Try from different network

**Problem: Timeout errors**
- **Solution**: Increase timeout settings
- **Solution**: Check network stability
- **Solution**: Reduce data request size
- **Solution**: Retry the operation

**Problem: Rate limiting issues**
- **Solution**: Wait before retrying
- **Solution**: Reduce request frequency
- **Solution**: Check API usage limits
- **Solution**: Contact support if persistent

---

## Best Practices for High Performance

### Meeting Management Best Practices

1. **Meeting Naming Conventions**
   - Use descriptive, specific meeting names
   - Include project or client names in titles
   - Avoid generic names like "Discussion" or "Meeting"
   - Use consistent naming patterns

2. **Meeting Scheduling**
   - Schedule meetings with clear start and end times
   - Include meeting descriptions when possible
   - Use Teams meetings for better attendance tracking
   - Avoid overlapping meetings when possible

3. **Attendance Tracking**
   - Join meetings on time for accurate tracking
   - Use Teams for meetings that require time tracking
   - Ensure meeting organizers enable attendance reports
   - Wait for attendance data to be available

### Task Management Best Practices

1. **Intervals Task Organization**
   - Create specific, well-named tasks
   - Use consistent naming conventions
   - Include project context in task names
   - Maintain up-to-date task descriptions

2. **Task Categorization**
   - Use appropriate project assignments
   - Maintain consistent module organization
   - Use work types appropriately
   - Keep task hierarchies organized

3. **Task Maintenance**
   - Regularly review and update task names
   - Archive completed or obsolete tasks
   - Maintain task descriptions
   - Use consistent terminology

### AI Agent Optimization

1. **Initial Training Period**
   - Start with manual review for first few weeks
   - Provide feedback on AI suggestions
   - Establish patterns for your work style
   - Gradually increase automation

2. **Confidence Threshold Management**
   - Set appropriate confidence thresholds
   - Review low-confidence matches regularly
   - Adjust thresholds based on accuracy
   - Balance automation with accuracy

3. **Continuous Improvement**
   - Regularly review posted meetings
   - Provide feedback on incorrect matches
   - Update task names based on patterns
   - Monitor AI performance metrics

### Data Management Best Practices

1. **Regular Reviews**
   - Review posted meetings weekly
   - Check for any incorrect time entries
   - Verify meeting durations and tasks
   - Maintain data accuracy

2. **Backup and Export**
   - Export important data regularly
   - Keep backups of meeting data
   - Document any manual corrections
   - Maintain audit trails

3. **Data Cleanup**
   - Archive old meetings periodically
   - Remove duplicate entries
   - Update outdated information
   - Maintain data integrity

### Performance Optimization

1. **Browser Optimization**
   - Use modern, updated browsers
   - Clear cache regularly
   - Disable unnecessary extensions
   - Close unused tabs

2. **Network Optimization**
   - Use stable internet connections
   - Avoid public or shared networks
   - Check firewall settings
   - Monitor bandwidth usage

3. **Application Usage**
   - Use appropriate date ranges
   - Avoid processing too many meetings at once
   - Use pagination for large datasets
   - Refresh data periodically

### Security Best Practices

1. **Authentication Security**
   - Use strong passwords
   - Enable multi-factor authentication
   - Keep credentials secure
   - Sign out when not in use

2. **API Token Security**
   - Keep API tokens confidential
   - Regenerate tokens periodically
   - Don't share tokens with others
   - Monitor token usage

3. **Data Privacy**
   - Be aware of data sharing policies
   - Review privacy settings
   - Report security concerns
   - Follow organizational policies

### Troubleshooting Best Practices

1. **Systematic Approach**
   - Start with simple solutions
   - Check common issues first
   - Document problems and solutions
   - Escalate when needed

2. **Documentation**
   - Keep notes of issues encountered
   - Document successful solutions
   - Share knowledge with team members
   - Update troubleshooting guides

3. **Support Resources**
   - Use available documentation
   - Contact support when needed
   - Join user communities
   - Stay updated on new features

### Workflow Optimization

1. **Daily Routine**
   - Review meetings at the end of each day
   - Check AI agent status
   - Verify posted time entries
   - Plan for next day's meetings

2. **Weekly Reviews**
   - Review weekly meeting summaries
   - Check for any missed meetings
   - Verify task assignments
   - Update task organization

3. **Monthly Maintenance**
   - Review and archive old data
   - Update task structures
   - Analyze AI performance
   - Plan improvements

---

## Conclusion

The Meeting Time Tracker application provides a comprehensive solution for automating time tracking from Microsoft Teams meetings. By following this user manual and implementing the best practices outlined, you can maximize the efficiency and accuracy of your time tracking process.

Remember to:
- Start with manual review to establish patterns
- Gradually increase automation as confidence grows
- Regularly review and provide feedback
- Maintain organized task structures
- Follow security best practices

For additional support or questions, refer to the troubleshooting section or contact your system administrator. 