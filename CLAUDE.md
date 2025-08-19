# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with PM2 agent (port 8080)
- `npm run dev:no-agent` - Start development server without AI agent
- `npm run build` - Build the Next.js application
- `npm run start` - Production start with PM2 setup
- `npm run lint` - Run ESLint with Next.js config

### PM2 AI Agent Management
- `npm run pm2:start` - Start the AI agent background process
- `npm run pm2:stop` - Stop the AI agent
- `npm run pm2:restart` - Restart the AI agent
- `npm run pm2:status` - Check PM2 process status
- `npm run pm2:logs` - View AI agent logs
- `npm run pm2:monitor` - Open PM2 monitoring interface

### Setup Commands
- `npm run setup` - Install all dependencies including PM2
- `npm run pm2:install` - Install PM2 globally

## Architecture Overview

### Core Components
The application is a Next.js-based meeting time tracker with dual architecture:
1. **Manual Workflow** - User-driven meeting time tracking
2. **AI Agent** - Automated background processing via PM2

### Key Directories
- `src/app/` - Next.js app router pages and API routes
- `src/ai-agent/` - Standalone AI processing system
- `src/components/` - React UI components (shadcn/ui based)
- `src/lib/` - Shared utilities and configurations

### Data Layer
- **SQLite Database** (`src/lib/database.ts`) - Primary data storage using better-sqlite3
- **JSON Storage** (`src/ai-agent/data/storage/`) - AI agent state and reviews
- Tables: users, user_settings, meetings, reviews

### AI Agent Architecture
The AI agent runs as a separate PM2 process (`ai-agent-server.js`) with:
- **Queue System** - Processes meetings asynchronously
- **Azure OpenAI Integration** - Task matching and meeting analysis
- **Rate Limiting** - Token bucket implementation for API calls
- **Batch Processing** - Handles multiple meetings efficiently

### Authentication & APIs
- **NextAuth.js** - Microsoft Azure AD authentication
- **Microsoft Graph API** - Meeting data retrieval (dual permission model)
- **Intervals API** - Time tracking system integration
- **Azure OpenAI** - AI-powered task matching

### Permission Model
- **Delegated Permissions** (AZURE_AD_CLIENT_*) - User-context operations
- **Application Permissions** (AZURE_AD_APP_CLIENT_*) - Background AI agent operations

## Key Configuration Files

### Environment Variables Required
```
# Microsoft Graph - User Context
AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, AZURE_AD_TENANT_ID

# Microsoft Graph - Application Context  
AZURE_AD_APP_CLIENT_ID, AZURE_AD_APP_CLIENT_SECRET, AZURE_AD_APP_TENANT_ID

# NextAuth
NEXTAUTH_URL, NEXTAUTH_SECRET

# Azure OpenAI
AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT
```

### Configuration Files
- `pm2.config.js` - PM2 process configuration with environment loading
- `next.config.ts` - Next.js config with Azure Web App optimizations
- `tsconfig.json` - TypeScript config with path mapping (@/*)
- `tailwind.config.ts` - Tailwind CSS with custom theme

## Development Patterns

### File Organization
- API routes use Next.js app router pattern (`src/app/api/`)
- Components follow shadcn/ui conventions
- AI agent services are modular (`src/ai-agent/services/`)
- Shared types in `src/interfaces/` and `src/lib/types.ts`

### Data Flow
1. User authentication via NextAuth → Microsoft Graph access
2. Manual: UI → API routes → Database/Intervals API
3. AI Agent: PM2 process → Graph API → OpenAI → Intervals API → Database

### Key Services
- `src/ai-agent/services/meeting/graph-meetings.ts` - Meeting retrieval
- `src/ai-agent/services/task/intervals.ts` - Task matching
- `src/ai-agent/services/time-entry/intervals.ts` - Time entry creation
- `src/lib/database.ts` - Centralized database operations

## Testing and Debugging

### Logs Location
- AI Agent logs: `logs/ai-agent-out.log`, `logs/ai-agent-error.log`
- Database location: `data/application.sqlite`
- PM2 user data: `src/ai-agent/data/storage/json/pm2-user-data.json`

### Common Issues
- Date picker offset issue: Select day after intended date
- AI agent requires browser window open (not truly backgrounded)
- Meeting persistence after posting (refresh required)

### Development Notes
- TypeScript errors ignored in build (`ignoreBuildErrors: true`)
- ESLint ignored during builds (`ignoreDuringBuilds: true`)
- Standalone output configured for deployment
- SQLite database auto-initializes schema on startup