"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Edit, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import { RichTextEditor } from "@/components/editors/RichTextEditor";
import { processEditorImages } from "@/lib/utils/processEditorImages";
import { CaseStatus } from "@prisma/client";

interface ClinicalDetailsEditorProps {
  caseId: string;
  caseStatus: CaseStatus;
  caseCreatedById: string;
  initialData: any; // JSON field (ProseMirror format)
  onSave?: () => void;
  isEditing?: boolean;
  setIsEditing?: (editing: boolean) => void;
  onContentChange?: (content: any) => void;
}

export function ClinicalDetailsEditor({
  caseId,
  caseStatus,
  caseCreatedById,
  initialData,
  onSave,
  isEditing: externalIsEditing,
  setIsEditing: setExternalIsEditing,
  onContentChange,
}: ClinicalDetailsEditorProps) {
  const { data: session } = useSession();
  const [content, setContent] = useState<any>(
    initialData || {
      type: "doc",
      content: [],
    }
  );
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Use external edit mode if provided, otherwise use internal
  const isEditing = externalIsEditing !== undefined ? externalIsEditing : internalIsEditing;
  const setIsEditing = setExternalIsEditing || setInternalIsEditing;
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

      // Check if user is the case creator
      if (session.user.id === caseCreatedById) {
        setCanEdit(true);
        setCheckingPermission(false);
        return;
      }

      // For other consultants, check via API (same as case editing permissions)
      try {
        const response = await fetch(
          `/api/cases/${caseId}/permissions?type=edit`
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
  }, [caseId, caseCreatedById, session]);

  // Use ref to track previous initialData to avoid infinite loops
  const prevInitialDataRef = useRef<string>();

  // Update content when initialData changes
  useEffect(() => {
    const initialDataStr = JSON.stringify(initialData);
    if (initialData && prevInitialDataRef.current !== initialDataStr) {
      prevInitialDataRef.current = initialDataStr;
      setContent(initialData);
      onContentChange?.(initialData);
    }
  }, [initialData]); // Removed onContentChange from dependencies
  
  // Reset content when edit mode is cancelled
  useEffect(() => {
    if (!isEditing && externalIsEditing !== undefined) {
      const resetData = initialData || { type: "doc", content: [] };
      setContent(resetData);
      onContentChange?.(resetData);
    }
  }, [isEditing, externalIsEditing]); // Removed initialData and onContentChange from dependencies

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
        "clinical"
      );

      const response = await fetch(`/api/cases/${caseId}/clinical-details`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicalDetails: processedContent }),
      });

      if (response.ok) {
        setIsEditing(false);
        onSave?.();
      } else {
        let errorMessage = "Failed to save clinical details";
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (e) {
          errorMessage = `Failed to save clinical details (${response.status})`;
        }
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error saving clinical details:", error);
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
          <CardTitle>Clinical Details</CardTitle>
          {checkingPermission ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            // Only show edit button if using internal edit mode (not controlled externally)
            showEditButton && !isEditing && externalIsEditing === undefined && (
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
              onChange={(newContent) => {
                setContent(newContent);
                onContentChange?.(newContent);
              }}
              editable={isEditing}
              caseId={caseId}
              imageType="clinical"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

