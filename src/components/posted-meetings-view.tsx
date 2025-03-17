import { PostedMeetings } from "./posted-meetings";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { RefreshCw } from "lucide-react";
import { useToast } from "./ui/use-toast";

interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
  taskId?: string;
  taskName?: string;
}

export function PostedMeetingsView() {
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const { success, error } = useToast();

  const fetchPostedMeetings = async () => {
    try {
      const response = await fetch('/api/meetings/posted');
      if (response.ok) {
        const data = await response.json();
        setPostedMeetings(data.meetings || []);
      }
    } catch (error) {
      console.error('Error fetching posted meetings:', error);
    }
  };

  useEffect(() => {
    fetchPostedMeetings();
  }, []);

  const handleResetPosted = async () => {
    if (isResetting) return;
    
    setIsResetting(true);
    try {
      const response = await fetch('/api/meetings/posted', {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setPostedMeetings([]);
        success("Posted meetings history has been cleared");
      } else {
        error("Failed to clear posted meetings");
      }
    } catch (err) {
      console.error('Error clearing posted meetings:', err);
      error("Failed to clear posted meetings");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Posted Meetings</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Total Posted: {postedMeetings.length}
          </div>
          {postedMeetings.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleResetPosted}
              disabled={isResetting}
            >
              {isResetting ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Reset Posted
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meeting History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <PostedMeetings meetings={postedMeetings} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 