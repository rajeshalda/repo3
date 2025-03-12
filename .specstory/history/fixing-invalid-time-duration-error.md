## SpecStory

## Fixing Invalid Time Duration Error (2/3/2025, 10:35:28 PM)

_**User**_

Invalid time duration. Must be greater than 0 hours. while posting to interval

---

_**Assistant**_

I'll help investigate and fix the error related to invalid time duration when posting to intervals. This error suggests there's a validation issue with the duration being sent to the intervals API. Let me check the relevant code to understand where this validation is happening and how we can fix it.

First, let me look at the meetings route handler since that's likely where the posting occurs:

---

_**Assistant**_



---

_**Assistant**_



Let me check the intervals API code since that's where the error is coming from:

---

_**Assistant**_



---

_**Assistant**_



Let me check the meeting processor since it might be handling the duration calculations:

---

_**Assistant**_



---

_**Assistant**_



Let me check the rest of the intervals API file to see the time entry creation logic:

---

_**Assistant**_



---

_**Assistant**_



I can see the issue now. There are two validation checks for time duration:

1. In `createTimeEntry` method:
```typescript
if (!payload.time || payload.time <= 0) {
    throw new Error('Invalid time duration. Must be greater than 0 seconds.');
}
```

2. In `postTimeEntry` method:
```typescript
if (!timeEntry.time || timeEntry.time <= 0) {
    throw new Error('Invalid time duration');
}
```

Let me check how the duration is being calculated in the meeting processor:

---

_**Assistant**_



---

_**Assistant**_



I see the issue now. The problem is in the `convertTimeToDecimal` method in the meeting processor. When it fails to parse the time string or gets a zero duration, it returns 0, which then fails the validation in the Intervals API.

Let me check how the attendance time is being formatted in the meeting data:

---

_**Assistant**_



---

_**Assistant**_



I can see that the duration is being stored in seconds in the attendance records. The issue appears to be in how we're handling the time conversion. Let me fix the `convertTimeToDecimal` method in the meeting processor to properly handle the duration:

---

_**Assistant**_

```
// ... existing code ...
    convertTimeToDecimal(timeString: string | number): number {
        try {
            // If timeString is already a number (seconds), convert directly to hours
            if (typeof timeString === 'number') {
                const hours = Number((timeString / 3600).toFixed(2));
                return hours > 0 ? hours : 0;
            }

            // Otherwise parse the string format
            const minutes = parseInt(timeString.match(/(\d+) minutes/)?.[1] || '0');
            const seconds = parseInt(timeString.match(/(\d+) seconds/)?.[1] || '0');
            const totalHours = Number(((minutes * 60 + seconds) / 3600).toFixed(2));
            
            if (totalHours <= 0) {
                throw new Error('Duration must be greater than 0 hours');
            }
            
            return totalHours;
        } catch (error) {
            console.error('Error converting time:', error);
            throw new Error('Invalid time duration. Must be greater than 0 hours.');
        }
    }
// ... existing code ...
```

---

_**Assistant**_



I've made several important changes to fix the duration validation issue:

1. Updated the `convertTimeToDecimal` method to handle both string and number inputs, since we receive the duration in seconds from the attendance records.

2. Added proper error handling that throws an error when the duration is 0 or negative, instead of silently returning 0.

3. Made the error messages more descriptive to help with debugging.

4. Added direct conversion from seconds to hours when a numeric input is provided.

The changes should now:
1. Properly handle the duration when it comes from attendance records (as seconds)
2. Properly handle string-formatted durations
3. Throw appropriate errors when the duration is invalid
4. Prevent zero or negative durations from being sent to the Intervals API

This should resolve the "Invalid time duration. Must be greater than 0 hours" error you were seeing. The error will still appear if there's genuinely no attendance time recorded, but it will be more clear why it's happening and will prevent invalid data from being sent to the Intervals API.

Would you like me to make any additional changes or would you like to test this fix?

---

_**User**_

Console Error

Error: Invalid time duration. Must be greater than 0 hours.

Source
src\components\meeting-matches.tsx (293:15) @ handlePostToIntervals

  291 |         onMeetingPosted?.(result.meeting.meetingInfo?.meetingId || result.meeting.subject);
  292 |       } else {
> 293 |         throw new Error(postResult.error || 'Failed to post meeting');
      |               ^
  294 |       }
  295 |     } catch (error) {
  296 |       console.error('Error posting meeting:', error);

---

_**Assistant**_

Looking at the error and the code, I see that we need to check the meeting-matches.tsx file to understand how the data is being passed to the meeting processor. Let me check that file:

---

_**Assistant**_



---

_**Assistant**_



Let me check the part where the meeting data is being prepared and sent:

---

_**Assistant**_



---

_**Assistant**_



I see the issue now. The problem is in how we're handling the time conversion. Let me check the `convertSecondsToDecimalHours` function:

---

_**Assistant**_



---

_**Assistant**_



Now I see the complete issue. The problem is that we're not validating the duration before converting it to decimal hours. The `convertSecondsToDecimalHours` function will return 0 for any input that's 0 or negative, which then fails the validation in the Intervals API.

Let's fix this by adding validation in both places:

---

_**Assistant**_

```
// ... existing code ...
// Helper function to convert seconds to decimal hours with proper rounding
function convertSecondsToDecimalHours(seconds: number): number {
  if (!seconds || seconds <= 0) {
    throw new Error('Meeting duration must be greater than 0 seconds');
  }
  // Round to 2 decimal places for Intervals
  return Number((seconds / 3600).toFixed(2));
}

function MatchRow({ result, onMeetingPosted, postedMeetingIds }: MatchRowProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isPosting, setIsPosting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
// ... existing code ...

  const handlePostToIntervals = async () => {
    if (!selectedTask) {
      toast("Please select a task first");
      return;
    }

    setIsPosting(true);
    try {
      const userAttendance = result.meeting.attendanceRecords.find(
        record => record.name === session?.user?.name
      );

      if (!userAttendance) {
        toast.error("You were not present in this meeting", {
          position: "top-center",
          duration: 4000,
          style: {
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px"
          }
        });
        return;
      }

      if (!userAttendance.duration || userAttendance.duration <= 0) {
        toast.error("Invalid meeting duration. Must be greater than 0 seconds.", {
          position: "top-center",
          duration: 4000,
          style: {
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px"
          }
        });
        return;
      }

      const meetingDate = new Date(result.meeting.startTime).toISOString().split('T')[0];
      const decimalHours = convertSecondsToDecimalHours(userAttendance.duration);
// ... existing code ...
```

---

_**Assistant**_



I've made two important changes to fix the duration validation issue:

1. Added validation in `convertSecondsToDecimalHours`:
   - Now checks if the input is 0, null, undefined, or negative
   - Throws a descriptive error if the duration is invalid

2. Added early validation in `handlePostToIntervals`:
   - Checks the duration before attempting to convert it
   - Shows a user-friendly error toast if the duration is invalid
   - Prevents the API call from being made with invalid duration

These changes will:
1. Catch invalid durations earlier in the process
2. Show more user-friendly error messages
3. Prevent unnecessary API calls when the duration is invalid
4. Maintain consistency with the Intervals API requirements

The error message will now be shown as a toast notification instead of being thrown as an error, which provides a better user experience. If a meeting has no duration or zero duration, users will see a clear error message explaining why they can't post the time entry.

Would you like me to make any additional changes or would you like to test this fix?

---

_**User**_

POST http://localhost:8080/api/intervals/time-entries 500 (Internal Server Error)
handlePostToIntervals @ C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\src\components\meeting-matches.tsx:282
processDispatchQueue @ C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\node_modules\next\dist\compiled\react-dom\cjs\react-dom-client.development.js:16145
eval @ C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\node_modules\next\dist\compiled\react-dom\cjs\react-dom-client.development.js:16748
batchedUpdates$1 @ C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\node_modules\next\dist\compiled\react-dom\cjs\react-dom-client.development.js:3129
dispatchEventForPluginEventSystem @ C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\node_modules\next\dist\compiled\react-dom\cjs\react-dom-client.development.js:16304
dispatchEvent @ C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\node_modules\next\dist\compiled\react-dom\cjs\react-dom-client.development.js:20399
dispatchDiscreteEvent @ C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\node_modules\next\dist\compiled\react-dom\cjs\react-dom-client.development.js:20367
C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\src\components\meeting-matches.tsx:314  Error posting meeting: Error: Invalid time duration. Must be greater than 0 hours.
    at handlePostToIntervals (C:\Users\Rajesh.alda\Downloads\MeetingTrackerRepo2\src\components\meeting-matches.tsx:311:15)

---

_**Assistant**_

Looking at the error and the code, I see that we need to check the API endpoint handling for time entries. Let me check the intervals time entries API route:

---

_**Assistant**_



---

_**Assistant**_



I see the issue now. The problem is in how we're handling the time conversion between the frontend and backend. In the frontend, we're converting seconds to decimal hours, but in the backend, we're treating the time value as seconds again.

Let's fix this by updating both the frontend and backend to be consistent:

1. First, let's update the frontend time entry request:

---

_**Assistant**_

```
// ... existing code ...
      const meetingDate = new Date(result.meeting.startTime).toISOString().split('T')[0];
      // Send the raw duration in seconds instead of converting to hours
      const durationInSeconds = userAttendance.duration;
      
      const response = await fetch('/api/intervals/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask.id,
          date: meetingDate,
          time: durationInSeconds, // Send raw seconds
          description: `${result.meeting.subject} - ${userAttendance.role || 'Attendee'} (${Math.round(userAttendance.duration / 60)} minutes)`,
          meetingId: result.meeting.meetingInfo?.meetingId || result.meeting.subject,
          subject: result.meeting.subject,
          startTime: result.meeting.startTime
        }),
      });

      const postResult = await response.json();
      if (postResult.success) {
        const decimalHours = Number((durationInSeconds / 3600).toFixed(2));
        toast.success(`Successfully posted ${decimalHours} hours to Intervals`, {
// ... existing code ...
```

---

_**Assistant**_







Now let's update the backend to handle the time in seconds correctly:

---

_**Assistant**_

```
// ... existing code ...
        // Validate time duration
        if (time <= 0) {
            return NextResponse.json({ 
                error: 'Invalid time duration. Must be greater than 0 seconds.' 
            }, { status: 400 });
        }

        const intervalsApi = new IntervalsAPI(apiKey);
        
        try {
            // Convert seconds to decimal hours for Intervals API
            const timeInHours = Number((time / 3600).toFixed(2));
            
            // Create time entry with hours
            const result = await intervalsApi.createTimeEntry({
                taskId,
                date,
                time: timeInHours,
                description: description || 'No description provided',
                workType: workType || 'Meeting',
                billable: billable ?? true
            });

            // Store the meeting as posted
            const postedMeetingsStorage = new PostedMeetingsStorage();
// ... existing code ...
```

---

_**Assistant**_



The changes I've made should fix the time duration issue by:

1. In the frontend (`meeting-matches.tsx`):
   - Sending the raw duration in seconds to the backend
   - Only converting to hours for display purposes in the success toast

2. In the backend (`time-entries/route.ts`):
   - Accepting the time in seconds
   - Converting seconds to hours before sending to the Intervals API
   - Maintaining proper validation

The error you were seeing should now be resolved because:
1. We're no longer doing multiple conversions between seconds and hours
2. The validation is happening at the right time with the right units
3. The Intervals API is receiving the time in the format it expects (hours)

Would you like to test this fix? Also, I notice there's a linter error in the backend code that we should fix. Would you like me to address that as well?

---

_**User**_

same issue:

Error: Invalid time duration. Must be greater than 0 hours.
    at handlePostToIntervals (webpack-internal:///(app-pages-browser)/./src/components/meeting-matches.tsx:240:23)

---

_**Assistant**_

Let me check the `intervals-api.ts` file since that's where the final API call is being made and where the error seems to be originating:

---

_**Assistant**_



---

_**Assistant**_



I see the issue now. The problem is in the type definitions and how we're handling the time units across different layers. Let me check the rest of the intervals API file:

---

_**Assistant**_



---

_**Assistant**_



Now I see the complete issue. There are multiple problems:

1. The `TimeEntryPayload` interface says time is in seconds, but we're converting it to hours twice:
   - Once in the API route
   - Again in the `createTimeEntry` method

2. The validation in `createTimeEntry` is checking for seconds but throwing an error about hours.

Let's fix this by updating the interfaces and validation:

---

_**Assistant**_

```
// ... existing code ...
interface TimeEntryPayload {
    taskId: string;
    date: string;
    time: number;  // time in hours
    description: string;
    workType: string;
    billable?: boolean;
}

// ... existing code ...

    async createTimeEntry(payload: TimeEntryPayload) {
        console.log('Creating time entry with payload:', payload);
        
        // Validate time duration (already in hours)
        if (!payload.time || payload.time <= 0) {
            throw new Error('Invalid time duration. Must be greater than 0 hours.');
        }

        // Get current user first to get their personid
        const user = await this.getCurrentUser();
        console.log('Current user:', user);

        // Get task details
// ... existing code ...
```

---

_**Assistant**_







Now let's update the API route to be consistent with this change:

---

_**Assistant**_

```
// ... existing code ...
        // Validate time duration
        if (time <= 0) {
            return NextResponse.json({ 
                error: 'Invalid time duration. Must be greater than 0 seconds.' 
            }, { status: 400 });
        }

        const intervalsApi = new IntervalsAPI(apiKey);
        
        try {
            // Convert seconds to decimal hours for Intervals API
            const timeInHours = Number((time / 3600).toFixed(2));
            
            if (timeInHours <= 0) {
                return NextResponse.json({ 
                    error: 'Invalid time duration. Must be greater than 0 hours.' 
                }, { status: 400 });
            }
            
            // Create time entry with hours
            const result = await intervalsApi.createTimeEntry({
                taskId,
                date,
                time: timeInHours, // Send time in hours
                description: description || 'No description provided',
                workType: workType || 'Meeting',
                billable: billable ?? true
            });

            // Store the meeting as posted
            const postedMeetingsStorage = new PostedMeetingsStorage();
            await postedMeetingsStorage.loadData();
            await postedMeetingsStorage.addPostedMeeting(session.user.email, subject, meetingId || '', startTime);

            console.log('Successfully created time entry:', result);
            return NextResponse.json({
                success: true,
                message: `Successfully logged ${timeInHours} hours`,
                result
            });
// ... existing code ...
```

---

_**Assistant**_







Let me check the `PostedMeetingsStorage` class to fix the linter error:

---

_**Assistant**_



---

_**Assistant**_







Now I see the complete issue. Let me fix the API route to match the correct `addPostedMeeting` signature:

---

_**Assistant**_

```
// ... existing code ...
            // Store the meeting as posted
            const postedMeetingsStorage = new PostedMeetingsStorage();
            await postedMeetingsStorage.loadData();
            await postedMeetingsStorage.addPostedMeeting(session.user.email, {
                id: meetingId || '',
                subject: subject,
                startTime: startTime,
                threadId: meetingId
            });

            console.log('Successfully created time entry:', result);
// ... existing code ...
```

---

_**Assistant**_







The changes I've made should fix both the time duration issue and the linter error:

1. Fixed time unit handling:
   - Frontend sends raw seconds
   - API route converts seconds to hours and validates both units
   - Intervals API expects and validates hours
   - Removed duplicate conversion in the Intervals API class

2. Fixed the `addPostedMeeting` call to match its correct signature:
   - Now passing the meeting object with the required properties
   - Fixed the linter error by using the correct parameter structure

3. Improved error messages:
   - Clear distinction between seconds and hours in validation messages
   - Consistent error handling across all layers

The error "Invalid time duration. Must be greater than 0 hours" should now only appear if:
1. The duration is actually 0 or negative
2. The conversion from seconds to hours results in 0 (which would happen for very small durations < 1 second)

Would you like to test these changes? Let me know if you encounter any other issues.

---

_**User**_

i want to change the version to Version 1.1.0

---

_**Assistant**_

I'll help you update the version to 1.1.0. Let me check the package.json file:

---

_**Assistant**_



---

_**Assistant**_



I'll update the version number in package.json:

---

_**Assistant**_

```
{
  "name": "meeting-time-tracker",
  "version": "1.1.0",
  "private": true,
// ... existing code ...
```

---

_**Assistant**_



I've updated the version number from 0.1.0 to 1.1.0 in the package.json file. This change will be reflected in your application's version information.

Would you like me to make any other version-related changes? For example, we could also:
1. Update any version badges or documentation if they exist
2. Create a changelog entry for version 1.1.0 if you'd like
3. Tag this version in git

Let me know if you'd like any of these additional changes!

---

_**User**_

also in frontend bro

---

_**Assistant**_

I'll help you update the version number in the frontend. Let me search for files that might display the version number:

---

_**Assistant**_



---

_**Assistant**_



I found two files that display the version number. Let me update them both:

---

_**Assistant**_

```
// ... existing code ...
<p className="text-sm text-muted-foreground">Version 1.1.0</p>
// ... existing code ...
```

---

_**Assistant**_







Now let's update the dashboard page:

---

_**Assistant**_

```
// ... existing code ...
<p className="text-sm text-muted-foreground">Version 1.1.0</p>
// ... existing code ...
```

---

_**Assistant**_







I've updated the version number to 1.1.0 in all relevant places:

1. `package.json`: ✅ Updated to 1.1.0
2. `src/app/page.tsx` (login page): ✅ Updated to 1.1.0
3. `src/app/dashboard/page.tsx`: ✅ Updated to 1.1.0

The version number should now be consistent across your entire application. Would you like me to check for any other places where the version number might be displayed?

---

_**User**_

when first time user logged in site a interval diagol box open that popup can not be avoid untill and unless put interval key it cannot be bypass

---

_**Assistant**_

I'll help modify the code to make the Intervals API key dialog modal non-dismissible for first-time users. Let me update both the dialog component and its usage:

First, let me check the intervals key dialog component:

---

_**Assistant**_



---

_**Assistant**_



Let me modify the intervals key dialog to make it non-dismissible for first-time users:

---

_**Assistant**_

```
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IntervalsKeyDialogProps {
  open: boolean;
  onSubmit: (apiKey: string) => Promise<void>;
  onClose: () => void;
  existingApiKey?: string | null;
}

export function IntervalsKeyDialog({ open, onSubmit, onClose, existingApiKey }: IntervalsKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Update apiKey when existingApiKey changes
  useEffect(() => {
    if (existingApiKey) {
      setApiKey(existingApiKey);
    }
  }, [existingApiKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(apiKey);
      setApiKey('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to validate API key';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        // Only allow closing if there's an existing API key
        if (existingApiKey && !isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent onInteractOutside={(e) => {
        // Prevent closing on clicking outside if no existing API key
        if (!existingApiKey) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Intervals API Key</DialogTitle>
          <DialogDescription className="space-y-2">
            {existingApiKey 
              ? "Update your Intervals API key or click Close to keep the existing key."
              : (
                <div className="space-y-2">
                  <div className="font-medium text-destructive">
                    An Intervals API key is required to continue.
                  </div>
                  <div>To get your Intervals API key:</div>
                  <ol className="ml-4 list-decimal text-sm space-y-1">
                    <li>Go to Intervals and log into your account</li>
                    <li>Navigate to My Account -&gt; API Access under Options</li>
                    <li>Generate or view your API token (11-character code like: a78828gq6t4)</li>
                    <li>Copy and paste your token below</li>
                  </ol>
                </div>
              )
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Intervals API key"
                required
              />
            </div>
          </div>

          <DialogFooter>
            {existingApiKey && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Close
              </Button>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <AlertCircle className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Key'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

_**Assistant**_







Now let me update the dashboard page to ensure the dialog is shown immediately after login:

---

_**Assistant**_

```
// ... existing code ...
  useEffect(() => {
    const checkApiKey = async () => {
      if (session?.user?.email) {
        const storage = new UserStorage();
        const apiKey = storage.getUserApiKey(session.user.email);
        setIntervalsApiKey(apiKey);
        
        // Always show the dialog if there's no API key
        if (!apiKey) {
          console.log('No API key found for user:', session.user.email);
          setShowApiKeyDialog(true);
        } else {
          console.log('Found existing API key for user:', session.user.email);
        }
      }
    };

    if (status === 'authenticated') {
      checkApiKey();
    }
  }, [status, session]);
// ... existing code ...
```

---

_**Assistant**_







I've made several changes to make the Intervals API key dialog non-dismissible for first-time users:

1. In the `IntervalsKeyDialog` component:
   - Added logic to prevent closing the dialog when there's no existing API key
   - Removed the Close button when there's no existing API key
   - Added a clear message indicating that the API key is required
   - Prevented closing on clicking outside for first-time users
   - Improved the loading state UI for the Save button

2. In the dashboard page:
   - Ensured the dialog is shown immediately after login if no API key exists
   - Maintained the existing functionality for users with API keys

The changes ensure that:
1. First-time users must enter an API key to proceed
2. The dialog cannot be closed without entering a valid API key
3. The Close button is only available when updating an existing key
4. Users get clear feedback about the requirement
5. The dialog appears immediately after login if needed

Would you like me to make any additional changes to this implementation?

---

_**User**_

i want a eye so user can view key

---

_**Assistant**_

I'll add a toggle button with an eye icon to show/hide the API key. Let me modify the intervals key dialog:

---

_**Assistant**_

```
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface IntervalsKeyDialogProps {
  open: boolean;
  onSubmit: (apiKey: string) => Promise<void>;
  onClose: () => void;
  existingApiKey?: string | null;
}

export function IntervalsKeyDialog({ open, onSubmit, onClose, existingApiKey }: IntervalsKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  // Update apiKey when existingApiKey changes
  useEffect(() => {
    if (existingApiKey) {
      setApiKey(existingApiKey);
    }
  }, [existingApiKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit(apiKey);
      setApiKey('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to validate API key';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        // Only allow closing if there's an existing API key
        if (existingApiKey && !isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent onInteractOutside={(e) => {
        // Prevent closing on clicking outside if no existing API key
        if (!existingApiKey) {
          e.preventDefault();
        }
      }}>
        <DialogHeader>
          <DialogTitle>Intervals API Key</DialogTitle>
          <DialogDescription className="space-y-2">
            {existingApiKey 
              ? "Update your Intervals API key or click Close to keep the existing key."
              : (
                <div className="space-y-2">
                  <div className="font-medium text-destructive">
                    An Intervals API key is required to continue.
                  </div>
                  <div>To get your Intervals API key:</div>
                  <ol className="ml-4 list-decimal text-sm space-y-1">
                    <li>Go to Intervals and log into your account</li>
                    <li>Navigate to My Account -&gt; API Access under Options</li>
                    <li>Generate or view your API token (11-character code like: a78828gq6t4)</li>
                    <li>Copy and paste your token below</li>
                  </ol>
                </div>
              )
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showPassword ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Intervals API key"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {showPassword ? "Hide API key" : "Show API key"}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            {existingApiKey && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Close
              </Button>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <AlertCircle className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Key'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

_**Assistant**_



I've made the following changes to add a show/hide toggle for the API key:

1. Added a show/hide password toggle button with eye icons:
   - Eye icon when the key is hidden
   - EyeOff icon when the key is visible
   - The button is positioned absolutely within the input field
   - Added proper accessibility attributes (aria-hidden and sr-only text)

2. Added state management:
   - New `showPassword` state to track visibility
   - Toggle between text and password input types

3. Styled the components:
   - Added padding to the input to prevent text from going under the icon
   - Made the button transparent on hover to match the input style
   - Positioned the button correctly within the input field

4. Added proper keyboard navigation:
   - Set tabIndex={-1} on the eye button to maintain focus on the input

The changes provide a user-friendly way to:
1. View the API key when needed (for verification)
2. Keep the key hidden by default for security
3. Toggle visibility with a single click
4. Maintain accessibility standards

Would you like me to make any adjustments to this implementation?

---

_**User**_

in fetched meetings data & time time must be in same size font can do ti

---

_**Assistant**_

I'll help you make the date & time font size consistent in the fetched meetings table. Let me check the dashboard page where the meetings table is rendered:

---

_**Assistant**_

```
// ... existing code ...
                            <TableCell className="font-medium px-4 py-3">
                              <div className="truncate max-w-[200px] sm:max-w-[300px]">
                                {meeting.subject}
                                {meeting.isTeamsMeeting && (
                                  <Badge variant="secondary" className="ml-2">
                                    Teams
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap px-4 py-3">
                              <div className="text-sm">
                                <div>{formatDate(meeting.startTime)}</div>
                                <div className="text-muted-foreground">
                                  to {formatDate(meeting.endTime)}
                                </div>
                              </div>
                            </TableCell>
// ... existing code ...
```

---

_**Assistant**_







I've updated the date & time cell styling to make the font sizes consistent:

1. Added a container div with `text-sm` class to set a consistent base font size
2. Removed the `text-xs` class that was making the end time smaller
3. Added `text-muted-foreground` to the end time to maintain visual hierarchy without changing size
4. Removed the `mt-0.5` margin since we don't need extra spacing with consistent font sizes

The changes ensure that:
1. Both start and end times have the same font size
2. The visual hierarchy is maintained by using color instead of size
3. The layout remains clean and aligned
4. The text remains readable and consistent

Would you like me to make any adjustments to this styling?

---

_**User**_

dont add text-muted-foreground for end time

---

_**Assistant**_

I'll remove the text-muted-foreground class from the end time to make both times have the same appearance:

---

_**Assistant**_

```
// ... existing code ...
                            <TableCell className="whitespace-nowrap px-4 py-3">
                              <div className="text-sm">
                                <div>{formatDate(meeting.startTime)}</div>
                                <div>
                                  to {formatDate(meeting.endTime)}
                                </div>
                              </div>
                            </TableCell>
// ... existing code ...
```

---

_**Assistant**_



I've removed the `text-muted-foreground` class from the end time div. Now both the start time and end time will have the same color and appearance, making them equally prominent. Would you like me to make any other adjustments to the styling?

---

_**User**_

in task matches , reasons are not vsisible proply can you fix it

---

_**Assistant**_

Let me check the meeting-matches component to fix the reason text visibility:

---



---

