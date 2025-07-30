"use client"

import * as React from "react"
import { format, subDays, startOfYear, endOfYear } from "date-fns"
import { Calendar as CalendarIcon, Search, X } from "lucide-react"
import { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DateRangePickerProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  className?: string
  variant?: "default" | "compact"
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
  variant = "default",
}: DateRangePickerProps) {
  // Calculate date restrictions - restrict to current year only
  const today = new Date()
  const currentYear = today.getFullYear()
  const startOfCurrentYear = startOfYear(today)
  const endOfCurrentYear = endOfYear(today)
  
  // For past date restriction, use the later of: 30 days ago OR start of current year
  const thirtyDaysAgo = subDays(today, 30)
  const minSelectableDate = new Date(Math.max(thirtyDaysAgo.getTime(), startOfCurrentYear.getTime()))
  
  // Internal state for temporary date selections
  const [startDate, setStartDate] = React.useState<Date | undefined>(dateRange?.from)
  const [endDate, setEndDate] = React.useState<Date | undefined>(dateRange?.to)
  
  // Update internal state when external dateRange changes
  React.useEffect(() => {
    setStartDate(dateRange?.from)
    setEndDate(dateRange?.to)
  }, [dateRange])
  
  const handleSearch = () => {
    if (startDate && endDate) {
      onDateRangeChange({ from: startDate, to: endDate })
    } else if (startDate) {
      onDateRangeChange({ from: startDate, to: undefined })
    } else {
      onDateRangeChange(undefined)
    }
  }
  
  const handleClear = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    onDateRangeChange(undefined)
  }
  
  const formatDateForInput = (date: Date | undefined) => {
    return date ? format(date, "yyyy-MM-dd") : ""
  }
  
  const parseDateFromInput = (dateString: string) => {
    if (!dateString) return undefined
    const date = new Date(dateString)
    return isNaN(date.getTime()) ? undefined : date
  }
  
  // Compact variant for header use
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {/* Start Date */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "justify-start text-left font-normal",
                !startDate && "text-muted-foreground"
              )}
              size="sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "MMM dd, yyyy") : "Start"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={setStartDate}
              fromDate={minSelectableDate}
              toDate={endDate || endOfCurrentYear}
              disabled={{ 
                before: minSelectableDate, 
                after: endDate || endOfCurrentYear 
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        
        {/* End Date */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "justify-start text-left font-normal",
                !endDate && "text-muted-foreground"
              )}
              size="sm"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "MMM dd, yyyy") : "End"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={setEndDate}
              fromDate={startDate || minSelectableDate}
              toDate={endOfCurrentYear}
              disabled={{ 
                before: startDate || minSelectableDate,
                after: endOfCurrentYear
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        
        {/* Search Button */}
        <Button 
          onClick={handleSearch}
          disabled={!startDate}
          size="sm"
        >
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
        
        {/* Clear Button - only show when there's a selected range */}
        {dateRange?.from && (
          <Button 
            onClick={handleClear}
            variant="outline"
            size="sm"
          >
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
        )}
      </div>
    )
  }
  
  // Default variant for full layout
  return (
    <div className={cn("grid gap-3", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        {/* Start Date */}
        <div className="space-y-2">
          <Label htmlFor="start-date" className="text-sm font-medium">
            Start Date
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="start-date"
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "MMM dd, yyyy") : "Select start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                fromDate={minSelectableDate}
                toDate={endDate || endOfCurrentYear}
                disabled={{ 
                  before: minSelectableDate, 
                  after: endDate || endOfCurrentYear 
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        
        {/* End Date */}
        <div className="space-y-2">
          <Label htmlFor="end-date" className="text-sm font-medium">
            End Date
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="end-date"
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM dd, yyyy") : "Select end date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                fromDate={startDate || minSelectableDate}
                toDate={endOfCurrentYear}
                disabled={{ 
                  before: startDate || minSelectableDate,
                  after: endOfCurrentYear
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Search Button */}
        <div className="space-y-2">
          <Label className="text-sm font-medium opacity-0">Search</Label>
          <Button 
            onClick={handleSearch}
            disabled={!startDate}
            className="w-full"
          >
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </div>
      </div>
      
      {/* Current Selection Display */}
      {dateRange?.from && dateRange?.to && (
        <div className="text-sm text-muted-foreground text-center">
          Selected: {format(dateRange.from, "MMM dd, yyyy")} - {format(dateRange.to, "MMM dd, yyyy")}
        </div>
      )}
    </div>
  )
} 