import { PostedMeetings } from "./posted-meetings";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { RefreshCw, Filter, Search, Trash2 } from "lucide-react";
import { useToast } from "./ui/use-toast";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
  taskId?: string;
  taskName?: string;
  duration?: number;
}

export function PostedMeetingsView() {
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
  const [isResetting, setIsResetting] = useState(false);
  const { success, error } = useToast();

  // Add state for filtering
  const [filterText, setFilterText] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [filteredMeetings, setFilteredMeetings] = useState<PostedMeeting[]>([]);

  // Add sorting state
  type SortField = keyof PostedMeeting | 'duration';
  const [sortConfig, setSortConfig] = useState<{
    field: SortField;
    direction: 'asc' | 'desc';
  }>({
    field: 'meetingDate',
    direction: 'desc'
  });

  // Add sorting options
  const sortOptions: { label: string; value: SortField }[] = [
    { label: 'Meeting Date', value: 'meetingDate' },
    { label: 'Meeting Name', value: 'subject' },
    { label: 'Task Name', value: 'taskName' },
    { label: 'Duration', value: 'duration' },
    { label: 'Posted Date', value: 'postedDate' }
  ];

  // Extract unique dates and tasks for filter dropdowns
  const uniqueDates = Array.from(new Set(postedMeetings.map(meeting => 
    new Date(meeting.meetingDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  )));
  const uniqueTasks = Array.from(new Set(postedMeetings.map(meeting => meeting.taskName || 'Unassigned')));

  // Add sort function
  const sortMeetings = (meetings: PostedMeeting[]) => {
    return [...meetings].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (sortConfig.field === 'duration') {
        aValue = a.duration || 0;
        bValue = b.duration || 0;
      } else {
        aValue = (a[sortConfig.field as keyof PostedMeeting] as string) || '';
        bValue = (b[sortConfig.field as keyof PostedMeeting] as string) || '';
      }

      // Convert to lowercase if string
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Update filtered meetings whenever filters or meetings change
  useEffect(() => {
    let filtered = [...postedMeetings];
    
    // Filter by search text
    if (filterText) {
      const searchLower = filterText.toLowerCase();
      filtered = filtered.filter(meeting => 
        meeting.subject.toLowerCase().includes(searchLower) ||
        (meeting.taskName && meeting.taskName.toLowerCase().includes(searchLower))
      );
    }
    
    // Filter by date
    if (dateFilter !== "all") {
      filtered = filtered.filter(meeting => 
        new Date(meeting.meetingDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }) === dateFilter
      );
    }
    
    // Filter by task
    if (taskFilter !== "all") {
      filtered = filtered.filter(meeting => 
        (meeting.taskName || 'Unassigned') === taskFilter
      );
    }
    
    // Apply sorting
    filtered = sortMeetings(filtered);
    
    setFilteredMeetings(filtered);
  }, [postedMeetings, filterText, dateFilter, taskFilter, sortConfig]);

  const fetchPostedMeetings = async () => {
    try {
      const response = await fetch('/api/meetings/posted');
      if (response.ok) {
        const data = await response.json();
        
        // Deduplicate meetings based on ID
        const uniqueMeetings = deduplicateMeetings(data.meetings || []);
        
        setPostedMeetings(uniqueMeetings);
        setFilteredMeetings(uniqueMeetings); // Initialize filtered meetings
      }
    } catch (error) {
      console.error('Error fetching posted meetings:', error);
    }
  };

  // Helper function to deduplicate meetings by ID
  const deduplicateMeetings = (meetings: PostedMeeting[]): PostedMeeting[] => {
    const meetingMap = new Map<string, PostedMeeting>();
    
    // Use map to keep the latest posted meeting (by postedDate) for each ID
    meetings.forEach(meeting => {
      const existingMeeting = meetingMap.get(meeting.id);
      
      // If this is the first meeting with this ID or it's newer than the existing one, store it
      if (!existingMeeting || new Date(meeting.postedDate) > new Date(existingMeeting.postedDate)) {
        meetingMap.set(meeting.id, meeting);
      }
    });
    
    // Convert map values back to array
    return Array.from(meetingMap.values());
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
        setFilteredMeetings([]);
        success("Posted meetings history has been cleared");
      } else {
        error("Failed to clear meetings");
      }
    } catch (err) {
      console.error('Error clearing meetings:', err);
      error("Failed to clear meetings");
    } finally {
      setIsResetting(false);
    }
  };

  // Update clearFilters to include sorting reset
  const clearFilters = () => {
    setFilterText("");
    setDateFilter("all");
    setTaskFilter("all");
    setSortConfig({
      field: 'meetingDate',
      direction: 'desc'
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <div className="flex items-center gap-4">
              <h2 className="text-xl sm:text-2xl font-semibold">Manually Posted Meetings</h2>
              <div className="text-sm text-muted-foreground">
                Total Posted: {postedMeetings.length}
              </div>
            </div>
            {postedMeetings.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Filters
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-4">
                      <h4 className="font-medium">Filter Meetings</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="text-sm font-medium">Date</label>
                          <Select
                            value={dateFilter}
                            onValueChange={setDateFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select date" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Dates</SelectItem>
                              {uniqueDates.map(date => (
                                <SelectItem key={date} value={date}>{date}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Task</label>
                          <Select
                            value={taskFilter}
                            onValueChange={setTaskFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select task" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Tasks</SelectItem>
                              {uniqueTasks.map(task => (
                                <SelectItem key={task} value={task}>{task}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button onClick={clearFilters} variant="outline" size="sm" className="w-full">
                        Clear Filters
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      Sort
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60">
                    <div className="space-y-4">
                      <h4 className="font-medium">Sort Meetings</h4>
                      <div className="space-y-2">
                        <Select
                          value={sortConfig.field}
                          onValueChange={(value: SortField) => setSortConfig(prev => ({ 
                            ...prev, 
                            field: value
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field to sort" />
                          </SelectTrigger>
                          <SelectContent>
                            {sortOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSortConfig(prev => ({
                            ...prev,
                            direction: prev.direction === 'asc' ? 'desc' : 'asc'
                          }))}
                          className="w-full"
                        >
                          {sortConfig.direction === 'asc' ? 'Sort Ascending ↑' : 'Sort Descending ↓'}
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="relative h-8">
                  <Search className="h-4 w-4 absolute left-2 top-2 text-muted-foreground" />
                  <Input
                    placeholder="Search meetings..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="h-8 pl-8 pr-4 w-[150px] sm:w-[200px]"
                  />
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleResetPosted}
                  disabled={isResetting}
                  className="h-8 whitespace-nowrap"
                >
                  {isResetting ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Clear History
                </Button>
              </div>
            )}
          </div>
          {(filterText || dateFilter !== "all" || taskFilter !== "all") && (
            <div className="text-sm text-muted-foreground mt-4">
              Showing {filteredMeetings.length} of {postedMeetings.length} meetings
              <Button
                variant="link"
                size="sm"
                onClick={clearFilters}
                className="h-6 p-0 ml-2"
              >
                Clear filters
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6">
          <PostedMeetings meetings={filteredMeetings} />
        </CardContent>
      </Card>
    </div>
  );
} 