"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Save, Edit, Download } from "lucide-react";
import { useSession } from "next-auth/react";
import { canEditConsensusReport } from "@/lib/permissions/client";
import { format } from "date-fns";

interface ConsensusReport {
  id: string;
  finalDiagnosis: string;
  mdtConsensus: string;
  meetingDate: string;
  remarks: string | null;
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface ConsensusEditorProps {
  caseId: string;
  initialConsensus?: ConsensusReport | null;
  onSave?: () => void;
  assignedMeetingId?: string | null;
}

interface MeetingAttendee {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    department: {
      name: string;
    } | null;
    signatureUrl: string | null;
    signatureAuthenticated: boolean;
  };
}

export function ConsensusEditor({
  caseId,
  initialConsensus,
  onSave,
  assignedMeetingId,
}: ConsensusEditorProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [consensus, setConsensus] = useState<ConsensusReport | null>(
    initialConsensus || null
  );
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [attendees, setAttendees] = useState<MeetingAttendee[]>([]);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [formData, setFormData] = useState({
    finalDiagnosis: "",
    mdtConsensus: "",
    meetingDate: "",
    meetingTime: "",
    remarks: "",
  });

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const canEdit = user && canEditConsensusReport(user);

  useEffect(() => {
    loadConsensus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const loadAttendees = async () => {
    if (!assignedMeetingId) {
      setAttendees([]);
      return;
    }

    setLoadingAttendees(true);
    try {
      const response = await fetch(`/api/meetings/${assignedMeetingId}`);
      if (response.ok) {
        const meeting = await response.json();
        setAttendees(meeting.attendees || []);
        // Pre-select all attendees (with or without signatures)
        const allIds = (meeting.attendees || []).map((a: MeetingAttendee) => a.userId);
        setSelectedAttendeeIds(allIds);
      }
    } catch (error) {
      console.error("Error loading attendees:", error);
    } finally {
      setLoadingAttendees(false);
    }
  };

  useEffect(() => {
    if (isPdfDialogOpen && assignedMeetingId) {
      loadAttendees();
    }
  }, [isPdfDialogOpen, assignedMeetingId]);

  // Initialize form data when entering edit mode or when consensus changes
  useEffect(() => {
    if (consensus) {
      const meetingDate = new Date(consensus.meetingDate);
      const dateStr = meetingDate.toISOString().split("T")[0];
      const timeStr = meetingDate.toTimeString().slice(0, 5);
      setFormData({
        finalDiagnosis: consensus.finalDiagnosis,
        mdtConsensus: consensus.mdtConsensus,
        meetingDate: dateStr,
        meetingTime: timeStr,
        remarks: consensus.remarks || "",
      });
    } else if (isEditing) {
      // Initialize with empty form when creating new consensus
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toTimeString().slice(0, 5);
      setFormData({
        finalDiagnosis: "",
        mdtConsensus: "",
        meetingDate: dateStr,
        meetingTime: timeStr,
        remarks: "",
      });
    }
  }, [consensus, isEditing]);

  const loadConsensus = async () => {
    try {
      // Load case data which includes consensus report
      const response = await fetch(`/api/cases/${caseId}`);
      if (response.ok) {
        const caseData = await response.json();
        if (caseData.consensusReport) {
          setConsensus(caseData.consensusReport);
        } else {
          setConsensus(null);
        }
      }
    } catch (error) {
      console.error("Error loading consensus:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setError(null);
    setSaving(true);

    try {
      // Combine date and time into ISO string
      const dateTime = new Date(`${formData.meetingDate}T${formData.meetingTime}:00`);
      const isoString = dateTime.toISOString();

      const url = `/api/consensus/${caseId}`;
      const method = consensus ? "PATCH" : "POST";

      const body: any = {
        finalDiagnosis: formData.finalDiagnosis.trim(),
        mdtConsensus: formData.mdtConsensus.trim(),
        meetingDate: isoString,
      };

      if (formData.remarks.trim()) {
        body.remarks = formData.remarks.trim();
      } else if (consensus) {
        body.remarks = null;
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const updatedConsensus = await response.json();
        setConsensus(updatedConsensus);
        setIsEditing(false);
        onSave?.();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save consensus report");
      }
    } catch (error) {
      console.error("Error saving consensus:", error);
      setError("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (consensus) {
      // Reset form to consensus values
      const meetingDate = new Date(consensus.meetingDate);
      const dateStr = meetingDate.toISOString().split("T")[0];
      const timeStr = meetingDate.toTimeString().slice(0, 5);
      setFormData({
        finalDiagnosis: consensus.finalDiagnosis,
        mdtConsensus: consensus.mdtConsensus,
        meetingDate: dateStr,
        meetingTime: timeStr,
        remarks: consensus.remarks || "",
      });
    } else {
      // Reset to empty form
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toTimeString().slice(0, 5);
      setFormData({
        finalDiagnosis: "",
        mdtConsensus: "",
        meetingDate: dateStr,
        meetingTime: timeStr,
        remarks: "",
      });
    }
    setError(null);
    setIsEditing(false);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleDownloadPdf = async () => {
    if (selectedAttendeeIds.length === 0) {
      alert("Please select at least one attendee");
      return;
    }

    setDownloadingPdf(true);
    try {
      // Build query string with selected attendee IDs
      const attendeeParams = selectedAttendeeIds
        .map((id) => `attendeeIds=${encodeURIComponent(id)}`)
        .join("&");
      
      const url = `/api/consensus/${caseId}/pdf?${attendeeParams}`;
      
      // Trigger download
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `consensus-report-${caseId.substring(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);
        setIsPdfDialogOpen(false);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to generate PDF");
      }
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert("An error occurred while generating the PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center pt-2 pb-3">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Consensus Report</CardTitle>
            {consensus && !isEditing && (
              <div className="text-sm text-muted-foreground space-y-1 mt-1">
                <div>
                  Created by {consensus.createdBy.name} on{" "}
                  {format(new Date(consensus.createdAt), "MMM dd, yyyy HH:mm")}
                </div>
                {consensus.updatedAt !== consensus.createdAt && (
                  <div>
                    Last updated{" "}
                    {format(new Date(consensus.updatedAt), "MMM dd, yyyy HH:mm")}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {consensus && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPdfDialogOpen(true)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            )}
            {canEdit && !isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(true);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                {consensus ? "Edit" : "Create"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        {isEditing && canEdit ? (
          // Editable form for coordinators/admins
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="finalDiagnosis">Final Diagnosis *</Label>
              <Textarea
                id="finalDiagnosis"
                value={formData.finalDiagnosis}
                onChange={handleChange}
                placeholder="Enter final diagnosis..."
                rows={4}
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mdtConsensus">MDT Consensus *</Label>
              <Textarea
                id="mdtConsensus"
                value={formData.mdtConsensus}
                onChange={handleChange}
                placeholder="Enter MDT consensus..."
                rows={6}
                required
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="meetingDate">Meeting Date *</Label>
                <Input
                  id="meetingDate"
                  type="date"
                  value={formData.meetingDate}
                  onChange={handleChange}
                  required
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meetingTime">Meeting Time *</Label>
                <Input
                  id="meetingTime"
                  type="time"
                  value={formData.meetingTime}
                  onChange={handleChange}
                  required
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks (Optional)</Label>
              <Textarea
                id="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Enter any additional remarks..."
                rows={3}
                disabled={saving}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    {consensus ? "Update" : "Create"}
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : consensus ? (
          // Read-only view when consensus exists
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Final Diagnosis</Label>
              <p className="mt-1 whitespace-pre-wrap">{consensus.finalDiagnosis}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">MDT Consensus</Label>
              <p className="mt-1 whitespace-pre-wrap">{consensus.mdtConsensus}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Meeting Date</Label>
              <p className="mt-1">
                {format(new Date(consensus.meetingDate), "MMMM dd, yyyy 'at' HH:mm")}
              </p>
            </div>
            {consensus.remarks && (
              <div>
                <Label className="text-sm font-medium">Remarks</Label>
                <p className="mt-1 whitespace-pre-wrap">{consensus.remarks}</p>
              </div>
            )}
          </div>
        ) : canEdit ? (
          // No consensus yet, but user can create one
          <div className="text-center py-4">
            <p className="text-muted-foreground mb-4">
              No consensus report available. Click &quot;Create&quot; to add one.
            </p>
          </div>
        ) : (
          // No consensus and user can't create
          <p className="text-muted-foreground">
            No consensus report available. Only coordinators and admins can create consensus reports.
          </p>
        )}
      </CardContent>

      {/* PDF Download Dialog */}
      <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Download Consensus PDF</DialogTitle>
            <DialogDescription>
              Select meeting attendees to include in the PDF. Attendees with authenticated digital signatures will show their signatures. Others will show a blank space for physical signature.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingAttendees ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !assignedMeetingId ? (
              <p className="text-sm text-muted-foreground">
                This case is not assigned to a meeting. No attendees available.
              </p>
            ) : attendees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No attendees found for this meeting.
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {attendees.map((attendee) => {
                  const hasSignature = attendee.user.signatureUrl && attendee.user.signatureAuthenticated;
                  return (
                    <div
                      key={attendee.user.id}
                      className="flex items-center space-x-2 p-2 rounded border"
                    >
                      <Checkbox
                        id={`attendee-${attendee.user.id}`}
                        checked={selectedAttendeeIds.includes(attendee.user.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAttendeeIds([...selectedAttendeeIds, attendee.user.id]);
                          } else {
                            setSelectedAttendeeIds(
                              selectedAttendeeIds.filter((id) => id !== attendee.user.id)
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={`attendee-${attendee.user.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{attendee.user.name}</div>
                          {hasSignature ? (
                            <span className="text-xs text-green-600">✓ Digital Signature</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">(Physical Signature)</span>
                          )}
                        </div>
                        {attendee.user.department && (
                          <div className="text-sm text-muted-foreground">
                            {attendee.user.department.name}
                          </div>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPdfDialogOpen(false)}
              disabled={downloadingPdf}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || selectedAttendeeIds.length === 0}
            >
              {downloadingPdf ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

