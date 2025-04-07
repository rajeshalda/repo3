# Core Technologies

## Frontend
- **Next.js 15.1.5** - React framework with app router architecture
- **React 19** - JavaScript library for building user interfaces
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Unstyled, accessible component library including:
  - Avatar
  - Checkbox
  - Dialog
  - Dropdown Menu
  - Label
  - Popover
  - Progress
  - Scroll Area
  - Select
  - Switch
  - Tabs
  - Toast
- **Lucide React** - Icon library
- **Next Themes** - Theme management with dark/light mode support
- **Class Variance Authority** - For managing component variants
- **Tailwind Merge** - For merging Tailwind CSS classes
- **Sonner** - Toast notifications
- **React Day Picker** - Date picker component for date range selection

## Backend
- **Next.js API Routes** - Server-side API endpoints
- **Microsoft Graph API** - For calendar and meeting data integration
- **Intervals API** - For task and time tracking integration
- **Azure Identity** - For Azure service authentication
- **Axios** - HTTP client for API requests
- **Limiter** - For rate limiting API calls
- **PM2** - Production process manager for Node.js
- **Server.js** - Custom server implementation for extended functionality

## AI and Machine Learning
- **Azure OpenAI** - AI service for natural language processing
  - Meeting analysis for task matching
  - Text processing and generation
  - Pattern recognition for task matching
- **Custom AI Agent System** - For automatic meeting processing and task matching
  - Confidence score calculations
  - Intelligent task matching
  - Autonomous decision making

## Data Storage
- **File-based Storage** - JSON-based data storage for:
  - User data and credentials
  - Processed meetings
  - Task information
  - AI analysis results
- **LocalStorage** - Browser-based storage for client-side data
- **In-memory Caching** - For performance optimization

## Shared Technologies (Frontend & Backend)
- **TypeScript** - For type-safe development across the entire stack
- **Next.js** - Full-stack framework providing both frontend and backend capabilities

## Authentication and Authorization
- **Next Auth** - Authentication solution for Next.js
- **Microsoft Authentication Library (MSAL)** - For Azure AD authentication
  - @azure/msal-browser (frontend)
  - @azure/msal-node (backend)
- **Azure Active Directory** - For user authentication and authorization

## Development Tools
- **ESLint** - Code linting
- **PostCSS** - CSS processing
- **Cross-env** - Cross-platform environment variables

## Deployment
- **Azure Web App** - Hosting platform
- **Standalone Next.js Output** - Self-contained deployment package
- **Server Actions** - Next.js server-side actions support
- **HTTP Keep-Alive** - For persistent connections and performance
- **Environment Variable Management** - For configuration in different environments

## Application Architecture
- **Singleton Pattern** - For service instances
- **Rate Limiting** - Token bucket algorithm implementation
- **Error Handling** - With exponential backoff for API retries
- **Component-based Design** - Modular frontend architecture
- **Service-oriented Backend** - Microservices approach

## Core Features
- **Microsoft 365 Integration** - Calendar and meeting synchronization
- **Time Tracking Automation** - Automatic time entry creation
- **AI-powered Task Matching** - Intelligent matching of meetings to tasks
- **Dashboard Interface** - User-friendly monitoring and control
- **Review System** - For handling low-confidence AI matches
- **Continuous Processing** - Background meeting processing with AI agent

This application combines modern web technologies with AI capabilities to create an intelligent meeting time tracker that integrates with Microsoft 365 and Intervals time tracking system. 