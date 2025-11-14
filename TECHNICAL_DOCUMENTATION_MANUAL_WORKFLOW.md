# Technical Documentation - Meeting Time Tracker Application
## Part 1: Manual Workflow

**Version:** 1.0
**Last Updated:** 2025-11-13
**Application Type:** Next.js-based Meeting Time Tracker with AI-powered Task Matching

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Architecture & Technology Stack](#2-architecture--technology-stack)
3. [Directory Structure](#3-directory-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [External API Integrations](#6-external-api-integrations)
7. [Manual Workflow - Complete Flow](#7-manual-workflow---complete-flow)
8. [API Routes Reference](#8-api-routes-reference)
9. [Component Reference](#9-component-reference)
10. [Utility Libraries](#10-utility-libraries)
11. [TypeScript Interfaces](#11-typescript-interfaces)
12. [Configuration & Environment Variables](#12-configuration--environment-variables)
13. [Known Issues & Limitations](#13-known-issues--limitations)

---

## 1. System Overview

### Purpose
The Meeting Time Tracker is a web application designed to automate time tracking for Microsoft Teams meetings by:
- Fetching meeting attendance data from Microsoft Graph API
- Using AI to match meetings with appropriate tasks in Intervals time tracking system
- Creating accurate time entries based on actual attendance duration
- Supporting both manual user-driven workflow and automated AI agent processing

### Architecture Types
This application supports two distinct workflows:
1. **Manual Workflow** (Documented in this file) - User-driven, browser-based time tracking
2. **AI Agent Workflow** (See Part 2) - Automated background processing via PM2

### Core Features (Manual Workflow)
- Azure AD authentication via NextAuth.js
- Meeting retrieval from Microsoft Teams (via Graph API)
- Attendance report analysis (actual join/leave times)
- AI-powered task matching using Azure OpenAI
- Keyword-based fallback matching
- Manual task selection and override
- Automatic time entry creation in Intervals
- IST timezone handling
- Posted meetings tracking and history

---

## 2. Architecture & Technology Stack

### Frontend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI framework |
| Next.js | 15.x | Full-stack framework (App Router) |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Styling framework |
| shadcn/ui | Latest | Component library |
| Lucide React | Latest | Icon library |
| next-themes | Latest | Dark mode support |

### Backend Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js API Routes | 15.x | RESTful API endpoints |
| NextAuth.js | 4.x | Authentication provider |
| better-sqlite3 | 11.x | SQLite database driver (synchronous) |
| TypeScript | 5.x | Type-safe backend code |

### External Services
| Service | Purpose |
|---------|---------|
| Microsoft Azure AD | User authentication (OAuth 2.0) |
| Microsoft Graph API | Meeting and attendance data |
| Intervals API | Task management & time tracking |
| Azure OpenAI | AI-powered task matching (GPT models) |

### Development Tools
| Tool | Purpose |
|------|---------|
| ESLint | Code linting |
| PM2 | Process management (AI agent only) |
| tsx | TypeScript execution |

---

## 3. Directory Structure

```
repo3/
├── src/
│   ├── app/                                    # Next.js App Router
│   │   ├── api/                               # API Routes (Backend)
│   │   │   ├── auth/[...nextauth]/           # Authentication endpoints
│   │   │   │   ├── auth.ts                   # NextAuth configuration
│   │   │   │   └── route.ts                  # Auth route handler
│   │   │   ├── meetings/                     # Meeting-related APIs
│   │   │   │   ├── route.ts                  # Fetch meetings from Graph API
│   │   │   │   ├── match/route.ts            # Match meetings to tasks (AI)
│   │   │   │   └── posted/route.ts           # Manage posted meetings
│   │   │   ├── intervals/                    # Intervals API integration
│   │   │   │   ├── tasks/route.ts            # Get available tasks
│   │   │   │   ├── time-entries/route.ts     # Create time entries
│   │   │   │   ├── me/route.ts               # Get current user
│   │   │   │   └── validate/route.ts         # Validate API key
│   │   │   ├── intervals-proxy/route.ts      # Proxy for Intervals API
│   │   │   ├── user/                         # User management
│   │   │   │   ├── data/route.ts             # Get user data
│   │   │   │   ├── save-key/route.ts         # Save API key
│   │   │   │   ├── api-key/route.ts          # API key management
│   │   │   │   └── settings/route.ts         # User settings
│   │   │   ├── openai-status/route.ts        # Check OpenAI availability
│   │   │   ├── sync-meetings/route.ts        # Sync meetings
│   │   │   └── dev/logs/route.ts             # Developer logs
│   │   ├── dashboard/page.tsx                # Main dashboard (MANUAL WORKFLOW)
│   │   ├── login/page.tsx                    # Login page
│   │   ├── page.tsx                          # Landing page
│   │   ├── layout.tsx                        # Root layout
│   │   ├── providers.tsx                     # Context providers
│   │   └── globals.css                       # Global styles
│   │
│   ├── components/                            # React Components
│   │   ├── ui/                               # Shadcn/UI design system
│   │   │   ├── button.tsx                    # Button component
│   │   │   ├── card.tsx                      # Card container
│   │   │   ├── dialog.tsx                    # Modal dialog
│   │   │   ├── table.tsx                     # Data table
│   │   │   ├── tabs.tsx                      # Tabbed interface
│   │   │   ├── dropdown-menu.tsx             # Dropdown menus
│   │   │   ├── calendar.tsx                  # Calendar picker
│   │   │   ├── checkbox.tsx                  # Checkbox input
│   │   │   ├── input.tsx                     # Text input
│   │   │   ├── select.tsx                    # Select dropdown
│   │   │   ├── badge.tsx                     # Label badge
│   │   │   ├── avatar.tsx                    # User avatar
│   │   │   ├── sidebar.tsx                   # Navigation sidebar
│   │   │   ├── popover.tsx                   # Popover overlay
│   │   │   ├── scroll-area.tsx               # Scrollable area
│   │   │   ├── progress.tsx                  # Progress bar
│   │   │   ├── toast.tsx, toaster.tsx        # Toast notifications
│   │   │   └── sonner.tsx                    # Toast system
│   │   ├── ai-agent-view.tsx                 # AI Agent dashboard view
│   │   ├── meeting-matches.tsx               # Task matching results display
│   │   ├── intervals-key-dialog.tsx          # API key input dialog
│   │   ├── date-range-picker.tsx             # Date range selector
│   │   ├── session-warning.tsx               # Session expiry warning
│   │   ├── pm2-status.tsx                    # PM2 status display (AI agent)
│   │   ├── log-viewer.tsx                    # Log viewing component
│   │   ├── ReleaseNotes.tsx                  # Release notes dialog
│   │   └── UserManual.tsx                    # User documentation
│   │
│   ├── lib/                                   # Shared Utilities
│   │   ├── database.ts                       # SQLite database management ⭐
│   │   ├── intervals-api.ts                  # Intervals API client ⭐
│   │   ├── azure-openai.ts                   # Azure OpenAI integration ⭐
│   │   ├── matching-utils.ts                 # Task matching algorithms
│   │   ├── timezone-utils.ts                 # IST timezone handling
│   │   ├── graph-app-auth.ts                 # Microsoft Graph app auth
│   │   ├── posted-meetings-storage.ts        # Posted meetings persistence
│   │   ├── user-storage.ts                   # User API key storage
│   │   ├── types.ts                          # TypeScript interfaces
│   │   ├── utils.ts                          # General utilities
│   │   └── api-helpers.ts                    # API response helpers
│   │
│   ├── interfaces/                            # TypeScript Types
│   │   ├── meetings.ts                       # Meeting-related types
│   │   ├── time-entries.ts                   # Time entry types
│   │   └── queue.ts                          # Queue types (AI agent)
│   │
│   ├── hooks/                                 # React Hooks
│   │   └── use-toast.ts                      # Toast notification hook
│   │
│   └── ai-agent/                              # AI Agent System (Part 2)
│       └── [See Part 2 documentation]
│
├── public/                                     # Static Assets
│   └── [images, icons, etc.]
│
├── data/                                       # Application Data
│   └── application.sqlite                     # SQLite database file
│
├── logs/                                       # Application Logs
│   ├── ai-agent-out.log                       # AI agent output
│   └── ai-agent-error.log                     # AI agent errors
│
├── Configuration Files
├── package.json                                # Dependencies
├── tsconfig.json                               # TypeScript config
├── next.config.ts                              # Next.js config
├── tailwind.config.ts                          # Tailwind CSS config
├── pm2.config.js                               # PM2 config (AI agent)
├── ai-agent-server.js                          # AI agent entry point
├── CLAUDE.md                                   # Development guide
├── README.md                                   # Project README
└── .env.local                                  # Environment variables (not in repo)
```

### Key Files Reference
| File Path | Purpose | Used In |
|-----------|---------|---------|
| `src/lib/database.ts` | SQLite database operations | Both workflows |
| `src/lib/intervals-api.ts` | Intervals API client | Both workflows |
| `src/app/dashboard/page.tsx` | Main manual workflow UI | Manual only |
| `src/app/api/meetings/route.ts` | Fetch meetings from Graph API | Both workflows |
| `src/app/api/meetings/match/route.ts` | AI task matching endpoint | Both workflows |
| `src/lib/azure-openai.ts` | OpenAI integration | Both workflows |
| `src/components/meeting-matches.tsx` | Task matching UI | Manual only |

---

## 4. Database Schema

### Database Technology
- **Engine:** SQLite 3
- **Driver:** better-sqlite3 (synchronous, faster than async)
- **Location:** `data/application.sqlite`
- **Initialization:** Automatic on first startup via `src/lib/database.ts`

### Tables

#### 4.1 `users` Table
Stores user account information and Intervals API keys.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,          -- Azure AD user ID
  email TEXT UNIQUE NOT NULL,             -- User email address
  intervals_api_key TEXT,                 -- Intervals API key (encrypted)
  last_sync DATETIME,                     -- Last sync timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**Indexes:**
- `UNIQUE(user_id)`
- `UNIQUE(email)`

**Key Operations:**
- `createUser(userId, email)` - Create new user record
- `updateUserApiKey(userId, apiKey)` - Save/update API key
- `getUserByEmail(email)` - Retrieve user by email

**Location:** `src/lib/database.ts:45-62`

---

#### 4.2 `user_settings` Table
Stores user preferences and AI agent configuration.

```sql
CREATE TABLE user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT false,          -- AI agent enabled/disabled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
)
```

**Indexes:**
- `UNIQUE(user_id)`

**Key Fields:**
- `enabled` - Controls whether AI agent processes meetings for this user

**Location:** `src/lib/database.ts:64-77`

---

#### 4.3 `meetings` Table
Tracks posted meetings and their associated time entries.

```sql
CREATE TABLE meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL,               -- Microsoft Graph meeting ID
  user_id TEXT NOT NULL,                  -- Owner of time entry
  time_entry TEXT,                        -- JSON string of time entry data
  raw_response TEXT,                      -- JSON string of raw API response
  posted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  task_name TEXT,                         -- Matched task name
  report_id TEXT,                         -- Attendance report ID (unique per instance)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE(user_id, report_id)             -- Prevents duplicate posting
)
```

**Indexes:**
- `idx_meetings_user_id ON meetings(user_id)`
- `idx_meetings_meeting_id ON meetings(meeting_id)`
- `idx_meetings_report_id ON meetings(report_id)`

**Key Fields:**
- `report_id` - Critical for multi-attendance meetings (same meeting ID, different report IDs)
- `time_entry` - JSON with: `{projectid, moduleid, taskid, date, time, description, billable}`
- `raw_response` - Full Intervals API response for debugging

**Important:** The `UNIQUE(user_id, report_id)` constraint prevents duplicate time entries for the same meeting instance.

**Location:** `src/lib/database.ts:79-103`

---

#### 4.4 `reviews` Table
Stores AI agent meeting review data and analysis results.

```sql
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL,
  subject TEXT,                           -- Meeting subject/title
  start_time DATETIME,                    -- Meeting start (ISO 8601)
  end_time DATETIME,                      -- Meeting end (ISO 8601)
  duration REAL,                          -- Duration in seconds
  status TEXT DEFAULT 'pending',          -- pending, approved, rejected
  confidence INTEGER DEFAULT 0,           -- AI confidence score (0-100)
  reason TEXT,                            -- Match explanation
  report_id TEXT,                         -- Attendance report ID
  participants TEXT,                      -- JSON array of attendees
  key_points TEXT,                        -- JSON array of meeting insights
  suggested_tasks TEXT,                   -- JSON array of task suggestions
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE(user_id, report_id)
)
```

**Indexes:**
- `idx_reviews_user_id ON reviews(user_id)`
- `idx_reviews_status ON reviews(status)`
- `idx_reviews_report_id ON reviews(report_id)`
- `idx_reviews_user_report_unique ON reviews(user_id, report_id) WHERE report_id IS NOT NULL`

**Key Fields:**
- `status` - Workflow state: 'pending' → 'approved' → posted OR 'rejected' → skipped
- `confidence` - 0-100 score from AI matching (80+ = high, 50-80 = medium, 0-50 = low)
- `participants` - JSON: `[{name, email, duration, role}]`
- `suggested_tasks` - JSON: `[{taskId, taskName, confidence, reason}]`

**Location:** `src/lib/database.ts:105-138`

---

### Database Operations

#### Common Queries (src/lib/database.ts)

**Check if Meeting is Posted:**
```typescript
isMeetingPosted(userId: string, reportId: string): boolean
// Location: Line 250-260
```

**Save Meeting (After Posting):**
```typescript
saveMeeting(meeting: {
  meeting_id: string,
  user_id: string,
  time_entry: string,    // JSON
  raw_response: string,  // JSON
  task_name: string,
  report_id: string
}): void
// Location: Line 180-205
```

**Get Posted Meetings for User:**
```typescript
getMeetingsByUser(userId: string): Meeting[]
// Location: Line 207-226
// Returns all posted meetings with time entry details
```

**Create User:**
```typescript
createUser(userId: string, email: string): void
// Location: Line 140-165
```

---

## 5. Authentication & Authorization

### Authentication Flow

```
┌─────────────┐
│   User      │
│  Browser    │
└──────┬──────┘
       │
       │ 1. Navigate to app
       ↓
┌──────────────────────┐
│  Landing Page        │
│  (page.tsx)          │
│  "Sign in with       │
│   NathCorp Org ID"   │
└──────┬───────────────┘
       │
       │ 2. Click sign in
       ↓
┌──────────────────────┐
│  NextAuth.js         │
│  (auth.ts)           │
│  Redirects to Azure  │
└──────┬───────────────┘
       │
       │ 3. OAuth 2.0 flow
       ↓
┌──────────────────────┐
│  Azure AD            │
│  Authenticates user  │
│  Returns tokens      │
└──────┬───────────────┘
       │
       │ 4. Access token + ID token
       ↓
┌──────────────────────┐
│  NextAuth.js         │
│  Creates session     │
│  - JWT with token    │
│  - User info         │
└──────┬───────────────┘
       │
       │ 5. Session cookie set
       ↓
┌──────────────────────┐
│  Dashboard           │
│  (dashboard/page.tsx)│
│  - Access protected  │
│  - Use Graph API     │
└──────────────────────┘
```

### Authentication Configuration

**File:** `src/app/api/auth/[...nextauth]/auth.ts`

```typescript
import { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: "openid profile email User.Read Calendars.Read OnlineMeetings.Read offline_access"
        }
      }
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Store access token in JWT
      if (account) {
        token.accessToken = account.access_token;
        token.userId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      // Add access token to session (available on client)
      session.accessToken = token.accessToken as string;
      session.userId = token.userId as string;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  }
};
```

### Required OAuth Scopes

| Scope | Purpose | Used For |
|-------|---------|----------|
| `openid` | Basic authentication | User identity |
| `profile` | User profile info | Display name, photo |
| `email` | User email address | User identification |
| `User.Read` | Read user profile | Microsoft Graph API |
| `Calendars.Read` | Read calendar events | Fetch meetings |
| `OnlineMeetings.Read` | Read online meeting details | Attendance reports |
| `offline_access` | Refresh token | Long-lived sessions |

### Session Structure

**Client-side session object:**
```typescript
{
  user: {
    name: string;        // "John Doe"
    email: string;       // "john.doe@example.com"
    image: string;       // Profile photo URL
  },
  accessToken: string;   // Microsoft Graph API access token
  userId: string;        // Azure AD user ID
  expires: string;       // ISO 8601 expiry time
}
```

**Accessing Session:**
```typescript
import { useSession } from "next-auth/react";

const { data: session, status } = useSession();
if (status === "authenticated") {
  const accessToken = session.accessToken;
  const userId = session.userId;
}
```

### Protected Routes

**Client-side protection:**
```typescript
// src/app/dashboard/page.tsx
import { useSession } from "next-auth/react";

export default function Dashboard() {
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      window.location.href = '/';
    },
  });

  if (status === "loading") return <div>Loading...</div>;
  // ... dashboard content
}
```

**Server-side protection:**
```typescript
// src/app/api/meetings/route.ts
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/auth";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ... API logic
}
```

### Environment Variables Required

```bash
# Azure AD Application (Delegated Permissions - User Context)
AZURE_AD_CLIENT_ID=<your-client-id>
AZURE_AD_CLIENT_SECRET=<your-client-secret>
AZURE_AD_TENANT_ID=<your-tenant-id>

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-secret-string>
```

**Generate secret:**
```bash
openssl rand -base64 32
```

---

## 6. External API Integrations

### 6.1 Microsoft Graph API

**Purpose:** Fetch meeting data and attendance reports from Microsoft Teams/Outlook

**Base URL:** `https://graph.microsoft.com/v1.0`

**Authentication:** OAuth 2.0 Bearer token (from NextAuth session)

**Permission Type:** Delegated (user context)

#### Endpoints Used

**1. Get Calendar View (Meetings)**
```http
GET /me/calendarView
  ?startDateTime={UTC_START}
  &endDateTime={UTC_END}
  &$top=999
  &$select=subject,start,end,isOnlineMeeting,onlineMeeting
  &$filter=isOnlineMeeting eq true

Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "value": [
    {
      "id": "AAMkAGI...",
      "subject": "Sprint Planning",
      "start": { "dateTime": "2025-01-15T04:00:00", "timeZone": "UTC" },
      "end": { "dateTime": "2025-01-15T05:00:00", "timeZone": "UTC" },
      "isOnlineMeeting": true,
      "onlineMeeting": {
        "joinUrl": "https://teams.microsoft.com/l/meetup/...",
        "conferenceId": "123456789"
      }
    }
  ]
}
```

**Implementation:** `src/app/api/meetings/route.ts:50-100`

---

**2. Get Attendance Reports**
```http
GET /users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports

Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "value": [
    {
      "id": "report-abc123",
      "meetingStartDateTime": "2025-01-15T04:00:00Z",
      "meetingEndDateTime": "2025-01-15T05:00:00Z",
      "totalParticipantCount": 5
    }
  ]
}
```

**Implementation:** `src/app/api/meetings/route.ts:120-150`

---

**3. Get Attendance Records**
```http
GET /users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports/{reportId}/attendanceRecords

Authorization: Bearer {accessToken}
```

**Response:**
```json
{
  "value": [
    {
      "emailAddress": "john.doe@example.com",
      "totalAttendanceInSeconds": 3600,
      "role": "Presenter",
      "identity": {
        "displayName": "John Doe"
      },
      "attendanceIntervals": [
        {
          "joinDateTime": "2025-01-15T04:05:00Z",
          "leaveDateTime": "2025-01-15T05:05:00Z",
          "durationInSeconds": 3600
        }
      ]
    }
  ]
}
```

**Implementation:** `src/app/api/meetings/route.ts:160-200`

---

#### Graph API Error Handling

**Common Errors:**
| Status | Meaning | Solution |
|--------|---------|----------|
| 401 | Unauthorized | Refresh access token (re-login) |
| 403 | Forbidden | Check OAuth scopes |
| 404 | Not Found | Meeting/report doesn't exist |
| 429 | Too Many Requests | Implement rate limiting |
| 500 | Server Error | Retry with exponential backoff |

**Implementation:** `src/app/api/meetings/route.ts:250-280`

---

### 6.2 Intervals API

**Purpose:** Task management and time tracking system

**Base URL:** `https://api.myintervals.com`

**Authentication:** API key in request header

**Protocol:** REST API with XML responses (legacy)

**Documentation:** https://www.myintervals.com/api/

#### Configuration

**API Key Location:**
- User enters key in `IntervalsKeyDialog` component
- Stored in SQLite: `users.intervals_api_key`
- Passed to API via custom header: `x-user-id: {userId}`

**API Proxy:** `src/app/api/intervals-proxy/route.ts`
- All Intervals requests go through this proxy
- Proxy adds authentication header
- Converts XML responses to JSON

#### Endpoints Used

**1. Get Current User**
```http
GET /api/v1/person/me

Headers:
  Accept: application/json
  Authorization: Basic {base64(apiKey:X)}
```

**Response:**
```json
{
  "personid": "123456",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "active": true
}
```

**Implementation:** `src/lib/intervals-api.ts:180-210`

---

**2. Get Tasks (Assigned to User)**
```http
GET /api/v1/task?hastaskrelation={personId}&active=t

Headers:
  Accept: application/json
  Authorization: Basic {base64(apiKey:X)}
```

**Response:**
```json
{
  "task": [
    {
      "id": "789012",
      "title": "Implement user authentication",
      "active": true,
      "projectid": "456",
      "moduleid": "234",
      "status": "Active"
    }
  ]
}
```

**Implementation:** `src/lib/intervals-api.ts:90-150`

---

**3. Get Task Details**
```http
GET /api/v1/task/{taskId}?detailed=true

Headers:
  Accept: application/json
  Authorization: Basic {base64(apiKey:X)}
```

**Response:**
```json
{
  "task": {
    "id": "789012",
    "title": "Implement user authentication",
    "projectid": "456",
    "moduleid": "234",
    "project": "Mobile App",
    "module": "Authentication",
    "client": "Acme Corp",
    "clientid": "123"
  }
}
```

**Implementation:** `src/lib/intervals-api.ts:220-260`

---

**4. Create Time Entry**
```http
POST /api/v1/time

Headers:
  Accept: application/json
  Content-Type: application/json
  Authorization: Basic {base64(apiKey:X)}

Body:
{
  "time": {
    "personid": "123456",
    "taskid": "789012",
    "projectid": "456",
    "moduleid": "234",
    "date": "2025-01-15",
    "time": 1.5,               // decimal hours
    "description": "Sprint Planning",
    "worktypeid": "813419",    // India-Meeting
    "billable": "t"            // 't' or 'f'
  }
}
```

**Response:**
```json
{
  "time": {
    "id": "567890",
    "personid": "123456",
    "taskid": "789012",
    "date": "2025-01-15",
    "time": 1.5,
    "description": "Sprint Planning",
    "billable": "t",
    "status": "approved"
  }
}
```

**Implementation:** `src/lib/intervals-api.ts:340-430`

---

**5. Get Work Types**
```http
GET /api/v1/worktype

Headers:
  Accept: application/json
  Authorization: Basic {base64(apiKey:X)}
```

**Response:**
```json
{
  "worktype": [
    {
      "id": "813419",
      "worktype": "India-Meeting",
      "active": true
    }
  ]
}
```

**Implementation:** `src/lib/intervals-api.ts:280-310`

---

#### Intervals Data Model

**Hierarchy:**
```
Client (e.g., "Acme Corp")
  └── Project (e.g., "Mobile App")
       └── Module (e.g., "Authentication")
            └── Task (e.g., "Implement login")
                 └── Time Entry (hours logged)
```

**Work Type:** Category of work (Meeting, Development, Bug Fix, etc.)
- **ID:** 813419
- **Name:** "India-Meeting"
- **Purpose:** Hardcoded for all meeting time entries

**Billable vs Non-Billable:**
- Determined by client name
- If client contains "Internal" or "Nathcorp" → Non-billable (`'f'`)
- Otherwise → Billable (`'t'`)

**Implementation:** `src/lib/intervals-api.ts:400-410`

---

### 6.3 Azure OpenAI API

**Purpose:** AI-powered task matching using GPT models

**Base URL:** `{AZURE_OPENAI_ENDPOINT}/openai/deployments/{DEPLOYMENT_NAME}`

**Authentication:** API key in header

**Model:** GPT-4 or GPT-4 Turbo (configurable)

#### Configuration

**Environment Variables:**
```bash
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_DEPLOYMENT=<deployment-name>
```

**Rate Limiting:**
- Token bucket algorithm
- 100 tokens/second (configurable)
- Max burst: 200 tokens

**Implementation:** `src/lib/azure-openai.ts`

---

#### API Usage

**Endpoint:**
```http
POST /openai/deployments/{deploymentName}/chat/completions
  ?api-version=2024-02-15-preview

Headers:
  api-key: {AZURE_OPENAI_API_KEY}
  Content-Type: application/json

Body:
{
  "messages": [
    {
      "role": "system",
      "content": "You are a task matching assistant..."
    },
    {
      "role": "user",
      "content": "Match meeting 'Sprint Planning' to one of these tasks: [...]"
    }
  ],
  "temperature": 0.3,
  "max_tokens": 500,
  "response_format": { "type": "json_object" }
}
```

**Expected Response:**
```json
{
  "choices": [
    {
      "message": {
        "content": "{\"taskId\":\"789012\",\"confidence\":0.85,\"reason\":\"Meeting title contains 'Sprint Planning' which matches task context\"}"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 50,
    "total_tokens": 200
  }
}
```

**Implementation:** `src/lib/azure-openai.ts:80-150`

---

#### Matching Algorithm

**Step 1: Keyword Matching (Fast Path)**
```typescript
// src/lib/matching-utils.ts
function findKeywordMatches(meetingTitle: string, tasks: Task[]): Match | null {
  for (const task of tasks) {
    const similarity = calculateSimilarity(meetingTitle, task.title);
    if (similarity > 0.7 && confidence > 0.5) {
      return { task, confidence, reason: "Keyword match" };
    }
  }
  return null;
}
```

**Step 2: AI Matching (Fallback)**
```typescript
// src/lib/azure-openai.ts
async function matchMeetingToTask(
  meetingTitle: string,
  tasks: Task[]
): Promise<MatchResult> {
  const prompt = generateMatchingPrompt(meetingTitle, tasks);
  const completion = await getCompletion(prompt);
  return JSON.parse(completion.content);
}
```

**Confidence Thresholds:**
- **High:** 0.8 - 1.0 (80-100%)
- **Medium:** 0.5 - 0.8 (50-80%)
- **Low:** 0.1 - 0.5 (10-50%)
- **Unmatched:** 0.0 (0%)

**Implementation:** `src/app/api/meetings/match/route.ts:100-250`

---

## 7. Manual Workflow - Complete Flow

This section documents the step-by-step user journey through the manual time tracking workflow.

### Phase 1: Login & Authentication

**Entry Point:** User navigates to application URL

**Step 1: Landing Page**
- **File:** `src/app/page.tsx`
- **UI Elements:**
  - Application logo and branding
  - "Sign in with NathCorp Organization ID" button
  - Welcome message
- **Action:** User clicks sign-in button
- **Code Reference:** `src/app/page.tsx:45-80`

**Step 2: Azure AD Authentication**
- **Trigger:** NextAuth redirects to Azure AD
- **Flow:**
  1. User enters credentials on Microsoft login page
  2. Azure AD validates credentials
  3. User consents to requested scopes (if first time)
  4. Azure AD returns authorization code
  5. NextAuth exchanges code for access token
- **File:** `src/app/api/auth/[...nextauth]/auth.ts`
- **Code Reference:** `src/app/api/auth/[...nextauth]/auth.ts:20-60`

**Step 3: Session Creation**
- **Process:**
  1. NextAuth creates JWT with access token
  2. Session cookie set in browser
  3. User redirected to `/dashboard`
- **Session Data:**
  ```typescript
  {
    user: { name, email, image },
    accessToken: "eyJ0eXAiOiJKV1...",
    userId: "azure-ad-user-id",
    expires: "2025-01-16T12:00:00Z"
  }
  ```
- **Code Reference:** `src/app/api/auth/[...nextauth]/auth.ts:35-50`

---

### Phase 2: Setup - Intervals API Key

**Step 4: Dashboard Load**
- **File:** `src/app/dashboard/page.tsx`
- **Initial Checks:**
  1. Verify session exists (redirect to login if not)
  2. Check if user has Intervals API key
  3. If no key → show `IntervalsKeyDialog`
- **Code Reference:** `src/app/dashboard/page.tsx:100-150`

**Step 5: API Key Input**
- **Component:** `src/components/intervals-key-dialog.tsx`
- **UI Elements:**
  - Modal dialog (non-dismissible)
  - Text input for 11-character API key
  - "Validate" button
  - Help text with instructions
- **Validation:**
  1. User enters API key
  2. Click "Validate" button
  3. App calls: `POST /api/intervals/validate`
     ```typescript
     { apiKey: "xxxxxxxxxxx" }
     ```
  4. Backend validates by calling Intervals `/person/me`
  5. If valid → save to SQLite
  6. If invalid → show error message
- **Code Reference:** `src/components/intervals-key-dialog.tsx:80-150`

**Step 6: User Record Creation**
- **Process:**
  1. Check if user exists in SQLite: `getUserByEmail(email)`
  2. If not exists → `createUser(userId, email)`
  3. Update API key: `updateUserApiKey(userId, apiKey)`
- **Database Operations:**
  ```sql
  INSERT OR IGNORE INTO users (user_id, email, intervals_api_key)
  VALUES (?, ?, ?)
  ```
- **Code Reference:** `src/lib/database.ts:140-175`

---

### Phase 3: Fetch Meetings

**Step 7: Date Range Selection**
- **Component:** `src/components/date-range-picker.tsx`
- **UI Elements:**
  - Calendar popover
  - "From" and "To" date pickers
  - Preset ranges (Last 7 days, Last 30 days, This Month)
  - "Apply" button
- **Default:** Last 7 days from today
- **Timezone:** User selects dates in IST (Indian Standard Time)
- **Code Reference:** `src/components/date-range-picker.tsx:50-200`

**Step 8: Fetch Meetings from Graph API**
- **Trigger:** User selects date range and clicks "Fetch Meetings"
- **Client-side Process:**
  ```typescript
  const fetchMeetings = async () => {
    // Convert IST dates to UTC
    const { utcStart, utcEnd } = convertDateRangeToUTC(fromDate, toDate);

    // API call
    const response = await fetch(
      `/api/meetings?from=${utcStart}&to=${utcEnd}`
    );
    const data = await response.json();
    setMeetings(data.meetings);
  };
  ```
- **Code Reference:** `src/app/dashboard/page.tsx:263-317`

**Step 9: Backend Meeting Retrieval**
- **File:** `src/app/api/meetings/route.ts`
- **Process:**
  1. Get session and access token
  2. Call Microsoft Graph API: `/me/calendarView`
     - Filter: `isOnlineMeeting eq true`
     - Select: `subject, start, end, isOnlineMeeting, onlineMeeting`
  3. For each meeting:
     a. Extract organizer ID from meeting data
     b. Fetch attendance reports: `/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports`
     c. For each report:
        - Fetch attendance records: `.../attendanceReports/{reportId}/attendanceRecords`
        - Calculate total attendance duration per user
  4. Filter meetings by IST date range (account for timezone offset)
  5. Check SQLite for already-posted meetings: `isMeetingPosted(userId, reportId)`
  6. Return filtered list
- **Code Reference:** `src/app/api/meetings/route.ts:30-280`

**Step 10: Display Fetched Meetings**
- **Component:** `src/app/dashboard/page.tsx` (Fetched Meetings tab)
- **Table Columns:**
  - Meeting Subject
  - Scheduled Date/Time (IST)
  - Actual Duration (formatted: "1h 30m")
  - Attendance Status (✓ Attended / ✗ Not Attended)
  - Actions (Post Time Entry button - shown later)
- **Filtering:**
  - Only show meetings where user actually attended (duration > 0)
  - Exclude meetings already posted (checked via SQLite)
- **Code Reference:** `src/app/dashboard/page.tsx:450-550`

**Example Display:**
```
Subject: Sprint Planning
Scheduled: Jan 15, 2025 9:30 AM IST
Duration: 1h 15m
Status: ✓ Attended
```

---

### Phase 4: Match Meetings to Tasks

**Step 11: Initiate Task Matching**
- **Trigger:** User clicks "Match Tasks" button
- **Pre-processing:**
  1. Expand multi-attendance meetings:
     - Same meeting attended multiple times = separate instances
     - Each attendance report ID = unique meeting instance
  2. Filter out already-matched meetings
  3. Prepare batch for processing (max 50 meetings at once)
- **Code Reference:** `src/app/dashboard/page.tsx:555-600`

**Step 12: Fetch Available Tasks**
- **API Call:** `GET /api/intervals/tasks`
- **Backend Process:**
  1. Get user's Intervals API key from SQLite
  2. Authenticate with Intervals API
  3. Get current user's person ID: `GET /person/me`
  4. Fetch assigned tasks: `GET /task?hastaskrelation={personId}&active=t`
  5. For each task, get detailed info (client, project, module)
  6. Return enriched task list
- **Response Structure:**
  ```json
  {
    "tasks": [
      {
        "id": "789012",
        "title": "Implement user authentication",
        "project": "Mobile App",
        "module": "Authentication",
        "client": "Acme Corp",
        "status": "Active"
      }
    ]
  }
  ```
- **Code Reference:** `src/lib/intervals-api.ts:90-180`

**Step 13: AI-Powered Matching**
- **API Call:** `POST /api/meetings/match`
- **Request Body:**
  ```json
  {
    "meetings": [
      {
        "subject": "Sprint Planning",
        "startTime": "2025-01-15T04:00:00Z",
        "attendanceDuration": 4500
      }
    ],
    "tasks": [...]
  }
  ```
- **Backend Matching Algorithm:**
  ```
  FOR EACH meeting:

    1. KEYWORD MATCHING (Fast Path):
       - Tokenize meeting title and task titles
       - Calculate similarity ratio (Levenshtein distance)
       - If similarity > 70% AND confidence > 50%:
           → Use keyword match
           → Skip AI matching (cost savings)

    2. CHECK ATTENDANCE:
       - If duration = 0 (user didn't attend):
           → Mark as "Not Attended"
           → Skip time entry creation
           → confidence = 0

    3. AI MATCHING (Fallback):
       - If attended but no keyword match:
           → Generate matching prompt:
             "Match meeting '{subject}' to one of these tasks: [task list]
              Consider: title similarity, project relevance, recent activity"
           → Call Azure OpenAI API
           → Parse JSON response: { taskId, confidence, reason }
           → Cache response (key: meeting title + task list hash, TTL: 24h)

    4. CATEGORIZE RESULT:
       - confidence >= 0.8 → High Confidence
       - confidence >= 0.5 && < 0.8 → Medium Confidence
       - confidence > 0 && < 0.5 → Low Confidence
       - confidence = 0 → Unmatched

  RETURN categorized matches
  ```
- **Code Reference:** `src/app/api/meetings/match/route.ts:50-250`

**Step 14: Display Task Matches**
- **Component:** `src/components/meeting-matches.tsx`
- **UI Layout:**
  - **High Confidence Section** (Green badges, 80-100%)
    - Auto-selected for posting
    - Shows matched task prominently
    - "Post" button enabled
  - **Medium Confidence Section** (Yellow badges, 50-80%)
    - Shows matched task
    - Allows task selection change
    - "Post" button enabled after review
  - **Low Confidence Section** (Orange badges, 10-50%)
    - Shows suggested task (if any)
    - Requires manual task selection
    - Dropdown to choose different task
  - **Unmatched Section** (Red badges, 0%)
    - No suggested task
    - Requires manual task selection
    - Can skip or manually match
- **Code Reference:** `src/components/meeting-matches.tsx:80-400`

**Example Display:**
```
HIGH CONFIDENCE MATCHES (85%)

Sprint Planning
  Date: Jan 15, 2025 9:30 AM
  Duration: 1h 15m
  Matched Task: Sprint Planning & Retrospective
  Project: Mobile App → Authentication
  Reason: Exact title match with project context
  Confidence: 95%
  [Post Time Entry] [Change Task ▼]

MEDIUM CONFIDENCE MATCHES (65%)

Client Call
  Date: Jan 15, 2025 2:00 PM
  Duration: 45m
  Matched Task: Client Communication
  Project: Web Portal → Support
  Reason: Meeting type and client name alignment
  Confidence: 68%
  [Post Time Entry] [Change Task ▼]
```

---

### Phase 5: Post Time Entries

**Step 15: Review and Modify Matches**
- **User Actions:**
  1. Review high-confidence matches (usually accurate)
  2. Check medium-confidence matches
  3. For low-confidence or unmatched:
     - Click "Change Task" dropdown
     - Search and select appropriate task
     - Or skip meeting (no time entry created)
- **Code Reference:** `src/components/meeting-matches.tsx:200-280`

**Step 16: Post Single Time Entry**
- **Trigger:** User clicks "Post Time Entry" button for a meeting
- **Client-side Process:**
  ```typescript
  const postTimeEntry = async (meeting, selectedTask) => {
    // Calculate time in decimal hours
    const durationSeconds = meeting.attendanceDuration;
    const hours = durationSeconds / 3600;

    // Get meeting date in IST
    const date = formatToIST(meeting.startTime, "yyyy-MM-dd");

    // Determine billable status
    const billable = selectedTask.client.toLowerCase().includes("internal")
      ? 'f' : 't';

    // Create time entry payload
    const payload = {
      taskId: selectedTask.id,
      projectId: selectedTask.projectId,
      moduleId: selectedTask.moduleId,
      date: date,
      time: hours,
      description: meeting.subject,
      workTypeId: "813419", // India-Meeting
      billable: billable,
      reportId: meeting.meetingInfo.reportId
    };

    // Post to Intervals
    const response = await fetch('/api/intervals-proxy', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Save to database
    if (response.ok) {
      await saveMeetingToDatabase(meeting, response.data);
      showSuccessToast();
      removeMeetingFromList(meeting);
    }
  };
  ```
- **Code Reference:** `src/app/dashboard/page.tsx:680-750`

**Step 17: Create Time Entry in Intervals**
- **File:** `src/lib/intervals-api.ts`
- **Function:** `createTimeEntry()`
- **Process:**
  1. Validate required fields (taskId, date, time)
  2. Get task details to determine billable status
  3. Build time entry payload:
     ```json
     {
       "time": {
         "personid": "123456",
         "taskid": "789012",
         "projectid": "456",
         "moduleid": "234",
         "date": "2025-01-15",
         "time": 1.25,
         "description": "Sprint Planning",
         "worktypeid": "813419",
         "billable": "t"
       }
     }
     ```
  4. Call Intervals API: `POST /time`
  5. Parse XML response
  6. Convert to JSON
  7. Return time entry ID and full response
- **Code Reference:** `src/lib/intervals-api.ts:340-430`

**Step 18: Save Meeting to Database**
- **File:** `src/lib/database.ts`
- **Function:** `saveMeeting()`
- **Database Insert:**
  ```sql
  INSERT INTO meetings (
    meeting_id,
    user_id,
    time_entry,
    raw_response,
    task_name,
    report_id,
    posted_at
  ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id, report_id) DO NOTHING
  ```
- **Data Stored:**
  - `meeting_id` - Microsoft Graph meeting ID
  - `user_id` - Current user's Azure AD ID
  - `time_entry` - JSON with time entry details
  - `raw_response` - Full Intervals API response
  - `task_name` - Task title for quick reference
  - `report_id` - Attendance report ID (unique constraint)
- **Purpose:** Prevent duplicate time entries for same meeting instance
- **Code Reference:** `src/lib/database.ts:180-205`

**Step 19: UI Update**
- **Actions:**
  1. Remove posted meeting from "Fetched Meetings" list
  2. Show success toast notification:
     - "Time entry posted successfully for {meeting subject}"
     - Duration, task, and project displayed
  3. Update match statistics
  4. Enable "View Posted Meetings" link
- **Code Reference:** `src/app/dashboard/page.tsx:750-780`

---

### Phase 6: Verify Posted Meetings

**Step 20: View Posted Meetings**
- **Navigation:** Switch to "AI Agent" tab (shows posted meetings for manual workflow too)
- **Component:** `src/components/ai-agent-view.tsx`
- **Data Source:** `GET /api/user/data?type=posted-meetings`
- **Backend Query:**
  ```sql
  SELECT
    m.meeting_id,
    m.task_name,
    m.time_entry,
    m.posted_at,
    m.report_id
  FROM meetings m
  WHERE m.user_id = ?
  ORDER BY m.posted_at DESC
  LIMIT 100
  ```
- **Code Reference:** `src/lib/database.ts:207-230`

**Step 21: Posted Meetings Display**
- **Table Columns:**
  - Meeting Date (IST)
  - Meeting Name
  - Task Name
  - Duration (hours)
  - Client
  - Project
  - Module
  - Work Type (always "India-Meeting")
  - Billable Status (Yes/No)
  - Posted At (timestamp)
- **Features:**
  - Search/filter by meeting name, task, client, project
  - Sort by any column
  - Export to CSV
  - Clear history (soft delete)
- **Code Reference:** `src/components/ai-agent-view.tsx:150-350`

**Example Display:**
```
Posted Meetings (Last 30 Days)

Date       | Meeting          | Task             | Duration | Client    | Project   | Billable
-----------|------------------|------------------|----------|-----------|-----------|----------
Jan 15, 25 | Sprint Planning  | Sprint Planning  | 1.25h    | Acme Corp | Mobile    | Yes
Jan 15, 25 | Client Call      | Client Comm      | 0.75h    | Acme Corp | Support   | Yes
Jan 14, 25 | Team Sync        | Daily Standup    | 0.50h    | Internal  | Internal  | No
```

**Step 22: Verify in Intervals**
- **User Action:** Log into Intervals time tracking system
- **Navigation:** My Timesheet → Select date
- **Verification:** Confirm time entries appear with:
  - Correct date, duration, task, description
  - Work type: "India-Meeting"
  - Billable status: Matches expectations
- **Approval:** Manager approves time entries in Intervals (separate workflow)

---

### Error Handling & Edge Cases

#### Session Expiry
- **Detection:** API calls return 401 Unauthorized
- **Handler:** `src/components/session-warning.tsx`
- **User Experience:**
  1. Warning toast appears: "Session expiring soon"
  2. Countdown timer (5 minutes)
  3. "Extend Session" button (refreshes token)
  4. If expired → redirect to login page
- **Code Reference:** `src/components/session-warning.tsx:40-120`

#### Date Picker Offset Issue
- **Known Issue:** Calendar date picker has +1 day offset
- **Workaround:** User selects day AFTER intended date
- **Example:** To fetch Jan 15 meetings → select Jan 16
- **Root Cause:** Timezone conversion bug in date-fns library
- **Code Reference:** `src/components/date-range-picker.tsx:80-100`

#### Duplicate Time Entry Prevention
- **Mechanism:** Database unique constraint on `(user_id, report_id)`
- **Flow:**
  1. Before posting, check: `isMeetingPosted(userId, reportId)`
  2. If exists → show warning, skip post
  3. On insert conflict → no-op (idempotent)
- **Code Reference:** `src/lib/database.ts:250-260`

#### Meeting Refresh After Posting
- **Issue:** Posted meetings still show in "Fetched Meetings" list
- **Workaround:** User must refresh page to update list
- **Planned Fix:** Implement real-time list update after posting
- **Code Reference:** `src/app/dashboard/page.tsx:780-800`

#### No Tasks Found
- **Scenario:** User has no assigned tasks in Intervals
- **Handling:**
  1. Display warning message
  2. Suggest checking Intervals account
  3. Provide link to Intervals help docs
  4. Disable task matching
- **Code Reference:** `src/app/dashboard/page.tsx:320-350`

#### Graph API Rate Limiting
- **Detection:** 429 Too Many Requests response
- **Handling:**
  1. Extract `Retry-After` header
  2. Show toast: "Rate limit reached, retrying in {seconds}s"
  3. Implement exponential backoff
  4. Retry with delay
- **Code Reference:** `src/app/api/meetings/route.ts:250-280`

---

## 8. API Routes Reference

### Authentication Routes

#### POST `/api/auth/signin`
**Purpose:** Initiate Azure AD login flow

**Method:** POST

**Authentication:** None (public endpoint)

**Request Body:** None

**Response:**
```json
{
  "url": "https://login.microsoftonline.com/...",
  "status": "redirect"
}
```

**Location:** `src/app/api/auth/[...nextauth]/route.ts`

---

#### GET `/api/auth/session`
**Purpose:** Get current session data

**Method:** GET

**Authentication:** Session cookie

**Response:**
```json
{
  "user": {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "image": "https://..."
  },
  "accessToken": "eyJ0eXAiOiJKV1...",
  "userId": "azure-ad-user-id",
  "expires": "2025-01-16T12:00:00Z"
}
```

**Location:** NextAuth.js internal

---

### Meeting Routes

#### GET `/api/meetings`
**Purpose:** Fetch meetings from Microsoft Graph API with attendance reports

**Method:** GET

**Authentication:** Required (session token)

**Query Parameters:**
- `from` (required) - Start date in UTC ISO 8601 format
- `to` (required) - End date in UTC ISO 8601 format

**Example Request:**
```http
GET /api/meetings?from=2025-01-01T00:00:00Z&to=2025-01-31T23:59:59Z
```

**Response:**
```json
{
  "meetings": [
    {
      "subject": "Sprint Planning",
      "startTime": "2025-01-15T04:00:00Z",
      "endTime": "2025-01-15T05:00:00Z",
      "isTeamsMeeting": true,
      "meetingInfo": {
        "meetingId": "graph-meeting-id",
        "threadId": "teams-thread-id",
        "organizerId": "organizer-user-id",
        "reportId": "attendance-report-id"
      },
      "attendanceRecords": [
        {
          "name": "John Doe",
          "email": "john.doe@example.com",
          "duration": 3600,
          "intervals": [
            {
              "joinDateTime": "2025-01-15T04:05:00Z",
              "leaveDateTime": "2025-01-15T05:05:00Z",
              "durationInSeconds": 3600
            }
          ],
          "role": "Presenter"
        }
      ]
    }
  ],
  "summary": {
    "total": 25,
    "attended": 20,
    "notAttended": 5
  }
}
```

**Location:** `src/app/api/meetings/route.ts`

---

#### POST `/api/meetings/match`
**Purpose:** Match meetings to tasks using AI and keyword matching

**Method:** POST

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "meetings": [
    {
      "subject": "Sprint Planning",
      "startTime": "2025-01-15T04:00:00Z",
      "attendanceDuration": 3600,
      "meetingInfo": {
        "reportId": "report-123"
      }
    }
  ],
  "tasks": [
    {
      "id": "789012",
      "title": "Sprint Planning & Retrospective",
      "project": "Mobile App",
      "module": "Project Management"
    }
  ]
}
```

**Response:**
```json
{
  "summary": {
    "total": 1,
    "highConfidence": 1,
    "mediumConfidence": 0,
    "lowConfidence": 0,
    "unmatched": 0
  },
  "matches": {
    "high": [
      {
        "meeting": {...},
        "matchedTask": {
          "id": "789012",
          "title": "Sprint Planning & Retrospective"
        },
        "confidence": 0.95,
        "reason": "Exact title match with project context",
        "matchDetails": {
          "titleSimilarity": 0.95,
          "projectRelevance": 0.85,
          "contextMatch": 0.90
        }
      }
    ],
    "medium": [],
    "low": [],
    "unmatched": []
  }
}
```

**Location:** `src/app/api/meetings/match/route.ts`

---

#### GET `/api/meetings/posted`
**Purpose:** Get list of posted meetings for current user

**Method:** GET

**Authentication:** Required (session token)

**Response:**
```json
{
  "postedMeetings": [
    {
      "meetingId": "graph-meeting-id",
      "reportId": "report-123",
      "taskName": "Sprint Planning & Retrospective",
      "timeEntry": {
        "date": "2025-01-15",
        "time": 1.0,
        "description": "Sprint Planning"
      },
      "postedAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**Location:** `src/app/api/meetings/posted/route.ts`

---

#### DELETE `/api/meetings/posted`
**Purpose:** Clear posted meetings history (soft delete)

**Method:** DELETE

**Authentication:** Required (session token)

**Response:**
```json
{
  "message": "Posted meetings cleared successfully"
}
```

**Location:** `src/app/api/meetings/posted/route.ts`

---

### Intervals API Routes

#### GET `/api/intervals/tasks`
**Purpose:** Get available tasks assigned to current user

**Method:** GET

**Authentication:** Required (session token + Intervals API key)

**Response:**
```json
{
  "tasks": [
    {
      "id": "789012",
      "title": "Implement user authentication",
      "project": "Mobile App",
      "module": "Authentication",
      "client": "Acme Corp",
      "status": "Active",
      "projectId": "456",
      "moduleId": "234",
      "clientId": "123"
    }
  ],
  "count": 1
}
```

**Location:** `src/app/api/intervals/tasks/route.ts`

---

#### POST `/api/intervals-proxy`
**Purpose:** Proxy requests to Intervals API with authentication

**Method:** POST

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "endpoint": "/time",
  "method": "POST",
  "data": {
    "time": {
      "personid": "123456",
      "taskid": "789012",
      "projectid": "456",
      "moduleid": "234",
      "date": "2025-01-15",
      "time": 1.5,
      "description": "Sprint Planning",
      "worktypeid": "813419",
      "billable": "t"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "time": {
      "id": "567890",
      "personid": "123456",
      "taskid": "789012",
      "date": "2025-01-15",
      "time": 1.5,
      "description": "Sprint Planning",
      "billable": "t"
    }
  }
}
```

**Location:** `src/app/api/intervals-proxy/route.ts`

---

#### GET `/api/intervals/me`
**Purpose:** Get current Intervals user info

**Method:** GET

**Authentication:** Required (session token + Intervals API key)

**Response:**
```json
{
  "personid": "123456",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john.doe@example.com",
  "active": true
}
```

**Location:** `src/app/api/intervals/me/route.ts`

---

#### POST `/api/intervals/validate`
**Purpose:** Validate Intervals API key

**Method:** POST

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "apiKey": "xxxxxxxxxxx"
}
```

**Response (Success):**
```json
{
  "valid": true,
  "personid": "123456",
  "name": "John Doe"
}
```

**Response (Failure):**
```json
{
  "valid": false,
  "error": "Invalid API key"
}
```

**Location:** `src/app/api/intervals/validate/route.ts`

---

### User Management Routes

#### GET `/api/user/data`
**Purpose:** Get user data from database

**Method:** GET

**Authentication:** Required (session token)

**Query Parameters:**
- `type` (optional) - Data type to retrieve: 'settings', 'posted-meetings', 'api-key'

**Response:**
```json
{
  "user": {
    "id": 1,
    "userId": "azure-ad-user-id",
    "email": "john.doe@example.com",
    "intervalsApiKey": "***********",
    "lastSync": "2025-01-15T10:30:00Z"
  },
  "settings": {
    "enabled": false
  }
}
```

**Location:** `src/app/api/user/data/route.ts`

---

#### POST `/api/user/save-key`
**Purpose:** Save Intervals API key for user

**Method:** POST

**Authentication:** Required (session token)

**Request Body:**
```json
{
  "apiKey": "xxxxxxxxxxx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "API key saved successfully"
}
```

**Location:** `src/app/api/user/save-key/route.ts`

---

#### GET/POST `/api/user/settings`
**Purpose:** Get or update user settings

**Method:** GET, POST

**Authentication:** Required (session token)

**POST Request Body:**
```json
{
  "enabled": true
}
```

**Response:**
```json
{
  "settings": {
    "id": 1,
    "userId": "azure-ad-user-id",
    "enabled": true,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-15T10:30:00Z"
  }
}
```

**Location:** `src/app/api/user/settings/route.ts`

---

### Utility Routes

#### GET `/api/openai-status`
**Purpose:** Check Azure OpenAI service availability

**Method:** GET

**Authentication:** None

**Response:**
```json
{
  "available": true,
  "endpoint": "https://<your-resource>.openai.azure.com",
  "deployment": "gpt-4"
}
```

**Location:** `src/app/api/openai-status/route.ts`

---

#### GET `/api/dev/logs`
**Purpose:** View application logs (development only)

**Method:** GET

**Authentication:** Required (session token)

**Query Parameters:**
- `type` - Log type: 'out', 'error'
- `lines` - Number of lines to return (default: 100)

**Response:**
```json
{
  "logs": [
    "[2025-01-15 10:30:00] INFO: Processing meeting...",
    "[2025-01-15 10:30:05] INFO: Task matched successfully"
  ]
}
```

**Location:** `src/app/api/dev/logs/route.ts`

---

## 9. Component Reference

### UI Components (shadcn/ui)

All UI components are located in `src/components/ui/` and follow the shadcn/ui design system.

#### Button (`ui/button.tsx`)
**Purpose:** Reusable button component with variants

**Props:**
- `variant` - 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
- `size` - 'default' | 'sm' | 'lg' | 'icon'
- `children` - Button content
- `onClick` - Click handler
- `disabled` - Disabled state

**Usage:**
```tsx
<Button variant="default" size="lg" onClick={handleClick}>
  Post Time Entry
</Button>
```

**Location:** `src/components/ui/button.tsx`

---

#### Card (`ui/card.tsx`)
**Purpose:** Container for grouped content

**Sub-components:**
- `Card` - Main container
- `CardHeader` - Header section
- `CardTitle` - Title text
- `CardDescription` - Subtitle text
- `CardContent` - Main content area
- `CardFooter` - Footer section

**Usage:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Posted Meetings</CardTitle>
    <CardDescription>Last 30 days</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Table or content */}
  </CardContent>
</Card>
```

**Location:** `src/components/ui/card.tsx`

---

#### Table (`ui/table.tsx`)
**Purpose:** Data table display

**Sub-components:**
- `Table` - Main table container
- `TableHeader` - Header row wrapper
- `TableBody` - Body rows wrapper
- `TableRow` - Table row
- `TableHead` - Header cell
- `TableCell` - Body cell

**Usage:**
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Meeting</TableHead>
      <TableHead>Duration</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Sprint Planning</TableCell>
      <TableCell>1h 15m</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Location:** `src/components/ui/table.tsx`

---

#### Dialog (`ui/dialog.tsx`)
**Purpose:** Modal dialog overlay

**Sub-components:**
- `Dialog` - Root component
- `DialogTrigger` - Button to open dialog
- `DialogContent` - Dialog content container
- `DialogHeader` - Header section
- `DialogTitle` - Dialog title
- `DialogDescription` - Dialog description
- `DialogFooter` - Footer with actions

**Usage:**
```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Enter API Key</DialogTitle>
      <DialogDescription>
        Please enter your Intervals API key
      </DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button onClick={handleSubmit}>Submit</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Location:** `src/components/ui/dialog.tsx`

---

#### Tabs (`ui/tabs.tsx`)
**Purpose:** Tabbed interface for switching views

**Sub-components:**
- `Tabs` - Root component
- `TabsList` - Tab buttons container
- `TabsTrigger` - Individual tab button
- `TabsContent` - Tab panel content

**Usage:**
```tsx
<Tabs defaultValue="fetched" onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="fetched">Fetched Meetings</TabsTrigger>
    <TabsTrigger value="matches">Task Matches</TabsTrigger>
  </TabsList>
  <TabsContent value="fetched">
    {/* Fetched meetings table */}
  </TabsContent>
  <TabsContent value="matches">
    {/* Task matches display */}
  </TabsContent>
</Tabs>
```

**Location:** `src/components/ui/tabs.tsx`

---

### Application Components

#### MeetingMatches (`meeting-matches.tsx`)
**Purpose:** Display task matching results with confidence categorization

**Props:**
```typescript
interface MeetingMatchesProps {
  matches: {
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  };
  tasks: Task[];
  onPost: (meeting: Meeting, task: Task) => Promise<void>;
  onTaskChange: (meetingId: string, taskId: string) => void;
}
```

**Key Features:**
- Grouped display by confidence level
- Task selection dropdown for low-confidence matches
- "Post" button for each meeting
- Color-coded badges (green/yellow/orange/red)
- Match reason display

**Usage:**
```tsx
<MeetingMatches
  matches={matchResults}
  tasks={availableTasks}
  onPost={handlePostTimeEntry}
  onTaskChange={handleTaskChange}
/>
```

**Location:** `src/components/meeting-matches.tsx`

---

#### IntervalsKeyDialog (`intervals-key-dialog.tsx`)
**Purpose:** Modal dialog for entering and validating Intervals API key

**Props:**
```typescript
interface IntervalsKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyValidated: (apiKey: string) => void;
}
```

**Key Features:**
- Non-dismissible modal (required for first use)
- 11-character API key input
- Real-time validation
- Help text with instructions
- Error handling

**Usage:**
```tsx
<IntervalsKeyDialog
  open={!hasApiKey}
  onOpenChange={setDialogOpen}
  onKeyValidated={handleKeyValidated}
/>
```

**Location:** `src/components/intervals-key-dialog.tsx`

---

#### DateRangePicker (`date-range-picker.tsx`)
**Purpose:** Calendar-based date range selector

**Props:**
```typescript
interface DateRangePickerProps {
  from: Date | undefined;
  to: Date | undefined;
  onDateRangeChange: (from: Date, to: Date) => void;
}
```

**Key Features:**
- Popover calendar interface
- Preset ranges (Last 7 days, Last 30 days, This Month)
- IST timezone handling
- Date validation (end >= start)

**Known Issue:** +1 day offset (select day after intended date)

**Usage:**
```tsx
<DateRangePicker
  from={fromDate}
  to={toDate}
  onDateRangeChange={(from, to) => {
    setFromDate(from);
    setToDate(to);
  }}
/>
```

**Location:** `src/components/date-range-picker.tsx`

---

#### AIAgentView (`ai-agent-view.tsx`)
**Purpose:** Display AI agent dashboard and posted meetings

**Props:**
```typescript
interface AIAgentViewProps {
  userId: string;
  userEmail: string;
}
```

**Key Features:**
- Posted meetings table with filtering/sorting
- Statistics dashboard (total meetings, total hours, billable %)
- Search functionality
- Export to CSV
- Clear history action

**Usage:**
```tsx
<AIAgentView
  userId={session.userId}
  userEmail={session.user.email}
/>
```

**Location:** `src/components/ai-agent-view.tsx`

---

#### SessionWarning (`session-warning.tsx`)
**Purpose:** Warn user about session expiry

**Props:** None (uses NextAuth session)

**Key Features:**
- Auto-detection of session expiry time
- Countdown timer (5 minutes before expiry)
- "Extend Session" button
- Toast notification

**Usage:**
```tsx
<SessionWarning />
```

**Location:** `src/components/session-warning.tsx`

---

## 10. Utility Libraries

### Database Utility (`lib/database.ts`)

**Purpose:** Centralized SQLite database operations

**Key Class:** `AppDatabase` (Singleton pattern)

**Methods:**
```typescript
class AppDatabase {
  // User operations
  createUser(userId: string, email: string): void
  getUserByEmail(email: string): UserData | null
  updateUserApiKey(userId: string, apiKey: string): void

  // Meeting operations
  saveMeeting(meeting: MeetingData): void
  getMeetingsByUser(userId: string): Meeting[]
  isMeetingPosted(userId: string, reportId: string): boolean

  // Review operations (AI agent)
  saveReview(review: ReviewData): void
  getReviewsByUser(userId: string, status?: string): Review[]
  updateReviewStatus(reviewId: string, status: string): void

  // Settings operations
  getUserSettings(userId: string): UserSettings | null
  updateUserSettings(userId: string, enabled: boolean): void
}
```

**Usage:**
```typescript
import { AppDatabase } from '@/lib/database';

const db = AppDatabase.getInstance();
const user = db.getUserByEmail('john.doe@example.com');
```

**Location:** `src/lib/database.ts`

---

### Intervals API Client (`lib/intervals-api.ts`)

**Purpose:** Intervals API integration with authentication and error handling

**Key Functions:**
```typescript
// Get current user
async getCurrentUser(apiKey: string): Promise<IntervalsUser>

// Get assigned tasks
async getTasks(apiKey: string, personId: string): Promise<Task[]>

// Get task details
async getTaskDetails(apiKey: string, taskId: string): Promise<TaskDetails>

// Create time entry
async createTimeEntry(apiKey: string, entry: TimeEntryData): Promise<TimeEntryResponse>

// Get work types
async getWorkTypes(apiKey: string): Promise<WorkType[]>
```

**Error Handling:**
```typescript
try {
  const user = await getCurrentUser(apiKey);
} catch (error) {
  if (error.status === 401) {
    // Invalid API key
  } else if (error.status === 429) {
    // Rate limit exceeded
  } else {
    // Other error
  }
}
```

**Location:** `src/lib/intervals-api.ts`

---

### Azure OpenAI Client (`lib/azure-openai.ts`)

**Purpose:** Azure OpenAI API integration for task matching

**Key Functions:**
```typescript
// Get completion from OpenAI
async getCompletion(
  prompt: string,
  options?: CompletionOptions
): Promise<CompletionResponse>

// Match meeting to task
async matchMeetingToTask(
  meetingTitle: string,
  tasks: Task[]
): Promise<MatchResult>
```

**Configuration:**
```typescript
const config = {
  endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT!,
  apiVersion: '2024-02-15-preview',
  temperature: 0.3,
  maxTokens: 500
};
```

**Rate Limiting:**
```typescript
// Token bucket implementation
const rateLimiter = new TokenBucket({
  tokensPerSecond: 100,
  maxBurst: 200
});
```

**Location:** `src/lib/azure-openai.ts`

---

### Matching Utilities (`lib/matching-utils.ts`)

**Purpose:** Keyword-based task matching algorithms

**Key Functions:**
```typescript
// Calculate similarity ratio between two strings
function calculateSimilarity(str1: string, str2: string): number

// Find keyword matches
function findKeywordMatches(
  meetingTitle: string,
  tasks: Task[]
): MatchResult | null

// Generate matching prompt for OpenAI
function generateMatchingPrompt(
  meetingTitle: string,
  tasks: Task[]
): string
```

**Algorithm:**
```typescript
// Levenshtein distance for similarity
const similarity = calculateSimilarity("Sprint Planning", "Sprint Planning & Retro");
// Returns: 0.85 (85% similar)

if (similarity > 0.7 && confidence > 0.5) {
  return { task, confidence, reason: "Keyword match" };
}
```

**Location:** `src/lib/matching-utils.ts`

---

### Timezone Utilities (`lib/timezone-utils.ts`)

**Purpose:** IST (Indian Standard Time) handling and conversions

**Key Functions:**
```typescript
// Convert IST date range to UTC
function convertDateRangeToUTC(
  fromIST: Date,
  toIST: Date
): { utcStart: string, utcEnd: string }

// Check if meeting is in IST date range
function isMeetingInISTDateRange(
  meetingStart: string,
  meetingEnd: string,
  fromIST: Date,
  toIST: Date
): boolean

// Format date to IST
function formatToIST(dateString: string, format: string): string
```

**Timezone Offset:**
```typescript
const IST_OFFSET_MINUTES = 330; // UTC+5:30
```

**Usage:**
```typescript
const { utcStart, utcEnd } = convertDateRangeToUTC(
  new Date('2025-01-01T00:00:00'),
  new Date('2025-01-31T23:59:59')
);
// utcStart: "2024-12-31T18:30:00Z"
// utcEnd: "2025-01-31T18:29:59Z"
```

**Location:** `src/lib/timezone-utils.ts`

---

### Posted Meetings Storage (`lib/posted-meetings-storage.ts`)

**Purpose:** JSON-based storage for posted meetings (legacy, now uses SQLite)

**Key Functions:**
```typescript
// Load posted meetings from JSON
function loadPostedMeetings(userId: string): PostedMeeting[]

// Save posted meeting
function savePostedMeeting(userId: string, meeting: PostedMeeting): void

// Clear posted meetings
function clearPostedMeetings(userId: string): void
```

**Note:** This is now deprecated in favor of SQLite database storage. Used only for migration purposes.

**Location:** `src/lib/posted-meetings-storage.ts`

---

### User Storage (`lib/user-storage.ts`)

**Purpose:** User API key storage (legacy, now uses SQLite)

**Key Functions:**
```typescript
// Get user API key
function getUserApiKey(userId: string): string | null

// Set user API key
function setUserApiKey(userId: string, apiKey: string): void
```

**Note:** This is now deprecated in favor of SQLite database storage.

**Location:** `src/lib/user-storage.ts`

---

### General Utilities (`lib/utils.ts`)

**Purpose:** Common utility functions

**Key Functions:**
```typescript
// Tailwind CSS class name merging
function cn(...inputs: ClassValue[]): string

// Format duration in seconds to human-readable
function formatDuration(seconds: number): string

// Format date to readable format
function formatDate(date: string | Date, format: string): string
```

**Usage:**
```typescript
const className = cn("text-lg", "font-bold", error && "text-red-500");
// Returns: "text-lg font-bold text-red-500"

const duration = formatDuration(4500);
// Returns: "1h 15m"

const date = formatDate("2025-01-15T04:00:00Z", "MMM dd, yyyy");
// Returns: "Jan 15, 2025"
```

**Location:** `src/lib/utils.ts`

---

### API Helpers (`lib/api-helpers.ts`)

**Purpose:** API response handling and error management

**Key Functions:**
```typescript
// Handle API response with error handling
async function handleApiResponse<T>(
  response: Response
): Promise<T>

// Build error response
function buildErrorResponse(
  message: string,
  status: number
): Response
```

**Usage:**
```typescript
const data = await handleApiResponse<MeetingsResponse>(response);
// Throws on error, returns typed data on success
```

**Location:** `src/lib/api-helpers.ts`

---

## 11. TypeScript Interfaces

### Meeting-Related Types (`interfaces/meetings.ts`)

```typescript
interface Meeting {
  subject: string;
  startTime: string;              // ISO 8601
  endTime: string;                // ISO 8601
  isTeamsMeeting: boolean;
  meetingInfo?: {
    meetingId: string;            // Microsoft Graph meeting ID
    graphId?: string;             // Alternative Graph ID
    threadId?: string;            // Teams conversation thread ID
    organizerId?: string;          // Organizer Azure AD user ID
    reportId?: string;            // Attendance report ID
  };
  attendanceRecords: AttendanceRecord[];
  rawData?: any;                  // Full Microsoft Graph response
}

interface AttendanceRecord {
  name: string;
  email: string;
  duration: number;              // Total attendance in seconds
  intervals: AttendanceInterval[];
  role?: string;                 // "Presenter", "Attendee", etc.
  rawRecord?: {
    reportId?: string;           // For multi-attendance tracking
  };
}

interface AttendanceInterval {
  joinDateTime: string;          // ISO 8601
  leaveDateTime: string;         // ISO 8601
  durationInSeconds: number;
}

interface MatchResult {
  meeting: Meeting;
  matchedTask?: Task;            // AI/keyword matched task
  selectedTask?: Task;           // User-selected task (override)
  confidence: number;            // 0-1.0
  reason: string;               // Explanation of match
  matchDetails: {
    titleSimilarity: number;
    projectRelevance: number;
    contextMatch: number;
    timeRelevance?: number;
  };
  suggestedAlternatives?: Task[];
}

interface MatchResponse {
  summary: {
    total: number;
    highConfidence: number;      // >= 0.8
    mediumConfidence: number;    // >= 0.5 && < 0.8
    lowConfidence: number;       // > 0 && < 0.5
    unmatched: number;           // 0
  };
  matches: {
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  };
}
```

**Location:** `src/interfaces/meetings.ts`

---

### Task & Time Entry Types (`interfaces/time-entries.ts`)

```typescript
interface Task {
  id: string;                    // Intervals task ID
  title: string;
  project: string;
  module: string;
  client: string;
  status: string;                // "Active", "Closed", etc.
  projectId: string;
  moduleId: string;
  clientId: string;
}

interface TimeEntry {
  id?: string;                   // Generated by Intervals after creation
  personid: string;              // Intervals user ID
  projectid: string;
  moduleid: string;
  taskid: string;
  worktypeid: string;            // "813419" for India-Meeting
  date: string;                  // YYYY-MM-DD
  time: number;                  // Decimal hours (e.g., 1.5 = 1h 30m)
  description: string;           // Meeting subject/title
  billable: boolean | 't' | 'f'; // Billable status
}

interface TimeEntryResponse {
  success: boolean;
  data?: {
    id: string;
    personid: string;
    taskid: string;
    date: string;
    time: number;
    description: string;
    billable: string;
    status: string;              // "approved", "pending", etc.
  };
  error?: string;
}

interface WorkType {
  id: string;
  worktype: string;              // "India-Meeting", "Development", etc.
  active: boolean;
}
```

**Location:** `src/interfaces/time-entries.ts`

---

### User & Settings Types (`lib/types.ts`)

```typescript
interface UserData {
  id?: number;
  user_id: string;               // Azure AD user ID
  email: string;
  intervals_api_key?: string;
  last_sync?: string;            // ISO 8601
  created_at?: string;           // ISO 8601
  updated_at?: string;           // ISO 8601
}

interface UserSettings {
  id?: number;
  user_id: string;
  enabled: boolean;              // AI agent enabled/disabled
  created_at?: string;           // ISO 8601
  updated_at?: string;           // ISO 8601
}

interface MeetingData {
  meeting_id: string;
  user_id: string;
  time_entry: string;            // JSON string
  raw_response: string;          // JSON string
  task_name: string;
  report_id: string;
  posted_at?: string;            // ISO 8601
}

interface ReviewData {
  id: string;                    // UUID
  user_id: string;
  subject: string;
  start_time: string;            // ISO 8601
  end_time: string;              // ISO 8601
  duration: number;              // Seconds
  status: 'pending' | 'approved' | 'rejected';
  confidence: number;            // 0-100
  reason: string;
  report_id: string;
  participants: string;          // JSON array
  key_points: string;            // JSON array
  suggested_tasks: string;       // JSON array
  created_at?: string;           // ISO 8601
  updated_at?: string;           // ISO 8601
}
```

**Location:** `src/lib/types.ts`

---

### NextAuth Session Types

```typescript
// Extend default NextAuth types
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    accessToken: string;         // Microsoft Graph access token
    userId: string;              // Azure AD user ID
    expires: string;             // ISO 8601
  }

  interface JWT {
    accessToken?: string;
    userId?: string;
  }
}
```

**Location:** Declared in `src/app/api/auth/[...nextauth]/auth.ts`

---

## 12. Configuration & Environment Variables

### Environment Variables

Create `.env.local` file in project root:

```bash
#############################################
# MICROSOFT GRAPH API - DELEGATED PERMISSIONS
# (User Context - Manual Workflow)
#############################################

AZURE_AD_CLIENT_ID=<your-client-id>
AZURE_AD_CLIENT_SECRET=<your-client-secret>
AZURE_AD_TENANT_ID=<your-tenant-id>

#############################################
# MICROSOFT GRAPH API - APPLICATION PERMISSIONS
# (App Context - AI Agent Workflow)
#############################################

AZURE_AD_APP_CLIENT_ID=<your-app-client-id>
AZURE_AD_APP_CLIENT_SECRET=<your-app-client-secret>
AZURE_AD_APP_TENANT_ID=<your-app-tenant-id>

#############################################
# NEXTAUTH CONFIGURATION
#############################################

NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-secret-string>

#############################################
# AZURE OPENAI API
#############################################

AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_DEPLOYMENT=<deployment-name>

#############################################
# OPTIONAL CONFIGURATION
#############################################

NODE_ENV=development
PORT=3000
```

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

---

### Azure AD App Registration

**Step 1: Create App Registration**
1. Navigate to Azure Portal → Azure Active Directory → App registrations
2. Click "New registration"
3. Name: "Meeting Time Tracker"
4. Supported account types: "Accounts in this organizational directory only"
5. Redirect URI: `http://localhost:3000/api/auth/callback/azure-ad`
6. Click "Register"

**Step 2: Configure API Permissions (Delegated)**
1. Go to "API permissions"
2. Add permissions:
   - Microsoft Graph → Delegated permissions
     - `openid`
     - `profile`
     - `email`
     - `User.Read`
     - `Calendars.Read`
     - `OnlineMeetings.Read`
     - `offline_access`
3. Click "Grant admin consent"

**Step 3: Create Client Secret**
1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Description: "Next.js app secret"
4. Expiry: 24 months
5. Click "Add"
6. Copy secret value (shown only once)

**Step 4: Note App IDs**
1. Go to "Overview"
2. Copy "Application (client) ID" → `AZURE_AD_CLIENT_ID`
3. Copy "Directory (tenant) ID" → `AZURE_AD_TENANT_ID`

---

### Next.js Configuration (`next.config.ts`)

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',              // For deployment (Azure Web Apps, Docker)

  typescript: {
    ignoreBuildErrors: true,         // Skip TS errors during build (not recommended)
  },

  eslint: {
    ignoreDuringBuilds: true,        // Skip ESLint during build
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',          // Max request body size
    },
  },

  webpack: (config) => {
    config.externals = [...(config.externals || []), 'better-sqlite3'];
    return config;
  },
};

export default nextConfig;
```

**Location:** `next.config.ts`

---

### TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]             // Path mapping for imports
    },
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Location:** `tsconfig.json`

---

### Tailwind CSS Configuration (`tailwind.config.ts`)

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... additional color tokens
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

**Location:** `tailwind.config.ts`

---

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:no-agent": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "pm2:start": "pm2 start pm2.config.js",
    "pm2:stop": "pm2 stop ai-agent",
    "pm2:restart": "pm2 restart ai-agent",
    "pm2:status": "pm2 status",
    "pm2:logs": "pm2 logs ai-agent",
    "pm2:monitor": "pm2 monit",
    "setup": "npm install && npm run pm2:install",
    "pm2:install": "npm install -g pm2"
  }
}
```

**Location:** `package.json`

---

### Dependencies

**Production Dependencies:**
```json
{
  "next": "^15.0.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "next-auth": "^4.24.0",
  "better-sqlite3": "^11.0.0",
  "@azure/msal-node": "^2.0.0",
  "tailwindcss": "^3.4.0",
  "lucide-react": "^0.400.0",
  "date-fns": "^3.0.0",
  "sonner": "^1.0.0"
}
```

**Development Dependencies:**
```json
{
  "typescript": "^5.5.0",
  "@types/node": "^20.14.0",
  "@types/react": "^19.0.0",
  "eslint": "^8.57.0",
  "eslint-config-next": "^15.0.0"
}
```

**Location:** `package.json`

---

## 13. Known Issues & Limitations

### Date Picker Offset Issue
**Symptoms:**
- Calendar date picker shows date +1 day ahead
- Selecting Jan 15 actually selects Jan 16

**Root Cause:**
- Timezone conversion bug in date-fns library
- IST (UTC+5:30) offset calculated incorrectly

**Workaround:**
- User must select day AFTER intended date
- Example: To fetch Jan 15 meetings → select Jan 16 in picker

**Planned Fix:**
- Implement custom date picker with proper IST handling
- Use `date-fns-tz` library for timezone conversions

**Location:** `src/components/date-range-picker.tsx:80-100`

---

### Meeting Refresh After Posting
**Symptoms:**
- Posted meetings still appear in "Fetched Meetings" list
- User must manually refresh page to see updated list

**Root Cause:**
- State not updated after posting time entry
- Database check not re-run after post

**Workaround:**
- User clicks browser refresh (F5)
- Or navigates away and back to dashboard

**Planned Fix:**
```typescript
const postTimeEntry = async (meeting) => {
  await createTimeEntry(meeting);
  // Add this:
  await refetchMeetings(); // Re-fetch and filter posted meetings
};
```

**Location:** `src/app/dashboard/page.tsx:780-800`

---

### AI Agent Requires Browser Window Open
**Symptoms:**
- AI agent (PM2 process) stops processing when browser closes
- Not truly a background process

**Root Cause:**
- PM2 process depends on web app environment variables
- No persistent token refresh mechanism for background process

**Workaround:**
- Keep browser window open during AI agent processing
- Or use server-side cron job approach

**Planned Fix:**
- Implement server-side token refresh using application permissions
- Decouple AI agent from web app session

**Location:** `ai-agent-server.js`

---

### Duplicate Time Entry Edge Case
**Symptoms:**
- In rare cases, same meeting can be posted twice
- Occurs when user opens multiple browser tabs

**Root Cause:**
- Race condition between tabs checking `isMeetingPosted()`
- Database constraint doesn't prevent concurrent inserts

**Mitigation:**
- `UNIQUE(user_id, report_id)` constraint in database
- Second insert fails silently (SQLite `ON CONFLICT DO NOTHING`)

**Best Practice:**
- Use only one browser tab for time entry posting

**Location:** `src/lib/database.ts:85-90`

---

### Graph API Rate Limiting
**Symptoms:**
- 429 Too Many Requests error when fetching many meetings
- Especially for users with high meeting volume (50+ meetings)

**Current Handling:**
- Exponential backoff retry mechanism
- Respect `Retry-After` header from Graph API

**Limitations:**
- Graph API limits: 10,000 requests per 10 minutes per app
- Attendance reports API: More restrictive limits

**Recommendation:**
- Batch meeting fetches by smaller date ranges
- Implement client-side pagination (10 meetings at a time)

**Location:** `src/app/api/meetings/route.ts:250-280`

---

### Intervals API XML Response Parsing
**Symptoms:**
- Occasional parsing errors for Intervals API responses
- Especially for non-standard XML formats

**Root Cause:**
- Intervals API returns XML (legacy)
- XML-to-JSON conversion can fail on malformed XML

**Handling:**
```typescript
try {
  const json = parseXMLtoJSON(xmlResponse);
} catch (error) {
  console.error('XML parsing failed:', error);
  return { error: 'Failed to parse Intervals response' };
}
```

**Recommendation:**
- Use Intervals JSON API (if available)
- Robust error handling for all Intervals calls

**Location:** `src/lib/intervals-api.ts:60-80`

---

### TypeScript Build Errors Ignored
**Configuration:**
```typescript
// next.config.ts
typescript: {
  ignoreBuildErrors: true,  // NOT RECOMMENDED
}
```

**Reason:**
- Legacy JavaScript files not fully typed
- Some third-party library types incomplete

**Risk:**
- Type errors not caught at build time
- Potential runtime errors

**Recommendation:**
- Gradually migrate to full TypeScript compliance
- Remove `ignoreBuildErrors` once all types are correct

**Location:** `next.config.ts:5-7`

---

### Session Cookie Security (Development)
**Configuration:**
```typescript
cookies: {
  sessionToken: {
    name: `__Secure-next-auth.session-token`,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production' // ⚠️ Not secure in dev
    }
  }
}
```

**Development Risk:**
- Cookies not marked `Secure` in local development
- Vulnerable to man-in-the-middle attacks on HTTP

**Production:**
- Always use HTTPS in production
- `secure: true` enforced automatically

**Location:** `src/app/api/auth/[...nextauth]/auth.ts:55-65`

---

## Conclusion

This document provides a comprehensive technical overview of the **Manual Workflow** for the Meeting Time Tracker application. It covers:

✅ Complete architecture and technology stack
✅ Database schema with all tables and relationships
✅ Authentication flow using NextAuth.js and Azure AD
✅ External API integrations (Microsoft Graph, Intervals, Azure OpenAI)
✅ Step-by-step user journey from login to posting time entries
✅ Detailed API routes reference
✅ Component documentation with usage examples
✅ Utility libraries and helper functions
✅ TypeScript interfaces and type definitions
✅ Configuration and environment setup
✅ Known issues and limitations with workarounds

For **AI Agent Workflow** documentation (Part 2), which covers:
- PM2 process management
- Background meeting processing
- Queue system architecture
- Batch processing
- JSON storage for reviews

Please refer to: **TECHNICAL_DOCUMENTATION_AI_AGENT.md** (to be created next).

---

**Document Maintained By:** Development Team
**For Questions or Updates:** Refer to CLAUDE.md or project README.md
