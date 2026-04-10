"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/editors/RichTextEditor";
import { CaseStatus } from "@prisma/client";

interface PathologyEditorProps {
  caseId: string;
  caseStatus: CaseStatus;
  initialData: any; // JSON field (ProseMirror format)
  onSave?: () => void;
  isEditing?: boolean;
  setIsEditing?: (editing: boolean) => void;
  onContentChange?: (content: any) => void;
  onContentGetter?: (getter: () => any) => void;
}

export function PathologyEditor({
  caseId,
  caseStatus,
  initialData,
  onSave,
  isEditing,
  setIsEditing,
  onContentChange,
  onContentGetter,
}: PathologyEditorProps) {
  const [content, setContent] = useState<any>(
    initialData || {
      type: "doc",
      content: [],
    }
  );

  // Update content when initialData changes
  useEffect(() => {
    if (initialData) {
      setContent(initialData);
    }
  }, [initialData]);

  useEffect(() => {
    onContentGetter?.(() => content);
  }, [content, onContentGetter]);

  const handleChange = (newContent: any) => {
    setContent(newContent);
    onContentChange?.(newContent);
  };

  return (
    <Card>
      <CardHeader className="pt-3 pb-2">
        <CardTitle>Pathology Findings</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 pb-3 space-y-4">
        <RichTextEditor
          content={content}
          onChange={handleChange}
          editable={!!isEditing}
          caseId={caseId}
          imageType="pathology"
        />
      </CardContent>
    </Card>
  );
}
