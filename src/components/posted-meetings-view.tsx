import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { AlertCircle } from "lucide-react";

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
          <div className="rounded-md relative overflow-hidden">
            <div className="flex items-start space-x-3 p-4 bg-yellow-100 border-2 border-yellow-500 rounded-md relative overflow-hidden">
              <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#000,#000_10px,#eab308_10px,#eab308_20px)] opacity-10"></div>
              <AlertCircle className="h-5 w-5 text-black flex-shrink-0 z-10 mt-0.5" />
              <div className="z-10">
                <h3 className="text-base font-bold text-black mb-1">Feature Deprecated</h3>
                <p className="text-sm text-black">
                  The manual posting feature has been integrated with the AI Agent functionality.
                  Please use the "Recently Posted Meetings" section in the AI Agent tab to view all posted meetings.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 