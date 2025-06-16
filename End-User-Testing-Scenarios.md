# Meeting Time Tracker - End-User Testing Scenarios

## Document Information
**Application:** Meeting Time Tracker v2.2.2  
**Testing Type:** End-User Functional Testing  
**Target Users:** Microsoft Teams users with Intervals time tracking  
**Created:** December 2024  
**Purpose:** Comprehensive testing scenarios for normal users

---

## Table of Contents
1. [Initial Setup and Authentication](#1-initial-setup-and-authentication)
2. [Dashboard Navigation and Overview](#2-dashboard-navigation-and-overview)
3. [Manual Meeting Management](#3-manual-meeting-management)
4. [AI Agent Automated Features](#4-ai-agent-automated-features)
5. [Task Matching and Time Entries](#5-task-matching-and-time-entries)
6. [Settings and Configuration](#6-settings-and-configuration)
7. [Data Management and Storage](#7-data-management-and-storage)
8. [Mobile and Responsive Testing](#8-mobile-and-responsive-testing)
9. [Error Scenarios and Recovery](#9-error-scenarios-and-recovery)
10. [Integration Testing](#10-integration-testing)

---

## 1. Initial Setup and Authentication

### 1.1 First-Time User Registration
**Scenario:** New user accessing the application for the first time
- Navigate to the application URL
- Verify login page displays with Microsoft authentication option
- Click "Sign in with Microsoft" button
- Complete Microsoft OAuth authentication flow
- Verify successful redirection to dashboard
- Check that user profile information is displayed correctly
- Verify session is maintained after browser refresh

**Expected Results:**
- Login page loads without errors
- Microsoft OAuth flow completes successfully
- User is redirected to dashboard
- User information displays correctly
- Session persists across browser refreshes

### 1.2 Returning User Authentication
**Scenario:** Existing user logging back into the application
- Access the application URL
- Verify automatic redirection if previous session exists
- Test login with Microsoft credentials
- Verify dashboard loads with user-specific data
- Check that previous settings are retained

**Expected Results:**
- Seamless authentication experience
- User-specific data loads correctly
- Previous configurations are preserved

### 1.3 Session Management
**Scenario:** Testing session timeout and renewal
- Log into the application
- Leave application idle for extended period
- Attempt to perform actions after extended idle time
- Verify session warning appears before timeout
- Test session renewal process
- Test manual logout functionality

**Expected Results:**
- Session warning appears appropriately
- Session renewal works correctly
- Logout redirects to login page
- All user data is cleared on logout

---

## 2. Dashboard Navigation and Overview

### 2.1 Dashboard Initial Load
**Scenario:** User accessing the main dashboard
- Log into the application
- Verify dashboard loads completely
- Check all main sections are visible (Meetings, AI Agent, Posted Meetings)
- Verify status indicators show correct states
- Check responsive layout on different screen sizes

**Expected Results:**
- Dashboard loads without errors
- All components render correctly
- Status indicators show accurate information
- Layout adapts to screen size

### 2.2 Navigation Between Tabs
**Scenario:** Testing tab navigation functionality
- Navigate to "Meetings" tab
- Verify meeting list displays correctly
- Switch to "AI Agent" tab
- Verify AI agent interface loads
- Navigate to "Posted Meetings" tab
- Verify posted meetings list displays
- Test tab switching with keyboard navigation

**Expected Results:**
- All tabs load correctly
- Content switches appropriately
- No data loss during navigation
- Keyboard navigation works

### 2.3 Theme and UI Testing
**Scenario:** Testing dark/light theme functionality
- Locate theme toggle button
- Switch between light and dark themes
- Verify all components adapt to theme changes
- Check theme preference is saved
- Test theme persistence across sessions

**Expected Results:**
- Theme changes apply to all components
- No visual artifacts during theme switching
- Theme preference persists across sessions

### 2.4 Beta Badge and Version Information
**Scenario:** Verifying version information display
- Check for Beta badge visibility
- Verify version information is displayed
- Test any version-related notifications
- Check for update prompts if applicable

**Expected Results:**
- Beta badge is clearly visible
- Version information is accurate
- Notifications display appropriately

---

## 3. Manual Meeting Management

### 3.1 Date Range Selection
**Scenario:** Selecting different date ranges for meeting data
- Open date range picker
- Select today's date
- Verify meetings load for selected date
- Select a past date range (yesterday, last week)
- Select a future date range
- Test custom date range selection
- Verify date picker shows correct format (considering timezone)

**Expected Results:**
- Date picker opens and closes properly
- Meeting data loads for selected dates
- Date format displays correctly in IST
- Custom ranges work as expected

### 3.2 Meeting List Display
**Scenario:** Viewing and interacting with meeting lists
- View list of meetings for selected date
- Verify meeting details display (subject, time, duration, attendees)
- Check actual vs scheduled duration comparison
- Test meeting status indicators (posted/unposted)
- Verify attendance records show correctly
- Test sorting and filtering options

**Expected Results:**
- All meeting information displays accurately
- Duration calculations are correct
- Status indicators work properly
- Attendance data is accurate

### 3.3 Individual Meeting Details
**Scenario:** Examining detailed meeting information
- Click on a specific meeting
- Verify detailed view opens
- Check all attendee information
- Verify join/leave times are accurate
- Test duration calculations
- Check meeting organizer information
- Verify Teams meeting link (if applicable)

**Expected Results:**
- Meeting details are comprehensive
- All timestamps are in correct timezone
- Attendee information is complete
- Duration calculations match actual attendance

### 3.4 Meeting Filtering and Search
**Scenario:** Finding specific meetings using filters
- Test filter by meeting status (posted/unposted)
- Filter by meeting duration
- Search meetings by subject/attendee name
- Filter by Teams vs non-Teams meetings
- Test clearing filters
- Verify results update dynamically

**Expected Results:**
- All filters work correctly
- Search returns relevant results
- Filter combinations work properly
- Clear filters resets view

---

## 4. AI Agent Automated Features

### 4.1 AI Agent Setup and Configuration
**Scenario:** Setting up automated AI agent functionality
- Navigate to AI Agent tab
- Verify AI Agent status indicator
- Check Azure OpenAI connection status
- Test PM2 process status
- Verify agent configuration options
- Test starting/stopping the AI agent

**Expected Results:**
- Status indicators show correct states
- AI Agent can be started/stopped
- Configuration options are accessible
- Error messages are clear if setup incomplete

### 4.2 Automated Meeting Processing
**Scenario:** Testing AI agent's automated meeting analysis
- Start the AI agent
- Wait for automated meeting fetch cycle (5-minute intervals)
- Verify new meetings are automatically detected
- Check AI analysis of meeting content
- Verify task matching suggestions appear
- Test confidence scoring system

**Expected Results:**
- Meetings are automatically fetched
- AI analysis runs successfully
- Task matches have appropriate confidence scores
- System handles errors gracefully

### 4.3 Task Matching Intelligence
**Scenario:** Testing AI's task matching capabilities
- Review high-confidence matches
- Examine medium-confidence suggestions
- Check low-confidence matches requiring review
- Verify unmatched meetings are flagged
- Test AI reasoning explanations
- Check alternative task suggestions

**Expected Results:**
- Matches are categorized by confidence level
- Reasoning is clear and logical
- Alternative suggestions are relevant
- Unmatched meetings are properly flagged

### 4.4 Automated Time Entry Creation
**Scenario:** Testing automatic time entry generation
- Allow AI agent to process meetings with high-confidence matches
- Verify time entries are created in Intervals
- Check entry details (duration, task, project)
- Verify duplicate prevention works
- Test batch processing functionality
- Check error handling for failed entries

**Expected Results:**
- Time entries are created accurately
- No duplicate entries are generated
- Entry details match meeting information
- Errors are handled and reported

---

## 5. Task Matching and Time Entries

### 5.1 Manual Task Selection
**Scenario:** Manually matching meetings with tasks
- Select an unmatched meeting
- Open task selection interface
- Browse available tasks by project/module
- Search for specific tasks
- Select appropriate task
- Create time entry manually
- Verify entry appears in Posted Meetings

**Expected Results:**
- Task selection interface is intuitive
- Search functionality works correctly
- Time entries are created successfully
- Posted meetings update appropriately

### 5.2 Confidence-Based Review Process
**Scenario:** Reviewing medium and low confidence matches
- Navigate to meetings requiring review
- Examine AI suggestions for each meeting
- Accept high-confidence suggestions
- Modify medium-confidence suggestions
- Manually match low-confidence meetings
- Reject irrelevant suggestions
- Provide feedback on AI decisions

**Expected Results:**
- Review interface is clear and efficient
- Suggestions can be accepted/modified/rejected
- Feedback system works properly
- Changes reflect in final time entries

### 5.3 Batch Processing
**Scenario:** Processing multiple meetings simultaneously
- Select multiple similar meetings
- Apply same task to multiple meetings
- Process recurring meetings in batch
- Verify all entries are created correctly
- Check for any processing errors
- Confirm batch operations complete successfully

**Expected Results:**
- Batch selection works smoothly
- All selected meetings process correctly
- Error handling works for failed items
- Progress indication is clear

### 5.4 Time Entry Validation
**Scenario:** Verifying accuracy of created time entries
- Check time entry duration matches actual attendance
- Verify correct task assignment
- Confirm project and module selection
- Validate entry timestamps
- Check description/notes content
- Verify user attribution is correct

**Expected Results:**
- All time entry details are accurate
- Duration calculations are precise
- Task assignments are appropriate
- Timestamps reflect correct timezone

---

## 6. Settings and Configuration

### 6.1 Intervals API Key Management
**Scenario:** Setting up and managing Intervals integration
- Open Intervals settings dialog
- Enter API key for first time
- Test API key validation
- Update existing API key
- Test invalid API key handling
- Verify secure storage of credentials

**Expected Results:**
- API key dialog opens/closes properly
- Validation provides clear feedback
- Invalid keys show appropriate errors
- Keys are stored securely

### 6.2 User Preferences
**Scenario:** Managing user-specific settings
- Adjust timezone preferences
- Set default date ranges
- Configure notification preferences
- Modify display settings
- Test preference persistence
- Reset settings to defaults

**Expected Results:**
- All preferences save correctly
- Settings persist across sessions
- Reset functionality works properly
- UI reflects preference changes

### 6.3 Data Storage Settings
**Scenario:** Managing local data and storage
- Check storage usage information
- Clear cached meeting data
- Export user data
- Import previous settings
- Manage posted meetings history
- Test data cleanup options

**Expected Results:**
- Storage information is accurate
- Data operations complete successfully
- Export/import functions work properly
- Cleanup removes appropriate data

---

## 7. Data Management and Storage

### 7.1 Posted Meetings Management
**Scenario:** Managing previously posted time entries
- View list of posted meetings
- Filter posted meetings by date range
- Search posted meetings by subject
- View details of posted entries
- Remove incorrectly posted meetings
- Verify removal updates Intervals

**Expected Results:**
- Posted meetings list is accurate
- Filtering and search work correctly
- Removal process is secure and confirmed
- Intervals integration updates properly

### 7.2 Data Persistence
**Scenario:** Testing data retention across sessions
- Create task matches and settings
- Close browser/application
- Reopen application
- Verify all data is retained
- Test data after browser cache clear
- Check backup/restore functionality

**Expected Results:**
- User data persists correctly
- Settings are maintained
- No data loss occurs
- Recovery options work when needed

### 7.3 Data Synchronization
**Scenario:** Testing data sync between components
- Make changes in manual interface
- Verify changes reflect in AI agent
- Update settings and check all components
- Test real-time data updates
- Check conflict resolution

**Expected Results:**
- Data stays synchronized across interfaces
- Updates appear in real-time
- No conflicts or inconsistencies occur
- All components show current data

---

## 8. Mobile and Responsive Testing

### 8.1 Mobile Device Testing
**Scenario:** Using application on mobile devices
- Access application on smartphone
- Test login process on mobile
- Navigate through all main features
- Test touch interactions
- Verify responsive layout
- Check mobile-specific UI elements

**Expected Results:**
- Application loads properly on mobile
- All features are accessible
- Touch interactions work smoothly
- Layout adapts appropriately

### 8.2 Tablet Testing
**Scenario:** Testing on tablet devices
- Use application on tablet (iPad/Android)
- Test both portrait and landscape orientations
- Verify table layouts adapt properly
- Test touch and gesture interactions
- Check virtual keyboard interactions

**Expected Results:**
- Tablet layout is optimized
- Orientation changes work smoothly
- Tables remain usable and readable
- Input methods work correctly

### 8.3 Different Screen Sizes
**Scenario:** Testing various desktop screen sizes
- Test on small laptop screens (1366x768)
- Test on standard desktop (1920x1080)
- Test on ultrawide monitors
- Test window resizing behavior
- Verify component scaling

**Expected Results:**
- Application adapts to all screen sizes
- No horizontal scrolling on standard sizes
- Components scale appropriately
- Text remains readable at all sizes

---

## 9. Error Scenarios and Recovery

### 9.1 Network Connectivity Issues
**Scenario:** Testing behavior during network problems
- Disconnect internet during operation
- Test graceful degradation
- Reconnect and verify recovery
- Test with slow/intermittent connections
- Check offline functionality (if any)

**Expected Results:**
- Clear error messages appear
- Application handles disconnections gracefully
- Recovery works when connection restored
- No data loss during network issues

### 9.2 API Failures
**Scenario:** Testing response to API service failures
- Simulate Microsoft Graph API failures
- Test Intervals API unavailability
- Check Azure OpenAI service errors
- Test rate limiting scenarios
- Verify retry mechanisms

**Expected Results:**
- API failures are detected and reported
- Retry mechanisms work appropriately
- User is informed of service issues
- Application remains stable

### 9.3 Authentication Errors
**Scenario:** Testing authentication failure scenarios
- Test expired Microsoft tokens
- Simulate authentication revocation
- Test invalid Intervals API keys
- Check permission denial scenarios
- Test session timeout handling

**Expected Results:**
- Authentication errors are detected
- Users are prompted to re-authenticate
- Error messages are clear and helpful
- Recovery process is straightforward

### 9.4 Data Corruption and Recovery
**Scenario:** Testing data integrity and recovery
- Simulate corrupted local storage
- Test with malformed data
- Check data validation mechanisms
- Test backup/restore procedures
- Verify error reporting

**Expected Results:**
- Data corruption is detected
- Validation prevents bad data processing
- Recovery mechanisms work correctly
- Users can restore from backups

---

## 10. Integration Testing

### 10.1 Microsoft Teams Integration
**Scenario:** Testing Microsoft Teams meeting data integration
- Verify all meeting types are supported
- Test recurring meeting handling
- Check guest/external attendee data
- Test private/public meeting differences
- Verify calendar integration

**Expected Results:**
- All meeting types process correctly
- Recurring meetings are handled properly
- Attendee data is complete and accurate
- Privacy settings are respected

### 10.2 Intervals Time Tracking Integration
**Scenario:** Testing Intervals API integration
- Create time entries for various projects
- Test different work types/categories
- Verify time calculations and rounding
- Test project/task hierarchy navigation
- Check time entry validation rules

**Expected Results:**
- Time entries appear correctly in Intervals
- All project/task data is accessible
- Time calculations are accurate
- Validation rules are enforced

### 10.3 Azure OpenAI Integration
**Scenario:** Testing AI service integration
- Test various meeting types with AI
- Check AI response consistency
- Test with different meeting languages
- Verify AI reasoning quality
- Test rate limiting and quotas

**Expected Results:**
- AI provides consistent, helpful suggestions
- Multiple languages are handled appropriately
- Rate limits are respected
- AI reasoning is logical and useful

### 10.4 Cross-Platform Compatibility
**Scenario:** Testing across different operating systems and browsers
- Test on Windows, macOS, Linux
- Test Chrome, Firefox, Safari, Edge browsers
- Verify all features work consistently
- Check browser-specific issues
- Test with different browser settings

**Expected Results:**
- Application works consistently across platforms
- All browsers support full functionality
- No platform-specific bugs occur
- Performance is acceptable on all systems

---

## Additional Test Scenarios

### 11. Real-World Usage Patterns

#### 11.1 Daily Workflow Testing
**Scenario:** Simulating typical daily usage
- Start workday and check for overnight meetings processed by AI
- Review AI agent suggestions from previous day
- Manually post any unmatched meetings
- Attend several meetings throughout the day
- Check real-time processing of new meetings
- End-of-day review of all posted time entries

**Expected Results:**
- Overnight processing works correctly
- Daily workflow is smooth and efficient
- Real-time updates appear appropriately
- End-of-day summaries are accurate

#### 11.2 Weekly Workflow Testing
**Scenario:** Testing weekly patterns and recurring meetings
- Process Monday morning setup and weekend catches
- Handle recurring weekly meetings
- Test week-end summaries and reports
- Verify weekly time tracking totals
- Handle calendar changes and cancellations

**Expected Results:**
- Weekly patterns are recognized correctly
- Recurring meetings process consistently
- Time totals are accurate for the week
- Calendar changes are handled properly

#### 11.3 Monthly Workflow Testing
**Scenario:** Testing monthly reporting and data management
- Generate monthly time tracking reports
- Archive old meeting data
- Review monthly AI agent performance
- Handle month-end time entry corrections
- Test historical data access

**Expected Results:**
- Monthly reports are comprehensive
- Data archiving works properly
- Historical data remains accessible
- Corrections can be made easily

### 12. Edge Cases and Boundary Testing

#### 12.1 Extreme Data Scenarios
**Scenario:** Testing with unusual data volumes
- Test with days containing 10+ meetings
- Handle meetings with 50+ attendees
- Process very short meetings (< 5 minutes)
- Handle very long meetings (> 4 hours)
- Test with meetings containing special characters

**Expected Results:**
- High volume days process correctly
- Large attendee lists are handled properly
- Short and long meetings process accurately
- Special characters don't cause errors

#### 12.2 Timezone Edge Cases
**Scenario:** Testing timezone handling edge cases
- Test meetings spanning midnight
- Handle daylight saving time transitions
- Test with attendees in multiple timezones
- Process meetings scheduled in different timezones
- Verify timestamp accuracy across time changes

**Expected Results:**
- Midnight-spanning meetings work correctly
- DST transitions are handled properly
- Multi-timezone meetings process accurately
- All timestamps are consistent and correct

#### 12.3 Permission and Access Edge Cases
**Scenario:** Testing various permission scenarios
- Test with limited Microsoft Graph permissions
- Handle meetings with restricted access
- Test with external/guest attendees
- Handle private meetings and calendars
- Test permission changes during active sessions

**Expected Results:**
- Limited permissions are handled gracefully
- Restricted meetings are processed appropriately
- External attendees don't cause errors
- Privacy settings are respected
- Permission changes trigger appropriate responses

### 13. Performance and Load Testing

#### 13.1 Performance Under Load
**Scenario:** Testing application performance with heavy usage
- Process large date ranges (month+)
- Handle concurrent AI agent processing
- Test with multiple browser tabs open
- Simulate poor network conditions
- Test memory usage over extended periods

**Expected Results:**
- Large date ranges process within reasonable time
- Concurrent processing doesn't cause conflicts
- Multiple tabs don't interfere with each other
- Poor network conditions are handled gracefully
- Memory usage remains stable over time

#### 13.2 Response Time Testing
**Scenario:** Measuring application response times
- Measure login/authentication time
- Test meeting data loading times
- Measure AI processing response times
- Test task matching performance
- Verify time entry creation speed

**Expected Results:**
- All operations complete within acceptable timeframes
- Loading indicators appear for longer operations
- Performance is consistent across different times
- No operations timeout unexpectedly

### 14. Accessibility Testing

#### 14.1 Screen Reader Compatibility
**Scenario:** Testing with screen reader software
- Navigate application using screen reader
- Test form completion with voice assistance
- Verify table data is properly announced
- Test button and link accessibility
- Check image alt-text and descriptions

**Expected Results:**
- All content is accessible via screen reader
- Navigation is logical and intuitive
- Forms can be completed without visual reference
- All interactive elements are properly labeled

#### 14.2 Keyboard Navigation
**Scenario:** Testing keyboard-only navigation
- Navigate entire application using only keyboard
- Test tab order and focus management
- Verify all features are keyboard accessible
- Test keyboard shortcuts if available
- Check modal and dialog keyboard handling

**Expected Results:**
- All features are accessible via keyboard
- Tab order is logical and efficient
- Focus indicators are clear and visible
- Keyboard shortcuts work as expected

#### 14.3 Visual Accessibility
**Scenario:** Testing visual accessibility features
- Test with high contrast settings
- Verify color contrast ratios
- Test with browser zoom up to 200%
- Check for color-only information encoding
- Test with various display settings

**Expected Results:**
- High contrast mode works properly
- All text meets contrast requirements
- Zoom levels don't break layout
- Information is not conveyed by color alone

### 15. Security Testing

#### 15.1 Data Security
**Scenario:** Verifying data protection measures
- Test secure storage of API keys
- Verify no sensitive data in browser console
- Check for secure transmission of data
- Test data isolation between users
- Verify proper session management

**Expected Results:**
- Sensitive data is properly encrypted
- No credentials appear in logs or console
- All data transmission uses HTTPS
- User data is properly isolated
- Sessions expire appropriately

#### 15.2 Authentication Security
**Scenario:** Testing authentication security measures
- Test for session fixation vulnerabilities
- Verify proper token handling
- Test concurrent session limitations
- Check logout functionality thoroughness
- Test authentication bypass attempts

**Expected Results:**
- No session vulnerabilities exist
- Tokens are handled securely
- Concurrent sessions work properly
- Logout clears all session data
- Authentication cannot be bypassed

---

## Test Execution Guidelines

### Pre-Test Setup
1. Ensure test environment has all required API access
2. Create test Microsoft 365 and Intervals accounts
3. Set up test data with known meetings and tasks
4. Document browser and device specifications
5. Prepare test scenarios with expected outcomes

### During Testing
1. Document all steps taken and results observed
2. Capture screenshots of any errors or unexpected behavior
3. Note performance observations and loading times
4. Test edge cases and boundary conditions
5. Verify accessibility features work properly

### Post-Test Documentation
1. Record all bugs and issues discovered
2. Document workarounds for known issues
3. Provide recommendations for improvements
4. Create summary of test coverage and results
5. Suggest additional test scenarios if needed

### Success Criteria
- All core functionalities work as expected
- No critical bugs that prevent normal usage
- Performance is acceptable for typical use cases
- Error messages are clear and helpful
- User experience is intuitive and efficient

---

## Appendix: Common Test Data Scenarios

### Sample Meeting Types
1. **Regular Team Meeting**: Weekly recurring meeting with consistent attendees
2. **Client Call**: External participants, sensitive information
3. **Training Session**: Large group, educational content
4. **One-on-One**: Manager/employee private discussion
5. **Project Review**: Mixed team, project-specific content
6. **All-Hands Meeting**: Company-wide, informational
7. **Interview Session**: Recruitment-related meeting
8. **Workshop**: Interactive, collaborative session

### Sample Task Categories
1. **Development Tasks**: Coding, testing, debugging
2. **Meeting Tasks**: Client meetings, internal discussions
3. **Administrative Tasks**: Planning, documentation, reporting
4. **Training Tasks**: Learning, skill development
5. **Support Tasks**: Customer support, maintenance
6. **Project Management**: Coordination, oversight

### Test User Roles
1. **Regular Employee**: Standard access, typical usage patterns
2. **Manager**: Team oversight, reporting needs
3. **Contractor**: Limited access, specific project focus
4. **New User**: First-time setup, learning application
5. **Power User**: Advanced features, heavy usage
6. **Mobile User**: Primarily mobile device usage

---

This comprehensive testing document ensures that all aspects of the Meeting Time Tracker application are thoroughly tested from an end-user perspective, covering both manual workflows and automated AI agent functionality. 