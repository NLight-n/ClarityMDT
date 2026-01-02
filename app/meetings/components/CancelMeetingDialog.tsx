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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { MessageDialog } from "@/components/ui/message-dialog";

interface Case {
  id: string;
  patientName: string;
  mrn: string | null;
  status: string;
}

interface Meeting {
  id: string;
  date: string;
  description: string | null;
}

interface CancelMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  caseCount: number;
  submittedCases?: Case[];
  onSuccess?: () => void;
}

export function CancelMeetingDialog({
  open,
  onOpenChange,
  meetingId,
  caseCount,
  submittedCases = [],
  onSuccess,
}: CancelMeetingDialogProps) {
  const [cancellationRemarks, setCancellationRemarks] = useState("");
  const [caseReassignments, setCaseReassignments] = useState<Record<string, string | null>>({});
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // MessageDialog state
  const [messageDialog, setMessageDialog] = useState<{
    open: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (open) {
      // Initialize case reassignments
      const initialReassignments: Record<string, string | null> = {};
      submittedCases.forEach((c) => {
        initialReassignments[c.id] = null;
      });
      setCaseReassignments(initialReassignments);
      setCancellationRemarks("");

      // Load upcoming meetings for reassignment
      if (submittedCases.length > 0) {
        loadUpcomingMeetings();
      }
    }
  }, [open, submittedCases]);

  const loadUpcomingMeetings = async () => {
    setLoadingMeetings(true);
    try {
      const response = await fetch("/api/meetings");
      if (response.ok) {
        const meetings = await response.json();
        const now = new Date();
        const upcoming = meetings
          .filter((m: Meeting) => new Date(m.date) >= now && m.id !== meetingId)
          .sort((a: Meeting, b: Meeting) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );
        setUpcomingMeetings(upcoming);
      }
    } catch (error) {
      console.error("Error loading meetings:", error);
    } finally {
      setLoadingMeetings(false);
    }
  };

  const handleCancel = async () => {
    // Validate: if there are submitted cases, all must be reassigned
    if (submittedCases.length > 0) {
      const allReassigned = submittedCases.every(
        (c) => caseReassignments[c.id] !== undefined
      );
      if (!allReassigned) {
        setMessageDialog({
          open: true,
          type: "error",
          title: "Cases Not Reassigned",
          message: "Please reassign all submitted/pending cases before cancelling the meeting.",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const reassignCases = submittedCases.map((c) => ({
        caseId: c.id,
        newMeetingId: caseReassignments[c.id] || null,
      }));

      const response = await fetch(`/api/meetings/${meetingId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cancellationRemarks: cancellationRemarks.trim() || null,
          reassignCases: reassignCases.length > 0 ? reassignCases : undefined,
        }),
      });

      if (response.ok) {
        onSuccess?.();
        onOpenChange(false);
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Cancellation Failed",
          message: error.error || "Failed to cancel meeting",
        });
      }
    } catch (error) {
      console.error("Error cancelling meeting:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancel Meeting</DialogTitle>
          <DialogDescription>
            {caseCount === 0
              ? "Are you sure you want to cancel this meeting?"
              : `This meeting has ${submittedCases.length} submitted/pending case(s) that must be reassigned before cancellation.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {caseCount > 0 && submittedCases.length > 0 && (
            <div className="space-y-4 p-4 border rounded-lg bg-yellow-50 border-yellow-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-yellow-900">
                    Reassign Cases Before Cancellation
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    The following cases must be reassigned to another meeting or unassigned:
                  </p>
                </div>
              </div>

              {loadingMeetings ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {submittedCases.map((caseItem) => (
                    <div key={caseItem.id} className="space-y-2 p-3 bg-white rounded border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{caseItem.patientName}</p>
                          {caseItem.mrn && (
                            <p className="text-sm text-muted-foreground">
                              MRN: {caseItem.mrn}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {caseItem.status}
                        </span>
                      </div>
                      <RadioGroup
                        value={caseReassignments[caseItem.id] || "none"}
                        onValueChange={(value) => {
                          setCaseReassignments({
                            ...caseReassignments,
                            [caseItem.id]: value === "none" ? null : value,
                          });
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="none" id={`${caseItem.id}-none`} />
                          <Label htmlFor={`${caseItem.id}-none`} className="cursor-pointer">
                            Unassign (remove from meeting)
                          </Label>
                        </div>
                        {upcomingMeetings.map((meeting) => (
                          <div key={meeting.id} className="flex items-center space-x-2">
                            <RadioGroupItem
                              value={meeting.id}
                              id={`${caseItem.id}-${meeting.id}`}
                            />
                            <Label
                              htmlFor={`${caseItem.id}-${meeting.id}`}
                              className="cursor-pointer flex-1"
                            >
                              <div>
                                <div className="font-medium">
                                  {format(new Date(meeting.date), "EEEE, MMMM dd, yyyy 'at' HH:mm")}
                                </div>
                                {meeting.description && (
                                  <div className="text-sm text-muted-foreground">
                                    {meeting.description}
                                  </div>
                                )}
                              </div>
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                      {upcomingMeetings.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No upcoming meetings available. Case will be unassigned.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="remarks">Cancellation Remarks (Optional)</Label>
            <Textarea
              id="remarks"
              value={cancellationRemarks}
              onChange={(e) => setCancellationRemarks(e.target.value)}
              placeholder="Enter reason for cancellation..."
              rows={3}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={saving || (submittedCases.length > 0 && loadingMeetings)}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              "Cancel Meeting"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      {/* Message Dialog */}
      <MessageDialog
        open={messageDialog.open}
        onOpenChange={(open) => setMessageDialog({ ...messageDialog, open })}
        type={messageDialog.type}
        title={messageDialog.title}
        message={messageDialog.message}
      />
    </Dialog>
  );
}

