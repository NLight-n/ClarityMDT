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
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface Meeting {
  id: string;
  date: string;
  description: string | null;
}

interface MeetingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting?: Meeting | null;
  onSuccess?: () => void;
}

export function MeetingForm({
  open,
  onOpenChange,
  meeting,
  onSuccess,
}: MeetingFormProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when meeting changes
  useEffect(() => {
    if (meeting && open) {
      const meetingDate = new Date(meeting.date);
      const dateStr = meetingDate.toISOString().split("T")[0];
      const timeStr = meetingDate.toTimeString().slice(0, 5); // HH:mm format
      setDate(dateStr);
      setTime(timeStr);
      setDescription(meeting.description || "");
    } else if (open && !meeting) {
      // Reset for new meeting
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toTimeString().slice(0, 5);
      setDate(dateStr);
      setTime(timeStr);
      setDescription("");
    }
  }, [meeting, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Combine date and time into ISO string
      const dateTime = new Date(`${date}T${time}:00`);
      const isoString = dateTime.toISOString();

      const url = meeting ? `/api/meetings/${meeting.id}` : "/api/meetings";
      const method = meeting ? "PATCH" : "POST";

      const body: any = {
        date: isoString,
      };

      if (description.trim()) {
        body.description = description.trim();
      } else if (meeting) {
        body.description = null;
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        onSuccess?.();
        onOpenChange(false);
        // Reset form
        setDate("");
        setTime("");
        setDescription("");
        setError(null);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save meeting");
      }
    } catch (error) {
      console.error("Error saving meeting:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      onOpenChange(false);
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {meeting ? "Edit Meeting" : "Create New Meeting"}
            </DialogTitle>
            <DialogDescription>
              {meeting
                ? "Update the meeting details below."
                : "Schedule a new MDT meeting."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter meeting description..."
                rows={3}
                disabled={submitting}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {meeting ? "Updating..." : "Creating..."}
                </>
              ) : (
                meeting ? "Update Meeting" : "Create Meeting"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

