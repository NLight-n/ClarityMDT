"use client";

import { useState, useEffect } from "react";
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

interface CompleteMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  onSuccess?: () => void;
}

export function CompleteMeetingDialog({
  open,
  onOpenChange,
  meetingId,
  onSuccess,
}: CompleteMeetingDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAttendees, setSelectedAttendees] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setSelectedAttendees([]);
      setHighlightedIndex(-1);
    }
  }, [open]);

  // Reset highlighted index when search results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

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
        // Filter out users already selected
        const selectedIds = new Set(selectedAttendees.map((u) => u.id));
        const filteredUsers = users.filter((u: User) => !selectedIds.has(u.id));
        setSearchResults(filteredUsers);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddAttendee = (user: User) => {
    setSelectedAttendees([...selectedAttendees, user]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleRemoveAttendee = (userId: string) => {
    setSelectedAttendees(selectedAttendees.filter((u) => u.id !== userId));
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

  const handleComplete = async () => {
    if (selectedAttendees.length === 0) {
      alert("Please add at least one attendee");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attendeeIds: selectedAttendees.map((u) => u.id),
        }),
      });

      if (response.ok) {
        onSuccess?.();
        onOpenChange(false);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to complete meeting");
      }
    } catch (error) {
      console.error("Error completing meeting:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark Meeting as Completed</DialogTitle>
          <DialogDescription>
            Add attendees who attended this meeting. At least one attendee is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Box */}
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

          {/* Selected Attendees Table */}
          <div className="space-y-2">
            <Label>Selected Attendees ({selectedAttendees.length})</Label>
            {selectedAttendees.length > 0 ? (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedAttendees.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>
                          {user.department?.name || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveAttendee(user.id)}
                            className="h-8 w-8"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="border rounded-md p-8 text-center text-muted-foreground">
                No attendees selected. Please add at least one attendee.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={saving || selectedAttendees.length === 0}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Completing...
              </>
            ) : (
              "Mark as Completed"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

