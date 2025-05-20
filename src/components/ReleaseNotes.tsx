import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import ReactMarkdown from 'react-markdown';

const releaseNotes = `
# 📌 Meeting Time Tracker - Release Notes

&nbsp;

## 🌟 Version 2.2.0 (May 2025)

&nbsp;

### 🔄 Core System Updates

#### Time & Timezone Improvements
- 🌏 Fixed Timezone handling for IST attendance reports
- ⏰ Resolved Agent Time Issues - Implemented UTC for Deployment
- 🕒 Enhanced Task Name Loading and Agent Stability improvements

#### Infrastructure & Performance
- 🐳 Successful Docker Implementation
- 🛠️ Fixed runtime error and session handling issues
- 🇮🇳 Updated India-Meeting configurations

&nbsp;

### 🎯 Meeting Management

#### Deduplication System Enhancements
- 🔍 Enhanced Meeting Deduplication System
- ⚡ Improved time proximity detection (5-minute threshold)
- 🔄 Better handling of recurring meetings
- 📊 Enhanced subject comparison logic
- ⚖️ Reduced duration similarity threshold to 30 seconds
- 📝 Added comprehensive logging for better tracking

&nbsp;

### 👥 User Experience

#### Data Management
- 🔒 Enhanced User-Specific Data Handling
- 🛡️ Improved data isolation between users
- 👀 User-specific meeting views and time entries
- 🔐 Fixed shared data visibility issues

#### AI Features
- 🤖 Improved AI Agent Task Matching
- 🎯 Enhanced matching algorithm
- ⭐ Better confidence scoring
- 🎨 More accurate task suggestions

&nbsp;

---

&nbsp;

## 📜 Previous Updates (Version 2.1.0)
- 📊 Performance optimizations
- 🎨 UI/UX improvements
- 🔧 Bug fixes and stability improvements
- 📦 Updated dependencies
`;

export function ReleaseNotes() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Button variant="outline" size="sm" disabled={true}>
      What's New
    </Button>
  );
} 