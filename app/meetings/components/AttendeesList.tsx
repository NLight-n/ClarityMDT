"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { X, Search, UserPlus, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebounce } from "@/lib/hooks/useDebounce";

interface User {
  id: string;
  name: string;
  loginId: string;
  role: string;
  department: {
    id: string;
    name: string;
  } | null;
}

interface Attendee {
  id: string;
  user: User;
  createdAt: string;
}

interface AttendeesListProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  initialAttendees?: Attendee[];
  canEdit?: boolean;
  onUpdate?: () => void;
}

export function AttendeesList({
  open,
  onOpenChange,
  meetingId,
  initialAttendees = [],
  canEdit = false,
  onUpdate,
}: AttendeesListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Load attendees when dialog opens
  useEffect(() => {
    if (open && meetingId) {
      loadAttendees();
    }
  }, [open, meetingId]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setHighlightedIndex(-1);
    }
  }, [open]);

  // Reset highlighted index when search results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

  const loadAttendees = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/attendees`);
      if (response.ok) {
        const data = await response.json();
        setAttendees(data);
      }
    } catch (error) {
      console.error("Error loading attendees:", error);
    } finally {
      setLoading(false);
    }
  };

  // Search for users
  useEffect(() => {
    if (debouncedSearch.trim().length > 0) {
      searchUsers(debouncedSearch);
    } else {
      setSearchResults([]);
    }
  }, [debouncedSearch]);

  const searchUsers = async (query: string) => {
    setSearching(true);
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const users = await response.json();
        // Filter out users already in attendees
        const attendeeIds = new Set(attendees.map((a) => a.user.id));
        const filteredUsers = users.filter((u: User) => !attendeeIds.has(u.id));
        setSearchResults(filteredUsers);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddAttendee = (user: User) => {
    // Add to local state (will be saved when user clicks save)
    const newAttendee: Attendee = {
      id: `temp-${user.id}`,
      user,
      createdAt: new Date().toISOString(),
    };
    setAttendees([...attendees, newAttendee]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleRemoveAttendee = (attendeeId: string) => {
    setAttendees(attendees.filter((a) => a.id !== attendeeId));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleAddAttendee(searchResults[highlightedIndex]);
    } else if (e.key === "Escape") {
      setSearchQuery("");
      setSearchResults([]);
      setHighlightedIndex(-1);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    try {
      const attendeeIds = attendees.map((a) => a.user.id);
      const response = await fetch(`/api/meetings/${meetingId}/attendees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attendeeIds }),
      });

      if (response.ok) {
        const updatedAttendees = await response.json();
        setAttendees(updatedAttendees);
        onUpdate?.();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to update attendees");
      }
    } catch (error) {
      console.error("Error saving attendees:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meeting Attendees</DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Search and add attendees to this meeting. Click Save to update."
              : "View attendees for this meeting."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Box - Only show if can edit */}
          {canEdit && (
            <div className="space-y-2">
              <Label htmlFor="search">Search Consultants/Coordinators</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type to search by name or user ID..."
                  className="pl-9"
                />
              </div>

              {/* Search Results Dropdown */}
              {searchQuery.trim().length > 0 && (
                <div className="border rounded-md max-h-60 overflow-y-auto">
                  {searching ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="divide-y">
                      {searchResults.map((user, index) => (
                        <div
                          key={user.id}
                          className={`p-3 hover:bg-accent cursor-pointer flex items-center justify-between ${
                            highlightedIndex === index ? "bg-accent" : ""
                          }`}
                          onClick={() => handleAddAttendee(user)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                        >
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {user.department?.name || "No department"} • {user.role}
                            </p>
                          </div>
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No users found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Attendees Table */}
          <div className="space-y-2">
            <Label>Attendees ({attendees.length})</Label>
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : attendees.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Role</TableHead>
                      {canEdit && <TableHead className="w-[50px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendees.map((attendee) => (
                      <TableRow key={attendee.id}>
                        <TableCell className="font-medium">
                          {attendee.user.name}
                        </TableCell>
                        <TableCell>
                          {attendee.user.department?.name || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{attendee.user.role}</Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveAttendee(attendee.id)}
                              className="h-8 w-8"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="border rounded-md p-8 text-center text-muted-foreground">
                No attendees added yet
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

