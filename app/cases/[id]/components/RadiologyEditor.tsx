"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Edit, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import { RichTextEditor } from "@/components/editors/RichTextEditor";
import { processEditorImages } from "@/lib/utils/processEditorImages";
import { CaseStatus } from "@prisma/client";

interface RadiologyEditorProps {
  caseId: string;
  caseStatus: CaseStatus;
  initialData: any; // JSON field (ProseMirror format)
  onSave?: () => void;
}

export function RadiologyEditor({
  caseId,
  caseStatus,
  initialData,
  onSave,
}: RadiologyEditorProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState<any>(
    initialData || {
      type: "doc",
      content: [],
    }
  );
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  // Check permissions via API
  useEffect(() => {
    const checkPermissions = async () => {
      if (!session?.user) {
        setCanEdit(false);
        setCheckingPermission(false);
        return;
      }

      const user = {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      };

      // Quick client-side check for coordinators/admins
      if (isCoordinator(user)) {
        setCanEdit(true);
        setCheckingPermission(false);
        return;
      }

      // For consultants, check via API
      try {
        const response = await fetch(
          `/api/cases/${caseId}/permissions?type=radiology`
        );
        if (response.ok) {
          const data = await response.json();
          setCanEdit(data.canEdit || false);
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
        setCanEdit(false);
      } finally {
        setCheckingPermission(false);
      }
    };

    checkPermissions();
  }, [caseId, session]);

  // Update content when initialData changes
  useEffect(() => {
    if (initialData) {
      setContent(initialData);
    }
  }, [initialData]);

  // Check if editing is allowed based on status
  const canEditByStatus = 
    caseStatus === CaseStatus.DRAFT ||
    caseStatus === CaseStatus.SUBMITTED ||
    caseStatus === CaseStatus.PENDING ||
    caseStatus === CaseStatus.RESUBMITTED;
  
  const showEditButton = canEdit && canEditByStatus;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Process images: upload base64 images to MinIO and replace with storageKeys
      const processedContent = await processEditorImages(
        content,
        caseId,
        "radiology"
      );

      const response = await fetch(`/api/cases/${caseId}/radiology-findings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radiologyFindings: processedContent }),
      });

      if (response.ok) {
        setIsEditing(false);
        onSave?.();
      } else {
        let errorMessage = "Failed to save radiology findings";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (e) {
          errorMessage = `Failed to save radiology findings (${response.status})`;
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error saving radiology findings:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setContent(initialData || { type: "doc", content: [] });
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader className="pt-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Radiology Findings</CardTitle>
          {checkingPermission ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            showEditButton && !isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-3 space-y-4">
        {checkingPermission ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <>
            <RichTextEditor
              content={content}
              onChange={isEditing ? setContent : undefined}
              editable={isEditing}
              caseId={caseId}
              imageType="radiology"
            />
        {isEditing && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCancel} disabled={saving}>
              <X className="mr-2 h-4 w-4" />
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
        )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
