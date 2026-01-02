"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Meeting {
  id: string;
  date: string;
  description: string | null;
  status?: string;
  _count: {
    cases: number;
  };
}

interface CalendarSidebarProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  className?: string;
}

export function CalendarSidebar({
  selectedDate: propSelectedDate,
  onDateSelect: propOnDateSelect,
  className,
}: CalendarSidebarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateFromUrl, setSelectedDateFromUrl] = useState<Date | null>(null);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  
  // Generate year options (current year ± 10 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Get selected date from URL params or props
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const dateParam = params.get("date");
      if (dateParam) {
        setSelectedDateFromUrl(new Date(dateParam));
      } else {
        setSelectedDateFromUrl(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedDate = propSelectedDate || selectedDateFromUrl || null;

  useEffect(() => {
    loadMeetings();
  }, []);

  const loadMeetings = async () => {
    try {
      const response = await fetch("/api/meetings");
      if (response.ok) {
        const data = await response.json();
        // Filter out cancelled meetings
        const activeMeetings = data.filter((meeting: any) => meeting.status !== "CANCELLED");
        setMeetings(activeMeetings);
      }
    } catch (error) {
      console.error("Error loading meetings:", error);
    } finally {
      setLoading(false);
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group meetings by date
  const meetingsByDate = meetings.reduce((acc, meeting) => {
    const dateKey = format(new Date(meeting.date), "yyyy-MM-dd");
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(meeting);
    return acc;
  }, {} as Record<string, Meeting[]>);

  const getMeetingsForDate = (date: Date): Meeting[] => {
    const dateKey = format(date, "yyyy-MM-dd");
    return meetingsByDate[dateKey] || [];
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    handleDateClick(today);
  };

  const handleDateClick = (date: Date) => {
    // If onDateSelect prop is provided, use it
    if (propOnDateSelect) {
      propOnDateSelect(date);
    } else if (typeof window !== "undefined") {
      // Find meeting(s) for this date
      const dateMeetings = getMeetingsForDate(date);
      
      if (dateMeetings.length > 0) {
        // Use the first meeting for this date (if multiple, take the first one)
        const meetingId = dateMeetings[0].id;
        window.location.href = `/register?meetingId=${meetingId}`;
      } else {
        // No meeting for this date, clear meetingId and just show date
        // But since Register page needs a meeting, let's just navigate to register without params
        // which will show the next upcoming meeting
        window.location.href = `/register`;
      }
    }
  };

  const handleMonthChange = (monthIndex: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), monthIndex, 1));
    setShowMonthYearPicker(false);
  };

  const handleYearChange = (year: number) => {
    setCurrentMonth(new Date(year, currentMonth.getMonth(), 1));
    setShowMonthYearPicker(false);
  };

  // Get upcoming meetings (next 7 days, exclude cancelled)
  const upcomingMeetings = meetings
    .filter((meeting) => {
      const meetingDate = new Date(meeting.date);
      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return meetingDate >= now && meetingDate <= weekFromNow && meeting.status !== "CANCELLED";
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Calendar */}
      <Card>
        <CardHeader className="pb-3 relative">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowMonthYearPicker((prev) => !prev)}
              >
                <CalendarIcon className="h-5 w-5 flex-shrink-0" />
              </Button>
              <span className="text-lg font-semibold whitespace-nowrap">
                {format(currentMonth, "MMM yyyy")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={previousMonth}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={nextMonth}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {showMonthYearPicker && (
            <div className="absolute left-2 top-12 z-20 w-[220px] rounded-md border bg-popover shadow-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Select
                  value={currentMonth.getMonth().toString()}
                  onValueChange={(value) => handleMonthChange(parseInt(value))}
                >
                  <SelectTrigger className="w-[120px] h-8 text-sm">
                    <SelectValue placeholder={format(currentMonth, "MMM")} />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month, index) => (
                      <SelectItem key={index} value={index.toString()}>
                        {format(new Date(2000, index, 1), "MMM")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={currentMonth.getFullYear().toString()}
                  onValueChange={(value) => handleYearChange(parseInt(value))}
                >
                  <SelectTrigger className="w-[90px] h-8 text-sm">
                    <SelectValue placeholder={currentMonth.getFullYear().toString()} />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMonthYearPicker(false)}
                  className="h-8 px-2 text-xs"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground p-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for days before month start */}
            {Array.from({ length: monthStart.getDay() }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {/* Days in month */}
            {daysInMonth.map((day) => {
              const dayMeetings = getMeetingsForDate(day);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDateClick(day)}
                  className={`
                    aspect-square rounded-md text-sm transition-colors
                    ${isSelected
                      ? "bg-primary text-primary-foreground"
                      : isToday
                      ? "bg-muted font-semibold"
                      : "hover:bg-accent"
                    }
                    ${dayMeetings.length > 0 ? "border border-primary/50" : ""}
                  `}
                >
                  <div className="flex items-center justify-center h-full">
                    <span>{format(day, "d")}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-4"
            onClick={goToToday}
          >
            Today
          </Button>
        </CardContent>
      </Card>

      {/* Upcoming Meetings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upcoming Meetings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : upcomingMeetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming meetings in the next 7 days.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingMeetings.map((meeting) => {
                const meetingDate = new Date(meeting.date);
                return (
                  <div
                    key={meeting.id}
                    className="border rounded-lg p-3 space-y-1 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/register/meeting/${meeting.id}`}
                        className="font-medium text-sm hover:underline"
                      >
                        {format(meetingDate, "MMM dd, yyyy 'at' HH:mm")}
                      </Link>
                      <Badge variant="secondary" className="text-xs">
                        {meeting._count.cases} case(s)
                      </Badge>
                    </div>
                    {meeting.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {meeting.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

