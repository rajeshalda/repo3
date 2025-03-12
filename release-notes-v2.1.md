# Meeting Time Tracker - Release Notes

## Header Information
**Product Name:** Meeting Time Tracker  
**Release Number:** 2.1.0  
**Document Version:** 1.0  
**Release Date:** March 2024

## Technologies Used

### Core Technologies
- **Next.js**: A React framework used for building the web application
  - Provides server-side rendering for improved performance
  - Enables API routes for backend functionality
  - Offers excellent developer experience with hot reloading
  - Chosen for its robust ecosystem and deployment options

- **TypeScript**: A strongly-typed programming language that builds on JavaScript
  - Enhances code quality and maintainability
  - Provides better tooling and developer experience
  - Reduces runtime errors through compile-time type checking
  - Chosen to ensure code reliability in a complex application

- **React**: A JavaScript library for building user interfaces
  - Enables component-based architecture
  - Provides efficient rendering with virtual DOM
  - Supports state management for complex UI interactions
  - Chosen for its declarative approach to UI development

### Authentication and API Integration
- **NextAuth.js**: Authentication library for Next.js applications
  - Handles Microsoft OAuth authentication
  - Manages user sessions securely
  - Provides integration with Microsoft Graph API
  - Chosen for its seamless integration with Next.js and Microsoft services

- **Microsoft Graph API**: Microsoft's unified API endpoint
  - Provides access to Microsoft 365 data including Teams meetings
  - Offers comprehensive meeting and calendar information
  - Enables access to user profiles and organizational data
  - Chosen as the authoritative source for Microsoft Teams meeting data

- **Intervals API**: Time tracking system API
  - Allows creation and management of time entries
  - Provides access to projects and tasks
  - Enables integration with the organization's time tracking workflow
  - Chosen to automate the time entry process for meetings

### AI and Data Processing
- **Azure OpenAI Service**: Microsoft's managed OpenAI service
  - Powers the AI agent for task matching
  - Analyzes meeting context to suggest appropriate tasks
  - Provides natural language understanding capabilities
  - Chosen for its advanced AI capabilities and Microsoft integration

- **Node.js**: JavaScript runtime for server-side code
  - Handles background processing for the AI agent
  - Manages API requests and data processing
  - Provides efficient asynchronous operations
  - Chosen for its performance and compatibility with JavaScript/TypeScript

### Data Storage and State Management
- **JSON Files**: Simple file-based storage
  - Stores posted meetings and user preferences
  - Provides persistence between sessions
  - Enables easy backup and migration
  - Chosen for simplicity and ease of implementation

- **React Context API**: State management solution
  - Manages application state across components
  - Provides a centralized store for UI data
  - Enables efficient component updates
  - Chosen for its native integration with React

### UI Components and Styling
- **Tailwind CSS**: Utility-first CSS framework
  - Provides responsive design capabilities
  - Enables consistent styling across the application
  - Offers customization options for branding
  - Chosen for its flexibility and development speed

- **React Icons**: Icon library for React
  - Provides a wide range of icons for the UI
  - Ensures consistent visual language
  - Offers accessibility features
  - Chosen for its ease of use and comprehensive icon set

## Overview
Meeting Time Tracker is a comprehensive solution for tracking and logging time spent in Microsoft Teams meetings. This release introduces significant improvements to both the manual time tracking workflow and the AI-powered automated time entry system. The application now provides a more streamlined experience for users to track their meeting attendance and create time entries in Intervals time tracking system, with enhanced user-specific data handling and improved task matching capabilities.

## Prerequisites
Before using the Meeting Time Tracker application, ensure you have the following:

### Account Requirements
- Microsoft 365 account with access to Teams meetings
- Intervals account with API access permissions
- Appropriate permissions to view meeting attendance records

### Technical Prerequisites
- Modern web browser (Chrome, Edge, Firefox recommended)
- Stable internet connection

### API Access
- Microsoft Graph API access configured
- Intervals API key generated from your account
- Azure OpenAI API access (for AI agent functionality)

### Microsoft Teams Application Access Policies
The application requires specific Microsoft Teams application access policies to be configured. An administrator must set up these policies using PowerShell:

1. **Connect to Microsoft Teams PowerShell Module**
   ```powershell
   # Install Microsoft Teams module if not already installed
   Install-Module -Name MicrosoftTeams

   # Connect to Microsoft Teams
   Connect-MicrosoftTeams
   ```

2. **Create Application Access Policy**
   ```powershell
   # Create a new application access policy
   New-CsApplicationAccessPolicy -Identity "CalendarAccess" -AppIds "9ec41cd0-ae8c-4dd5-bc84-a3aeea4bda54" -Description "Allow users to access Teams calendar"
   ```

3. **Assign Policy to Users**
   ```powershell
   # Assign policy to specific users
   Grant-CsApplicationAccessPolicy -PolicyName "CalendarAccess" -Identity "user@yourdomain.com"
   ```

4. **Verify Policy Configuration**
   ```powershell
   # Get all application access policies
   Get-CsApplicationAccessPolicy

   # Find users assigned to the policy
   Get-CsOnlineUser -Filter {ApplicationAccessPolicy -eq "Tag:CalendarAccess"} | Select-Object DisplayName, UserPrincipalName
   ```

### Microsoft Graph API Permissions
The application requires specific Microsoft Graph API permissions to be configured in Azure Portal:

1. **App Registration in Azure Portal**
   - Register a new application in Azure Active Directory
   - Configure the following API permissions:
     - Calendars.Read (Delegated) - Read user calendars
     - Calendars.Read (Application) - Read calendars in all mailboxes
     - Group.Read.All (Delegated) - Read all groups
     - OnlineMeetingArtifact.Read (Application) - Read online meeting artifacts
     - OnlineMeetings.Read (Delegated) - Read user's online meetings
     - Reports.Read.All (Delegated & Application) - Read all usage reports
     - User.Read (Delegated) - Sign in and read user profile
     - User.Read.All (Application) - Read all users' full profiles

2. **Admin Consent Required**
   - An administrator must grant consent for the following permissions:
     - Calendars.Read (Application)
     - Group.Read.All
     - OnlineMeetingArtifact.Read
     - Reports.Read.All
     - User.Read.All

3. **Authentication Configuration**
   - Configure authentication with the appropriate redirect URIs
   - Enable the necessary token configurations

4. **Understanding Delegated vs. Application Permissions**
   - **Delegated Permissions**: Used when a user is signed in to the application
     - Access is limited to what the signed-in user has permission to access
     - Used for user-context operations like reading the current user's meetings
     - Provides a security boundary where the app can only access what the user can access
     - In the application, these are configured with `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, and `AZURE_AD_TENANT_ID`
   
   - **Application Permissions**: Used for background processes without a signed-in user
     - Allows the application to access resources regardless of user context
     - Necessary for the AI agent to process meetings in the background
     - Provides broader access across multiple users' data (with proper admin consent)
     - In the application, these are configured with `AZURE_AD_APP_CLIENT_ID`, `AZURE_AD_APP_CLIENT_SECRET`, and `AZURE_AD_APP_TENANT_ID`
   
   - **Why Both Are Required**:
     - The manual workflow uses delegated permissions to ensure users only access their own data
     - The AI agent requires application permissions to run automated processes
     - This dual-permission approach provides the right balance of security and functionality
     - Without both permission types, certain features of the application would not function correctly

### Knowledge Prerequisites
- Basic understanding of Microsoft Teams meetings
- Familiarity with Intervals time tracking system
- Understanding of your organization's task structure

## New Features

### 1. Enhanced User-Specific Data Handling
- Improved data isolation between users for both manual and AI agent components
- Each user now sees only their own meetings, reviews, and posted time entries
- Fixed issues with shared data appearing across different user accounts

### 2. Improved AI Agent Task Matching
- Enhanced task matching algorithm with better confidence scoring
- Improved filtering of meetings based on user attendance
- Only meetings that the user actually attended are now processed
- User-specific duration is now used for time entries instead of other attendees' durations

### 3. Streamlined UI Experience
- Simplified AI Agent dashboard with focus on core functionality
- Removed unnecessary metrics and logs for cleaner interface
- Improved meeting review interface with better categorization of matches
- Added high, medium, and low confidence match sections for better organization

### 4. Attendance Verification
- Added verification of user attendance before creating time entries
- System now checks if the user actually attended the meeting
- Prevents creation of time entries for meetings the user didn't attend
- Uses the user's actual attendance duration for time entries

### 5. Improved Error Handling
- Better error messages for common issues
- Enhanced validation of time entry data
- Improved handling of API errors
- More informative feedback when meetings can't be processed

## Known Issues

1. **AI Agent Persistence**
   - The AI agent stops running when the browser is closed
   - Workaround: Keep the browser window open or implement a server-side scheduling solution

2. **Date Selection Offset**
   - Need to select one day after the actual required date to get real-time meeting information
   - Workaround: Select the following day in the date picker to view the intended meetings

3. **Unmatched Meeting Duration Issue**
   - When manually posting unmatched meetings in the AI agent, the system may not use the actual attendance timing
   - Workaround: Double-check the duration before confirming the time entry

4. **Meeting Persistence After Posting**
   - Meetings may still appear in the review section after being posted
   - Workaround: Refresh the page or wait for the next automatic refresh cycle

## Technical Requirements

### System Requirements
- Modern web browser (Chrome, Edge, Firefox, Safari)
- Microsoft 365 account with Teams meetings
- Intervals time tracking account with API access
- Stable internet connection

### Dependencies
- Microsoft Graph API for meeting data
- Intervals API for time entry creation
- Azure OpenAI services for AI-powered task matching
- NextAuth for authentication

### Azure OpenAI Configuration
The application uses Azure OpenAI services with specific rate limits and configuration settings:

1. **Rate Limits**
   - Tokens per minute: 8,000
   - Requests per minute: 48
   - Maximum batch size: 10 meetings per batch
   - Batch delay: 100ms between batches

2. **Model Configuration**
   - Default model: gpt-4o
   - Default temperature: 0.7
   - Default max tokens: 8,000
   - Request timeout: 30 seconds

3. **Retry Settings**
   - Maximum retries: 3
   - Retry delay: 1,000ms (exponential backoff)
   - Error handling with exponential backoff strategy

4. **Usage Optimization**
   - Token usage monitoring and management
   - Batch processing for multiple meetings
   - Request throttling to stay within rate limits
   - Caching of API responses to reduce calls

### Environment Variables
The following environment variables must be configured:
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI service endpoint
- `AZURE_OPENAI_API_KEY`: Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT`: Azure OpenAI deployment name
- Microsoft Graph API credentials
- NextAuth configuration

## Detailed Workflow Diagrams

### Manual App Workflow Diagram
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  Sign In with   │────►│  Configure      │────►│  Select Date    │────►│  View Meetings  │
│  Microsoft      │     │  Intervals API  │     │  Range          │     │  List           │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                │
                                                                                ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  View Posted    │◄────│  Confirm Time   │◄────│  Select Task    │◄────│  Choose Meeting │
│  Time Entries   │     │  Entry Creation │     │  for Meeting    │     │  to Log         │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### AI Agent Workflow Diagram
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  Sign In with   │────►│  Configure      │────►│  Enable AI      │────►│  AI Fetches     │
│  Microsoft      │     │  Intervals API  │     │  Agent          │     │  Meetings       │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                │
                                                                                ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  View Posted    │◄────│  Auto-Post or   │◄────│  AI Matches     │◄────│  AI Analyzes    │
│  Time Entries   │     │  Manual Review  │     │  Tasks          │     │  Meetings       │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Detailed Step-by-Step Workflows

### Manual App Workflow (Step-by-Step)

#### 1. Authentication and Setup
1. Navigate to the Meeting Time Tracker application URL
2. Click "Sign in with Microsoft" button
3. Enter your Microsoft 365 credentials
4. Authorize the application to access your meeting data
5. If prompted, enter your Intervals API key in the settings dialog
6. Verify connection to both Microsoft Graph and Intervals APIs

#### 2. Meeting Retrieval and Selection
1. On the dashboard, select the date range for meetings using the date picker
   - Note: Select one day after your intended date due to the date offset issue
2. Click "Fetch Meetings" to retrieve your Microsoft Teams meetings
3. Wait for the system to load meetings and attendance data
4. Review the list of meetings displayed in the dashboard
5. Verify that the meetings shown are ones you've attended
6. Click on a meeting you want to log time for

#### 3. Task Selection and Time Entry Creation
1. In the meeting details panel, review the meeting information:
   - Meeting title, date, and time
   - Your attendance duration
   - Other participants (if available)
2. Click the "Select Task" dropdown to view available Intervals tasks
3. Search or browse for the appropriate task
4. Select the task that corresponds to the meeting work
5. Verify the time duration is correct (based on your actual attendance)
6. Add any additional notes or description if needed
7. Click "Create Time Entry" button to post to Intervals
8. Wait for confirmation that the time entry was created successfully

#### 4. Review and Verification
1. Navigate to the "Posted Meetings" tab in the sidebar
2. Verify that your newly created time entry appears in the list
3. Check that the details are correct:
   - Meeting subject
   - Date and time
   - Duration
   - Task association
4. If needed, view the entry directly in Intervals for further verification

### AI Agent Workflow (Step-by-Step)

#### 1. Authentication and Setup
1. Navigate to the Meeting Time Tracker application URL
2. Click "Sign in with Microsoft" button
3. Enter your Microsoft 365 credentials
4. Authorize the application to access your meeting data
5. If prompted, enter your Intervals API key in the settings dialog
6. Navigate to the "AI Agent" tab in the sidebar

#### 2. AI Agent Configuration and Activation
1. Review the AI Agent dashboard
2. Toggle the "Enable AI Agent" switch to ON
3. Verify that the agent status shows as "Running"
4. Optionally, click "Process Meetings Now" to trigger immediate processing
5. Keep the browser window open for the agent to continue running

#### 3. Automated Meeting Processing
1. The AI agent automatically fetches your recent Microsoft Teams meetings
2. Meetings are filtered to include only those you actually attended
3. For each meeting, the agent:
   - Extracts meeting details (subject, time, duration)
   - Verifies your attendance and actual duration
   - Analyzes the meeting content and context
   - Attempts to match with appropriate Intervals tasks
   - Calculates confidence scores for each potential match

#### 4. Task Matching and Time Entry Creation
1. For high-confidence matches (if enabled):
   - The agent automatically creates time entries in Intervals
   - Entries use your actual attendance duration
   - Meetings are marked as posted in the system
2. For low-confidence or unmatched meetings:
   - Meetings are queued for manual review
   - You'll see them in the "Meeting Review" section

#### 5. Manual Review of AI Suggestions
1. In the "Meeting Review" section, review meetings by confidence level:
   - High confidence matches
   - Medium confidence matches
   - Low confidence matches
   - Unmatched meetings
2. For each meeting requiring review:
   - Review the meeting details and suggested tasks
   - Accept the suggested task or select a different one
   - Verify the duration is correct
   - Click "Post" to create the time entry
3. After posting, the meeting should be removed from the review list
   - If it persists, refresh the page

#### 6. Monitoring and Verification
1. Check the "Recently Posted Meetings" section to verify entries
2. Confirm that time entries appear in Intervals
3. Periodically check for new meetings requiring review
4. If needed, manually trigger processing with "Process Meetings Now"

## Installation and Upgrade Instructions

### New Installation
1. Clone the repository
2. Install dependencies:
   ```
   npm install --force
   ```
3. Configure environment variables in `.env.local`:

   First, generate a secure NEXTAUTH_SECRET using PowerShell:
   ```powershell
   # Generate a secure random string for NEXTAUTH_SECRET
   $bytes = New-Object Byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   $secret = [Convert]::ToBase64String($bytes) -replace '\+','-' -replace '\/','_' -replace '='
   "NEXTAUTH_SECRET=`"$secret`""
   ```

   Then create `.env.local` with the following variables:
   ```
   # Microsoft Graph API - Delegated Permissions (for user-context operations)
   AZURE_AD_CLIENT_ID="your_client_id"
   AZURE_AD_CLIENT_SECRET="your_client_secret"
   AZURE_AD_TENANT_ID="your_tenant_id"
   
   # Microsoft Graph API - Application Permissions (for background processes)
   AZURE_AD_APP_CLIENT_ID="your_app_client_id"
   AZURE_AD_APP_CLIENT_SECRET="your_app_client_secret"
   AZURE_AD_APP_TENANT_ID="your_app_tenant_id"
   
   # NextAuth Configuration
   NEXTAUTH_URL="http://localhost:8080"  # Update with your application URL
   NEXTAUTH_SECRET="your_generated_secret"  # Use the secret generated from PowerShell command above
   
   # Azure OpenAI Configuration
   AZURE_OPENAI_ENDPOINT="your_openai_endpoint"
   AZURE_OPENAI_API_KEY="your_openai_api_key"
   AZURE_OPENAI_DEPLOYMENT="your_openai_deployment"
   ```
   
   **Note**: 
   - For delegated and application permissions, you can use the same client ID if your app registration has both permission types
   - The generated NEXTAUTH_SECRET is a cryptographically secure random string
   - The `NEXTAUTH_URL` should match your application's base URL

4. Set up Microsoft Graph API and NextAuth configuration
5. Build the application:
   ```
   npm run build
   ```
6. Start the server:
   ```
   npm run start
   ```

### Upgrade from Previous Version
1. Pull the latest changes from the repository
2. Install any new dependencies:
   ```
   npm install
   ```
3. Update environment variables in `.env.local` if needed (check for any new required variables)
4. Rebuild the application:
   ```
   npm run build
   ```
5. Restart the server:
   ```
   npm run start
   ```

### Post-Installation Steps
1. Sign in with your Microsoft 365 account
2. Configure your Intervals API key in the settings
3. Verify that meetings are being fetched correctly
4. Test the AI agent by processing a few meetings manually

For any issues or questions, please contact the development team. 