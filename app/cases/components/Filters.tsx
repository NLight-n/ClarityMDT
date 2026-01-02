"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CaseStatus } from "@prisma/client";
import { X, Search } from "lucide-react";

interface FiltersProps {
  status: CaseStatus | "ALL" | null;
  departmentId: string | null;
  meetingId: string | null;
  search: string | null;
  departments: Array<{ id: string; name: string }>;
  meetings: Array<{ id: string; date: string; description: string | null }>;
  onStatusChange: (status: CaseStatus | "ALL" | null) => void;
  onDepartmentChange: (departmentId: string | null) => void;
  onMeetingChange: (meetingId: string | null) => void;
  onSearchChange: (search: string | null) => void;
  onClear: () => void;
}

export function Filters({
  status,
  departmentId,
  meetingId,
  search,
  departments,
  meetings,
  onStatusChange,
  onDepartmentChange,
  onMeetingChange,
  onSearchChange,
  onClear,
}: FiltersProps) {
  const hasFilters = status !== null || departmentId !== null || meetingId !== null || (search !== null && search.trim() !== "");

  return (
    <div className="flex flex-wrap items-end gap-4 p-4 border rounded-lg bg-card">
      <div className="flex-1 min-w-[250px]">
        <Label htmlFor="search-filter">Search</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="search-filter"
            placeholder="Search by patient name, MRN, or diagnosis..."
            value={search || ""}
            onChange={(e) => onSearchChange(e.target.value || null)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 min-w-[200px]">
        <Label htmlFor="status-filter">Status</Label>
        <Select
          value={status || "ALL"}
          onValueChange={(value) =>
            onStatusChange(value === "ALL" ? null : (value as CaseStatus))
          }
        >
          <SelectTrigger id="status-filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value={CaseStatus.DRAFT}>Draft</SelectItem>
            <SelectItem value={CaseStatus.SUBMITTED}>Submitted</SelectItem>
            <SelectItem value={CaseStatus.PENDING}>Pending</SelectItem>
            <SelectItem value={CaseStatus.REVIEWED}>Reviewed</SelectItem>
            <SelectItem value={CaseStatus.RESUBMITTED}>Resubmitted</SelectItem>
            <SelectItem value={CaseStatus.ARCHIVED}>Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-w-[200px]">
        <Label htmlFor="department-filter">Department</Label>
        <Select
          value={departmentId || "ALL"}
          onValueChange={(value) =>
            onDepartmentChange(value === "ALL" ? null : value)
          }
        >
          <SelectTrigger id="department-filter">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>
                {dept.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-w-[200px]">
        <Label htmlFor="meeting-filter">Meeting</Label>
        <Select
          value={meetingId || "ALL"}
          onValueChange={(value) =>
            onMeetingChange(value === "ALL" ? null : value)
          }
        >
          <SelectTrigger id="meeting-filter">
            <SelectValue placeholder="All meetings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Meetings</SelectItem>
            {meetings.map((meeting) => (
              <SelectItem key={meeting.id} value={meeting.id}>
                {new Date(meeting.date).toLocaleDateString()} - {meeting.description || "No description"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button variant="outline" onClick={onClear}>
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
      )}
    </div>
  );
}

