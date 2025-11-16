'use client';

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useState, useEffect } from "react";
import { Loader2, Filter, Search, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { useSession } from "next-auth/react";
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
import { formatDateIST, DEFAULT_DATE_FORMAT } from "@/lib/utils";

interface PostedMeeting {
  meetingId: string;
  userId: string;
  timeEntry: {
    id: string;
    projectid: string;
    moduleid: string;
    taskid: string;
    worktypeid: string;
    personid: string;
    date: string;
    datemodified: string;
    time: string;
    description: string;
    billable: string;
    worktype: string;
    milestoneid: string | null;
    ogmilestoneid: string | null;
    module: string;
    client?: string;
    project?: string;
    taskTitle?: string;
  };
  postedAt: string;
}

type SortField = keyof PostedMeeting['timeEntry'] | 'meetingId' | 'postedAt';

export function PostedMeetingsView() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
  const [filterText, setFilterText] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [workTypeFilter, setWorkTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<{
    field: SortField;
    direction: 'asc' | 'desc';
  }>({
    field: 'date',
    direction: 'desc'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add sorting options with proper typing
  const sortOptions: { label: string; value: SortField }[] = [
    { label: 'Meeting Date', value: 'date' },
    { label: 'Meeting Name', value: 'description' },
    { label: 'Task Name', value: 'taskTitle' },
    { label: 'Duration', value: 'time' },
    { label: 'Client', value: 'client' },
    { label: 'Project', value: 'project' },
    { label: 'Module', value: 'module' },
    { label: 'Work Type', value: 'worktype' },
    { label: 'Posted Date', value: 'postedAt' }
  ];

  // Add helper function to normalize worktype values
  const normalizeWorktype = (meeting: PostedMeeting): string => {
    // Check for worktype in the timeEntry
    if (meeting.timeEntry.worktype) {
      return meeting.timeEntry.worktype;
    }

    // If there's no worktype but there's a worktypeid of "305064", return "India-Meeting"
    if (meeting.timeEntry.worktypeid === "305064") {
      return "India-Meeting";
    }

    // Default fallback
    return "Meeting";
  };

  // Extract unique modules and work types for filter dropdowns
  const uniqueModules = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.module)));
  const uniqueWorkTypes = Array.from(new Set(postedMeetings.map(meeting => normalizeWorktype(meeting))));
  const uniqueDates = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.date)));
  const uniqueClients = Array.from(new Set(postedMeetings.map(meeting => meeting.timeEntry.client).filter(Boolean))) as string[];
  const uniqueProjects = Array.from(new Set(postedMeetings.map(meeting =>
    meeting.timeEntry.project || meeting.timeEntry.projectid).filter(Boolean))) as string[];

  // Add helper function to decode HTML entities
  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  // Add a date formatter function
  const formatDateTime = (dateString: string) => {
    return formatDateIST(dateString, DEFAULT_DATE_FORMAT);
  };

  // Filtered meetings based on all filters and sorting
  const filteredMeetings = (() => {
    let filtered = [...postedMeetings];

    // Filter by search text
    if (filterText) {
      const searchLower = filterText.toLowerCase();
      filtered = filtered.filter(meeting =>
        meeting.timeEntry.description.toLowerCase().includes(searchLower) ||
        (meeting.timeEntry.taskTitle && meeting.timeEntry.taskTitle.toLowerCase().includes(searchLower))
      );
    }

    // Filter by module
    if (moduleFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.module === moduleFilter);
    }

    // Filter by work type
    if (workTypeFilter !== "all") {
      filtered = filtered.filter(meeting => normalizeWorktype(meeting) === workTypeFilter);
    }

    // Filter by date
    if (dateFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.date === dateFilter);
    }

    // Filter by client
    if (clientFilter !== "all") {
      filtered = filtered.filter(meeting => meeting.timeEntry.client === clientFilter);
    }

    // Filter by project
    if (projectFilter !== "all") {
      filtered = filtered.filter(meeting =>
        meeting.timeEntry.project === projectFilter || meeting.timeEntry.projectid === projectFilter
      );
    }

    // Sort the filtered results
    filtered.sort((a, b) => {
      let aValue: string;
      let bValue: string;

      if (sortConfig.field === 'meetingId' || sortConfig.field === 'postedAt') {
        aValue = String(a[sortConfig.field] || '');
        bValue = String(b[sortConfig.field] || '');
      } else {
        const field = sortConfig.field as keyof PostedMeeting['timeEntry'];
        aValue = String(a.timeEntry[field] || '');
        bValue = String(b.timeEntry[field] || '');
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  })();

  const totalPages = Math.ceil(filteredMeetings.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Paginated meetings
  const paginatedMeetings = filteredMeetings.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterText, moduleFilter, workTypeFilter, dateFilter, clientFilter, projectFilter]);

  // Fetch posted meetings
  const fetchPostedMeetings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/posted-meetings');
      if (response.ok) {
        const data = await response.json();

        // Filter out hidden meetings based on user preference
        let meetings = data.meetings || [];
        if (session?.user?.email) {
          const hiddenMeetingsKey = `hiddenMeetings_${session.user.email}`;
          const hiddenMeetingIds = JSON.parse(localStorage.getItem(hiddenMeetingsKey) || '[]');
          meetings = meetings.filter((meeting: PostedMeeting) =>
            !hiddenMeetingIds.includes(meeting.meetingId)
          );
        }

        setPostedMeetings(meetings);
      } else {
        console.error('Failed to fetch posted meetings');
      }
    } catch (error) {
      console.error('Error fetching posted meetings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    fetchPostedMeetings();
  }, []);

  // Add clearPostedMeetings handler - FRONTEND ONLY (preserves SQLite data)
  const clearPostedMeetings = async () => {
    try {
      if (session?.user?.email) {
        const userEmail = session.user.email;

        // Clear only from local state - SQLite data remains intact
        setPostedMeetings(prevMeetings =>
          prevMeetings.filter(meeting => meeting.userId !== userEmail)
        );

        // Store cleared meetings in localStorage to persist across page refreshes
        const hiddenMeetingsKey = `hiddenMeetings_${userEmail}`;
        const hiddenIds = postedMeetings
          .filter(meeting => meeting.userId === userEmail)
          .map(meeting => meeting.meetingId);
        localStorage.setItem(hiddenMeetingsKey, JSON.stringify(hiddenIds));

        toast({
          title: "History Cleared",
          description: "Posted meetings hidden from view. Database data preserved.",
        });
      }
    } catch (err) {
      console.error('Error clearing posted meetings:', err);
      toast({
        title: "Error",
        description: "Failed to clear posted meetings",
        variant: "destructive"
      });
    }
  };

  const restoreHiddenMeetings = async () => {
    try {
      if (session?.user?.email) {
        const hiddenMeetingsKey = `hiddenMeetings_${session.user.email}`;
        localStorage.removeItem(hiddenMeetingsKey);

        // Refresh the meetings list to show all data
        await fetchPostedMeetings();

        toast({
          title: "Success",
          description: "Hidden meetings restored successfully",
        });
      }
    } catch (err) {
      console.error('Error restoring hidden meetings:', err);
      toast({
        title: "Error",
        description: "Failed to restore hidden meetings",
        variant: "destructive"
      });
    }
  };

  const clearFilters = () => {
    setFilterText("");
    setModuleFilter("all");
    setWorkTypeFilter("all");
    setDateFilter("all");
    setClientFilter("all");
    setProjectFilter("all");
    setSortConfig({
      field: 'date',
      direction: 'desc'
    });
  };

  return (
    <div className="space-y-6 px-4 sm:px-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Recently Posted Meetings</CardTitle>
          <div className="flex space-x-2">
            {postedMeetings.length > 0 && (
              <>
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
                          <label className="text-sm font-medium">Client</label>
                          <Select
                            value={clientFilter}
                            onValueChange={setClientFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Clients</SelectItem>
                              {uniqueClients.map(client => (
                                <SelectItem key={client} value={client}>{client}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Project</label>
                          <Select
                            value={projectFilter}
                            onValueChange={setProjectFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select project" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Projects</SelectItem>
                              {uniqueProjects.map(project => (
                                <SelectItem key={project} value={project}>{project}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Module</label>
                          <Select
                            value={moduleFilter}
                            onValueChange={setModuleFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select module" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Modules</SelectItem>
                              {uniqueModules.map(module => (
                                <SelectItem key={module} value={module}>{module}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Work Type</label>
                          <Select
                            value={workTypeFilter}
                            onValueChange={setWorkTypeFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select work type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Work Types</SelectItem>
                              {uniqueWorkTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
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

                {/* Action Buttons */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearPostedMeetings}
                  className="h-8"
                  title="Hide your posted meetings from view (preserves database data)"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear History
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={restoreHiddenMeetings}
                  className="h-8"
                  title="Restore previously hidden meetings to view"
                  disabled={true}
                >
                  Restore Hidden
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : postedMeetings.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-muted-foreground">
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredMeetings.length)} of {filteredMeetings.length} meetings
                  {filteredMeetings.length !== postedMeetings.length && ` (filtered from ${postedMeetings.length} total)`}
                  {(filterText || moduleFilter !== "all" || workTypeFilter !== "all" || dateFilter !== "all" || clientFilter !== "all" || projectFilter !== "all") && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={clearFilters}
                      className="h-6 p-0 ml-2"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Rows per page:</span>
                  <Select
                    value={pageSize.toString()}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Meeting Date
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Meeting Name
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Task Name
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Duration
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Client
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Project
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground">
                      Module
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Work Type
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Billable
                    </TableHead>
                    <TableHead className="font-semibold text-sm text-foreground whitespace-nowrap">
                      Posted Date & Time
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedMeetings.map((meeting) => (
                    <TableRow key={`${meeting.meetingId}-${meeting.timeEntry.time}-${meeting.postedAt}`}>
                      <TableCell>{meeting.timeEntry.date}</TableCell>
                      <TableCell>{decodeHtmlEntities(meeting.timeEntry.description)}</TableCell>
                      <TableCell>
                        {meeting.timeEntry.taskTitle ? decodeHtmlEntities(meeting.timeEntry.taskTitle) : (
                          <span className="text-muted-foreground">
                            {`No task title available`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{meeting.timeEntry.time}</TableCell>
                      <TableCell>{meeting.timeEntry.client || "N/A"}</TableCell>
                      <TableCell>{meeting.timeEntry.project || meeting.timeEntry.projectid || "N/A"}</TableCell>
                      <TableCell>{decodeHtmlEntities(meeting.timeEntry.module)}</TableCell>
                      <TableCell>{decodeHtmlEntities(normalizeWorktype(meeting))}</TableCell>
                      <TableCell>{meeting.timeEntry.billable === 't' ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{formatDateTime(meeting.postedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="h-8"
                    >
                      First
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8"
                    >
                      Previous
                    </Button>
                    <span className="flex items-center gap-1 text-sm">
                      {Math.max(1, currentPage - 2) !== 1 && (
                        <>
                          <Button
                            variant={1 === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            className="h-8 w-8"
                          >
                            1
                          </Button>
                          {Math.max(1, currentPage - 2) > 2 && <span>...</span>}
                        </>
                      )}

                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                          if (pageNum <= totalPages) {
                            return (
                              <Button
                                key={pageNum}
                                variant={pageNum === currentPage ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(pageNum)}
                                className="h-8 w-8"
                              >
                                {pageNum}
                              </Button>
                            );
                          }
                          return null;
                        }
                      )}

                      {Math.min(totalPages, currentPage + 2) !== totalPages && totalPages > 5 && (
                        <>
                          {Math.min(totalPages, currentPage + 2) < totalPages - 1 && <span>...</span>}
                          <Button
                            variant={totalPages === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            className="h-8 w-8"
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8"
                    >
                      Next
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="h-8"
                    >
                      Last
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No meetings posted yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
