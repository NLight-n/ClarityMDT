"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, Edit, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import { CaseStatus } from "@prisma/client";

interface FollowUpEditorProps {
  caseId: string;
  caseCreatedById: string;
  caseStatus: CaseStatus;
  initialFollowUp?: string | null;
  onUpdate?: () => void;
}

export function FollowUpEditor({
  caseId,
  caseCreatedById,
  caseStatus,
  initialFollowUp = null,
  onUpdate,
}: FollowUpEditorProps) {
  const { data: session } = useSession();
  const [followUp, setFollowUp] = useState(initialFollowUp || "");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const isCreator = user?.id === caseCreatedById;
  const canEditPermission = user && (isCreator || isCoordinator(user));

  // Only show for REVIEWED, RESUBMITTED, ARCHIVED status
  const shouldShow =
    caseStatus === CaseStatus.REVIEWED ||
    caseStatus === CaseStatus.RESUBMITTED ||
    caseStatus === CaseStatus.ARCHIVED;

  // Can edit follow-up for REVIEWED, RESUBMITTED, or ARCHIVED status
  // (section only shows for REVIEWED/RESUBMITTED/ARCHIVED, so all visible statuses allow editing)
  const canEditByStatus = 
    caseStatus === CaseStatus.REVIEWED ||
    caseStatus === CaseStatus.RESUBMITTED ||
    caseStatus === CaseStatus.ARCHIVED;
  
  const canEdit = canEditPermission && canEditByStatus;

  useEffect(() => {
    setFollowUp(initialFollowUp || "");
  }, [initialFollowUp]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          followUp: followUp.trim() || null,
        }),
      });

      if (response.ok) {
        setIsEditing(false);
        onUpdate?.();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to save follow-up");
        // Revert to previous state on error
        setFollowUp(initialFollowUp || "");
      }
    } catch (error) {
      console.error("Error saving follow-up:", error);
      alert("An error occurred. Please try again.");
      // Revert to previous state on error
      setFollowUp(initialFollowUp || "");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFollowUp(initialFollowUp || "");
    setIsEditing(false);
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pt-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Follow-up</CardTitle>
          {canEdit && !isEditing && (
            <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-3">
        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="followUp">Follow-up Information</Label>
              <Textarea
                id="followUp"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Enter follow-up information about the case discussed and treated as per MDT consensus..."
                rows={6}
                disabled={saving}
                className="whitespace-pre-wrap"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {followUp ? (
              <p className="whitespace-pre-wrap">{followUp}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No follow-up information added yet.
                {canEdit && " Click Edit to add follow-up information."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

