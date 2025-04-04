import { useEffect, useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { formatDateIST, DEFAULT_DATE_FORMAT, TIME_ONLY_FORMAT, DATE_ONLY_FORMAT } from "@/lib/utils";

interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
  taskId?: string;
  taskName?: string;
}

interface PostedMeetingsProps {
  meetings: PostedMeeting[];
}

export function PostedMeetings({ meetings }: PostedMeetingsProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, [meetings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!meetings.length) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No meetings have been posted yet
      </div>
    );
  }

  // Mobile view (card layout)
  const MobileView = () => (
    <div className="space-y-3 sm:hidden px-2">
      {meetings.map((meeting) => (
        <div key={meeting.id} className="bg-card rounded-lg border shadow-sm p-4">
          <div className="space-y-3">
            {/* Meeting Subject */}
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Meeting Subject</div>
              <div className="text-base font-semibold break-words">{meeting.subject}</div>
            </div>
            
            {/* Date and Time Info */}
            <div className="flex items-start justify-between pt-2 border-t">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Date & Time</div>
                <div className="text-sm">{formatDateIST(meeting.meetingDate, DEFAULT_DATE_FORMAT)}</div>
              </div>
              <div className="space-y-1 text-right">
                <div className="text-xs font-medium text-muted-foreground">Posted Date & Time</div>
                <div className="text-sm">{formatDateIST(meeting.postedDate, DEFAULT_DATE_FORMAT)}</div>
              </div>
            </div>

            {/* Task Info */}
            {meeting.taskName && (
              <div className="pt-2 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-1">Associated Task</div>
                <div className="text-sm font-medium inline-flex items-center px-2.5 py-1 rounded-md bg-secondary">
                  {meeting.taskName}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // Desktop view (table layout)
  const DesktopView = () => (
    <div className="hidden sm:block w-full overflow-auto rounded-lg border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[35%] font-semibold">Meeting Subject</TableHead>
            <TableHead className="w-[25%] whitespace-nowrap font-semibold">Meeting Date</TableHead>
            <TableHead className="w-[20%] font-semibold">Task Name</TableHead>
            <TableHead className="w-[20%] whitespace-nowrap font-semibold">Posted Date & Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.map((meeting) => (
            <TableRow key={meeting.id} className="hover:bg-muted/50">
              <TableCell className="font-medium py-4">
                <div className="break-words pr-4">
                  {meeting.subject}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap py-4">
                {formatDateIST(meeting.meetingDate, DEFAULT_DATE_FORMAT)}
              </TableCell>
              <TableCell className="py-4">
                {meeting.taskName ? (
                  <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-secondary text-sm font-medium">
                    {meeting.taskName}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap py-4">
                {formatDateIST(meeting.postedDate, DEFAULT_DATE_FORMAT)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="w-full">
      <MobileView />
      <DesktopView />
    </div>
  );
} 