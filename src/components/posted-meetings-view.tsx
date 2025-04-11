import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Info } from "lucide-react";

export function PostedMeetingsView() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-2xl font-semibold">Manually Posted Meetings</h2>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Feature Deprecated</AlertTitle>
            <AlertDescription>
              The manual posting feature has been integrated with the AI Agent functionality.
              Please use the "Recently Posted Meetings" section in the AI Agent tab to view all posted meetings.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
} 