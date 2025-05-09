import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import ReactMarkdown from 'react-markdown';

const releaseNotes = `
# Meeting Time Tracker - Release Notes

## Version 2.1.0 (March 2024)

### New Features
- Enhanced User-Specific Data Handling
  - Improved data isolation between users
  - User-specific meeting views and time entries
  - Fixed shared data visibility issues

- Improved AI Agent Task Matching
  - Enhanced matching algorithm
  - Better confidence scoring
  - More accurate task suggestions

### Improvements
- Better performance and reliability
- Enhanced user interface
- Improved error handling
- Updated dependencies

### Bug Fixes
- Fixed various UI/UX issues
- Resolved data synchronization problems
- Improved error messaging
`;

export function ReleaseNotes() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          What's New
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Release Notes</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] w-full pr-4">
          <div className="prose dark:prose-invert">
            <ReactMarkdown>{releaseNotes}</ReactMarkdown>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
} 