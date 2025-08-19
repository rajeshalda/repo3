# Meeting Time Tracker – Security, Permissions, and On‑Prem Readiness

This document explains, in practical and code‑referenced terms, why each Microsoft Entra ID permission, Teams policy, authentication setting, and Windows/ADCS requirement is needed for Meeting Time Tracker, and how the application uses them safely. It is designed to answer due‑diligence questions prior to an on‑prem deployment.

## App identity (environment variables)

We use two identity modes:
- User sign‑in (delegated permissions) for per‑user calendar access
  - `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`
- App‑only (client credentials) for retrieving Teams attendance reports
  - `AZURE_AD_APP_CLIENT_ID`, `AZURE_AD_APP_CLIENT_SECRET`, `AZURE_AD_APP_TENANT_ID`

Code references:
- User sign‑in scopes and token pass‑through: 
  - `src/lib/auth.ts` (NextAuth Azure AD provider with `User.Read Calendars.Read`)
  - `src/app/api/meetings/route.ts` reads `session.user.accessToken` from NextAuth to call Graph calendar view.
- App‑only token (client credentials) for attendance APIs:
  - `src/lib/graph-app-auth.ts` – issues app token with `https://graph.microsoft.com/.default`
  - Used by `getAttendanceReport` in `src/app/api/meetings/route.ts` to call Teams attendance endpoints.

Why required: The user flow reads each signed‑in user’s own calendar (delegated), while attendance reports require app‑only permissions that cannot be satisfied by basic delegated scopes.

## Microsoft Graph permissions requested

- Calendars.Read (Delegated)
  - Purpose: Read a signed‑in user’s calendar to list meetings and detect Teams meetings.
  - Code path: `src/app/api/meetings/route.ts` → Graph `calendarView` using the user’s access token from NextAuth.
  - Risk scope: Read‑only, scoped to the signed‑in account.

- OnlineMeetings.Read (Delegated) [optional/augmenting]
  - Purpose: Improves ability to resolve online meeting metadata under delegated context.
  - Code path: Online meeting detection uses `onlineMeeting.joinUrl` returned from calendar items; delegated OnlineMeetings APIs are not mandatory in current flow but are compatible.

- OnlineMeetingArtifact.Read (Application)
  - Purpose: Read Teams meeting attendance reports via app‑only API.
  - Code path: `getAttendanceReport` in `src/app/api/meetings/route.ts` calls:
    - `GET /users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports`
    - `GET /users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports/{reportId}/attendanceRecords`
  - Token source: `getAppGraphToken()` in `src/lib/graph-app-auth.ts` (client credentials).
  - Why app‑only: Teams attendance artifacts are organization resources; Microsoft Graph requires application permission to retrieve them reliably across users and recurring instances.

- Reports.Read.All (Delegated & Application) [for usage analytics, optional]
  - Purpose: Access org‑level usage reports if you choose to surface adoption metrics. Not required for core attendance/time tracking; keep disabled if not needed.

- User.Read (Delegated)
  - Purpose: Basic profile/identity during sign‑in.
  - Code path: `src/lib/auth.ts` scope includes `User.Read`.

- User.Read.All (Application) [optional]
  - Purpose: If you choose to resolve user IDs/emails across the tenant without user context. Current code uses user and organizer information coming from calendar/meetings; this app permission is not strictly required.

- Group.Read.All (Delegated) [optional]
  - Purpose: Only needed if you later map meetings to Microsoft 365 groups/teams. Not used in the current implementation.

Summary of minimal set for current code paths:
- Delegated: `User.Read`, `Calendars.Read`
- Application: `OnlineMeetingArtifact.Read`

## Why these permissions won’t harm the organization

- Principle of least privilege:
  - Delegated permissions are restricted to each signed‑in user’s own calendar and profile.
  - Application permission is limited to read‑only access of meeting attendance artifacts.
- No write access to Exchange/Teams/Graph resources is requested by default. Time entries are posted only to your Intervals system via its API, not to Microsoft 365.
- Data locality: The app runs on‑prem; all processing happens within your network unless you configure external AI endpoints. Attendance and calendar data are stored in your on‑prem SQLite database (`src/lib/database.ts`) or local JSON files used by the AI agent’s storage manager.

## Authentication configuration

- Single‑tenant: Restricts sign‑in to your organization. Configured in your app registration settings.
- Redirect URIs (HTTPS): Required by NextAuth for secure OAuth redirects.
- Public client flows: Only needed if you plan to enable native desktop client access. The web app itself uses standard confidential client OAuth via NextAuth.

Code references:
- NextAuth Azure AD config in `src/lib/auth.ts` and `src/app/api/auth/[...nextauth]/auth.ts`.
- Token usage: `session.user.accessToken` is used server‑side to call Graph.

## Microsoft Teams application access policy

If your tenant enforces application access policies for Teams Graph APIs, you must create a policy and add the app registration’s Application (client) ID. Example (PowerShell):
```powershell
Connect-MicrosoftTeams
New-CsApplicationAccessPolicy -Identity "MTT-Access-Policy" -AppIds "<APP_ID>" -Description "Meeting Time Tracker"
Grant-CsApplicationAccessPolicy -PolicyName "MTT-Access-Policy" -Identity "<UPN or Group>"
Get-CsApplicationAccessPolicy | Format-List
```
Why required: Ensures the app is allowed to call Teams online meeting attendance endpoints. The code explicitly calls those endpoints in `src/app/api/meetings/route.ts`.

## Windows Server and ADCS certificate (on‑prem deployment)

- IIS hosting: The app is a Next.js Node service reverse‑proxied by IIS (or hosted directly with Node). Windows Server provides a managed, auditable environment for internal enterprise hosting.
- ADCS SSL certificate: Required for HTTPS to protect tokens and meeting data in transit.
- DNS entry: So your internal hostname (e.g., `mtt.lab.local`) matches the certificate’s SAN/CN and is discoverable.

Deployment artifacts in repo:
- Dockerfile + `scripts/` for Windows/IIS setups (e.g., `scripts/setup-windows-server-iis.ps1`) and SSL automation guidance in `SSL SETUP/`.

## Data storage and privacy controls

- Local SQLite database: `src/lib/database.ts` stores only minimal operational data: user ID/email, an Intervals API key, posted meeting records, review items. No Office 365 write‑backs.
- Local JSON storage (AI agent): `src/ai-agent/data/storage/json/` and `src/ai-agent/data/storage/manager.ts` manage meeting review artifacts and posted meeting IDs. Files live on the same server.
- Access tokens:
  - User delegated tokens are short‑lived and stored in server session memory via NextAuth callbacks (`src/lib/auth.ts`).
  - App‑only tokens are obtained per request via `ClientSecretCredential` and not persisted.
- Logs: Server logs may include timestamps and basic subjects to troubleshoot recurring meeting issues. You can reduce logs by setting environment variables to production logging levels.

## Network egress

- Microsoft Graph endpoints under `https://graph.microsoft.com` for calendar and attendance.
- Optional: Intervals API (if you use the time‑entry export), configured via `src/lib/intervals-api.ts`.
- Optional: Azure OpenAI if enabled (`src/app/api/openai-status/route.ts`). You can disable AI endpoints entirely for on‑prem or route them through an internal proxy.

## Security posture summary

- Read‑only Graph access; least privilege
- Single‑tenant Azure AD; HTTPS enforced
- No Microsoft 365 data writes; only local data persistence
- Tokens short‑lived; app tokens acquired on demand; secrets kept in environment variables
- Teams access policy whitelists the app explicitly

## FAQ for stakeholders

- Does the app read emails or files? No. Only calendar metadata and Teams attendance records are read.
- Can it post or edit meetings? No. No write scopes are requested for Exchange/Teams.
- Where is data stored? On your server (SQLite and JSON files), unless you enable outbound AI.
- What minimal permissions are required? `User.Read`, `Calendars.Read` (delegated) and `OnlineMeetingArtifact.Read` (application).
- Can we disable nonessential permissions? Yes—`Reports.Read.All`, `User.Read.All`, `Group.Read.All` are optional and not used by default paths.

## Direct code citations

```1:40:src/lib/auth.ts
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: { params: { scope: 'openid profile email User.Read Calendars.Read' } }
    })
  ],
  callbacks: { /* adds accessToken to session */ }
};
```

```90:178:src/app/api/meetings/route.ts
async function getAttendanceReport(organizerId: string, meetingId: string) {
  const appToken = await getAppGraphToken();
  const reportsUrl = `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports`;
  const recordsUrl = `.../attendanceReports/{reportId}/attendanceRecords`;
  // fetch reports and records with app token
}
```

```21:41:src/lib/graph-app-auth.ts
const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
export async function getAppGraphToken() {
  const token = await credential.getToken('https://graph.microsoft.com/.default');
  return token.token;
}
```


## Sample Microsoft Graph responses (human‑readable)

These examples show the actual shape of the data we consume and how each field is used in the app.

### Delegated: User.Read
- **Endpoint**: `GET https://graph.microsoft.com/v1.0/me`

```json
{
  "id": "90e2f3e7-ee86-4bc6-93ff-ccf55a60c528",
  "displayName": "A. User",
  "userPrincipalName": "user@contoso.com",
  "mail": "user@contoso.com",
  "givenName": "A",
  "surname": "User"
}
```

- **What it means**: Stable identity and email for the signed‑in user.
- **How we use it**: Tie the session to the user; look up their Intervals API key and settings in SQLite (`src/lib/database.ts`).

### Delegated: Calendars.Read
- **Endpoint**: `GET https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=2025-01-22T00:00:00Z&endDateTime=2025-01-23T00:00:00Z&$select=id,subject,start,end,onlineMeeting,bodyPreview,organizer,type,seriesMasterId`

```json
{
  "value": [
    {
      "id": "AAMkAGI2...AAA=",
      "subject": "Sprint Planning",
      "start": { "dateTime": "2025-01-22T09:30:00.0000000", "timeZone": "UTC" },
      "end":   { "dateTime": "2025-01-22T10:30:00.0000000", "timeZone": "UTC" },
      "onlineMeeting": {
        "joinUrl": "https://teams.microsoft.com/l/meetup-join/19%3ameeting_...%40thread.v2/0?context=%7b%22Tid%22%3a%22...%22%2c%22Oid%22%3a%22...%22%7d"
      },
      "bodyPreview": "Agenda: review backlog ...",
      "organizer": { "emailAddress": { "name": "PM", "address": "pm@contoso.com" } },
      "type": "occurrence",
      "seriesMasterId": "AAMkAGI2...AAE="
    }
  ]
}
```

- **What it means**: Meeting metadata, including Teams `joinUrl` and recurrence indicators.
- **How we use it**: Detect Teams meetings via `onlineMeeting.joinUrl`, extract identifiers, convert times to IST for filtering, and then fetch attendance when applicable (`src/app/api/meetings/route.ts`).

### Application: OnlineMeetingArtifact.Read
We use app‑only tokens to fetch attendance artifacts.

1) List attendance reports for a meeting
- **Endpoint**: `GET https://graph.microsoft.com/v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports`

```json
{
  "value": [
    {
      "id": "a8f1f9a0-5c2a-4e9f-9c1b-2e58cdb4a7e3",
      "meetingStartDateTime": "2025-01-22T09:30:00Z",
      "meetingEndDateTime": "2025-01-22T10:30:00Z",
      "totalParticipantCount": 7
    },
    {
      "id": "b1e2c3d4-1111-2222-3333-444455556666",
      "meetingStartDateTime": "2025-01-29T09:30:00Z",
      "meetingEndDateTime": "2025-01-29T10:30:00Z",
      "totalParticipantCount": 6
    }
  ]
}
```

- **What it means**: One report per meeting occurrence (especially important for recurring meetings).
- **How we use it**: Match the report IST date to the specific meeting instance displayed to the user; then fetch detailed records for that report.

2) Get attendance records for a specific report
- **Endpoint**: `GET https://graph.microsoft.com/v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports/{reportId}/attendanceRecords`

```json
{
  "value": [
    {
      "id": "f3465c2a-0d6f-47a3-8f23-b0c67c6f5d7d",
      "emailAddress": "user@contoso.com",
      "role": "Attendee",
      "identity": {
        "id": "c2a1e4a0-...-db6c67c6f5d7",
        "displayName": "A. User",
        "tenantId": "d6b48afb-ae93-4180-bd0f-aa47c5c5b57b"
      },
      "totalAttendanceInSeconds": 3120,
      "attendanceIntervals": [
        {
          "joinDateTime": "2025-01-22T09:31:12Z",
          "leaveDateTime": "2025-01-22T10:23:12Z",
          "durationInSeconds": 3120
        }
      ]
    }
  ]
}
```

- **What it means**: Per‑attendee totals and join/leave intervals.
- **How we use it**: Find the signed‑in user’s row by `emailAddress`, sum `totalAttendanceInSeconds`, format for IST when showing intervals, and post to Intervals as the user’s time (never writing back to Microsoft 365).

> Important: Teams application access policy is required for app‑only attendance APIs
- You must allowlist your app (Application ID) via a Teams application access policy or these endpoints will return 403 even if Graph app permissions are granted.
- Without policy, typical error:

```json
{
  "error": {
    "code": "ErrorAccessDenied",
    "message": "Access is denied. Check credentials and try again."
  }
}
```

- Fix (PowerShell):
```powershell
Connect-MicrosoftTeams
New-CsApplicationAccessPolicy -Identity "MTT-Access-Policy" -AppIds "<APP_ID>" -Description "Meeting Time Tracker"
Grant-CsApplicationAccessPolicy -PolicyName "MTT-Access-Policy" -Identity "<user UPN or group>"
```

### Quick field‑to‑use mapping
- From `calendarView`:
  - `subject`, `start.dateTime`, `end.dateTime`, `onlineMeeting.joinUrl`, `seriesMasterId`, `type`, `bodyPreview`
- From `attendanceRecords`:
  - `emailAddress`, `identity.displayName`, `totalAttendanceInSeconds`, `attendanceIntervals[*].joinDateTime/leaveDateTime/durationInSeconds`


## Additional permissions (usage status and examples)

Below are all other permissions from your checklist with usage status and example outputs.

### User.Read.All (Application)
- **Usage status**: Used by AI‑Agent flows only (optional for core app)
- **Where**: `src/ai-agent/services/meeting/openai.ts`, `src/ai-agent/services/meeting/comparison.ts`, `src/ai-agent/services/time-entry/intervals.ts` call `GET /v1.0/users/{userId}` using app‑only token to resolve a numeric Graph ID.
- **Endpoint**: `GET https://graph.microsoft.com/v1.0/users/{userId}`

```json
{
  "id": "6bb5911c-640d-4764-8949-e4a9381131aa",
  "displayName": "PM",
  "userPrincipalName": "pm@contoso.com",
  "mail": "pm@contoso.com"
}
```

- **Why**: Some attendance APIs require the target organizer’s Graph user ID.
- **If disabled**: Core meetings page still works (uses delegated calendar + app‑only attendance). AI‑Agent features that resolve users will be limited.

### OnlineMeetings.Read (Delegated)
- **Usage status**: Not used in code
- **Endpoint example**: `GET https://graph.microsoft.com/v1.0/me/onlineMeetings/{id}`

```json
{
  "id": "MCMxOTptZWV0aW5nX2FiYy50aHJlYWQudjIvMA==",
  "subject": "Sprint Planning",
  "joinUrl": "https://teams.microsoft.com/l/meetup-join/19%3ameeting_...%40thread.v2/0?...",
  "participants": { "organizer": { "upn": "pm@contoso.com" } }
}
```

- **Note**: We already infer Teams meetings from `calendarView` (`onlineMeeting.joinUrl`), so this scope is unnecessary.

### Reports.Read.All (Delegated & Application)
- **Usage status**: Not used in code
- **Endpoint example**: `GET https://graph.microsoft.com/v1.0/reports/getTeamsUserActivityUserDetail(period='D7')`
- **Output format**: CSV stream

```csv
Report Refresh Date,User Principal Name,Last Activity Date,Is Deleted,Deleted Date,Assigned Products
2025-01-22,user@contoso.com,2025-01-21,False,,M365 E5
```

- **Note**: Keep disabled unless you plan to surface org‑wide Teams usage analytics.

### Group.Read.All (Delegated)
- **Usage status**: Not used in code
- **Endpoint example**: `GET https://graph.microsoft.com/v1.0/groups?$select=id,displayName,mail`

```json
{
  "value": [
    { "id": "f0b5...", "displayName": "Engineering", "mail": "engineering@contoso.com" },
    { "id": "a1c2...", "displayName": "Marketing",   "mail": "marketing@contoso.com" }
  ]
}
```

- **Note**: Only needed if you later map meetings to M365 groups/teams in the product.

### Calendars.Read (Application)
- **Usage status**: Used by AI‑Agent meeting test/process flow (optional for core app)
- **Where**: `src/ai-agent/services/meeting/test.ts` acquires an app‑only token (`getGraphToken()`) and calls `GET /v1.0/users/{userId}/calendarView...` to fetch meetings headlessly during agent processing (see lines building `https://graph.microsoft.com/v1.0/users/${userId}/calendarView?...`).
- **Endpoint example**: `GET https://graph.microsoft.com/v1.0/users/{userId}/calendarView?startDateTime=...&endDateTime=...&$select=id,subject,start,end,onlineMeeting,bodyPreview,organizer,type,seriesMasterId`
- **Note**: The core meetings API (`src/app/api/meetings/route.ts`) uses delegated `Calendars.Read` with the signed‑in user token (`/me/calendarView`). App‑only `Calendars.Read` is needed only for the agent’s headless flow.

## Confirmed permission usage (manual vs agent)

- **Manual (Signed‑in UI)**
  - Delegated: `User.Read`
    - Endpoint: `GET /v1.0/me`
    - Code: NextAuth provider scopes in `src/lib/auth.ts`; session token provided to server.
  - Delegated: `Calendars.Read`
    - Endpoint: `GET /v1.0/me/calendarView?...`
    - Code: `src/app/api/meetings/route.ts` uses the session access token to call `me/calendarView`.
  - Application: `OnlineMeetingArtifact.Read`
    - Endpoints: 
      - `GET /v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports`
      - `GET /v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports/{reportId}/attendanceRecords`
    - Code: `getAttendanceReport()` in `src/app/api/meetings/route.ts` with app token from `src/lib/graph-app-auth.ts`.

- **Agent (Headless)**
  - Application: `Calendars.Read`
    - Endpoint: `GET /v1.0/users/{userId}/calendarView?...`
    - Code: `src/ai-agent/services/meeting/test.ts` builds the `/users/{userId}/calendarView` URL and uses an app‑only token.
  - Application: `User.Read.All`
    - Endpoint: `GET /v1.0/users/{userId}`
    - Code: `src/ai-agent/services/meeting/openai.ts` and `comparison.ts` request `/users/{userId}` using an app‑only token.
  - Application: `OnlineMeetingArtifact.Read`
    - Endpoints:
      - `GET /v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports`
      - `GET /v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports/{reportId}/attendanceRecords`
    - Code: agent services fetch attendance reports/records with the app‑only token.

- **Not used (no code paths)**
  - Delegated: `OnlineMeetings.Read`, `Group.Read.All`
    - No calls to `/me/onlineMeetings` or `/groups` in the codebase.
  - Delegated & Application: `Reports.Read.All`
    - No calls to `/reports/*` in the codebase.


## End‑to‑end flows and API dependencies (with outputs)

This section ties the permissions to actual calls and responses in the order they happen, for both the manual user flow and the headless agent flow.

### Manual user flow (signed‑in UI)

1) User signs in (delegated token)
- Permission: `User.Read` (Delegated)
- Endpoint: `GET /v1.0/me`
- Output: see “Delegated: User.Read” sample above
- Code: `src/lib/auth.ts` (NextAuth)

2) List meetings for the signed‑in user (delegated)
- Permission: `Calendars.Read` (Delegated)
- Endpoint: `GET /v1.0/me/calendarView?startDateTime=...&endDateTime=...&$select=...`
- Output: see “Delegated: Calendars.Read” sample above
- Code: `src/app/api/meetings/route.ts` uses session access token

3) Fetch attendance for Teams meetings (app‑only)
- Permission: `OnlineMeetingArtifact.Read` (Application)
- Endpoint: 
  - `GET /v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports`
  - `GET /v1.0/users/{organizerId}/onlineMeetings/{meetingId}/attendanceReports/{reportId}/attendanceRecords`
- Output: see “Application: OnlineMeetingArtifact.Read” samples above
- Extra requirement: Teams application access policy must allowlist the app ID (or you get 403 AccessDenied)
- Code: `src/app/api/meetings/route.ts` calling `getAttendanceReport()` with app token from `src/lib/graph-app-auth.ts`

4) Store and show results
- No Microsoft 365 writes. Data persists locally in SQLite (`src/lib/database.ts`) and JSON stores.

Summary dependency chain (manual):
- User.Read (Delegated) → Calendars.Read (Delegated) → OnlineMeetingArtifact.Read (Application + Teams policy) → local storage

### Agent flow (headless/background)

1) Acquire app‑only token
- Permissions requested via `/.default` (configured app permissions)
- Code: `getGraphToken()` in agent services

2) List meetings for a user (app‑only)
- Permission: `Calendars.Read` (Application)
- Endpoint: `GET /v1.0/users/{userId}/calendarView?startDateTime=...&endDateTime=...&$select=...`
- Output: same shape as delegated `calendarView` (see sample above)
- Code: `src/ai-agent/services/meeting/test.ts`

3) Optional: resolve user details (app‑only)
- Permission: `User.Read.All` (Application) [optional]
- Endpoint: `GET /v1.0/users/{userId}`
- Output: see sample in “User.Read.All (Application)”

4) Fetch attendance for Teams meetings (app‑only)
- Permission: `OnlineMeetingArtifact.Read` (Application)
- Endpoint: attendanceReports and attendanceRecords as above
- Output: see “Application: OnlineMeetingArtifact.Read” samples
- Extra requirement: Teams application access policy required; otherwise 403

Summary dependency chain (agent):
- Calendars.Read (Application) → [optional User.Read.All (Application)] → OnlineMeetingArtifact.Read (Application + Teams policy) → local storage
