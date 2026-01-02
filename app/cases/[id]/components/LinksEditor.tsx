"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Plus, Edit, Trash2, Save, X, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import { CaseStatus } from "@prisma/client";

interface Link {
  label: string;
  url: string;
}

interface LinksEditorProps {
  caseId: string;
  caseStatus: CaseStatus;
  caseCreatedById: string;
  initialLinks?: Link[] | null;
  onUpdate?: () => void;
  isEditing?: boolean;
  setIsEditing?: (editing: boolean) => void;
}

export function LinksEditor({
  caseId,
  caseStatus,
  caseCreatedById,
  initialLinks = [],
  onUpdate,
  isEditing: externalIsEditing,
  setIsEditing: setExternalIsEditing,
}: LinksEditorProps) {
  const { data: session } = useSession();
  const [links, setLinks] = useState<Link[]>(initialLinks || []);
  const [internalIsEditingMode, setInternalIsEditingMode] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [saving, setSaving] = useState(false);
  
  // Use external edit mode if provided, otherwise use internal
  const isEditingMode = externalIsEditing !== undefined ? externalIsEditing : internalIsEditingMode;
  const setIsEditingMode = setExternalIsEditing || setInternalIsEditingMode;

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const isCreator = user?.id === caseCreatedById;
  const canEditPermission = user && (isCreator || isCoordinator(user));
  
  // Check if editing is allowed based on status
  const canEditByStatus = 
    caseStatus === CaseStatus.DRAFT ||
    caseStatus === CaseStatus.SUBMITTED ||
    caseStatus === CaseStatus.PENDING ||
    caseStatus === CaseStatus.RESUBMITTED;
  
  const canEdit = canEditPermission && canEditByStatus;
  
  // Use ref to track previous initialLinks to avoid infinite loops
  const prevInitialLinksRef = useRef<string>();

  useEffect(() => {
    // Only update if the content actually changed (deep comparison)
    const newLinksStr = JSON.stringify(initialLinks || []);
    if (prevInitialLinksRef.current !== newLinksStr) {
      prevInitialLinksRef.current = newLinksStr;
    setLinks(initialLinks || []);
    }
  }, [initialLinks]);
  
  // Reset editing state when external edit mode is turned off
  useEffect(() => {
    if (externalIsEditing === false && editingIndex !== null) {
      setEditingIndex(null);
      setNewLink({ label: "", url: "" });
      // Only reset links if we're not in the middle of editing
      if (editingIndex === null) {
        setLinks(initialLinks || []);
      }
    }
  }, [externalIsEditing, initialLinks, editingIndex]);

  const handleAddLink = () => {
    if (!newLink.label.trim() || !newLink.url.trim()) {
      alert("Please enter both label and URL");
      return;
    }

    // Validate URL
    try {
      new URL(newLink.url);
    } catch {
      alert("Please enter a valid URL");
      return;
    }

    const updatedLinks = [...links, { ...newLink }];
    setLinks(updatedLinks);
    setNewLink({ label: "", url: "" });
    handleSave(updatedLinks);
  };

  const handleEditLink = (index: number) => {
    if (!isEditingMode) return;
    setEditingIndex(index);
  };

  const handleSaveEdit = (index: number, updatedLink: Link) => {
    if (!updatedLink.label.trim() || !updatedLink.url.trim()) {
      alert("Please enter both label and URL");
      return;
    }

    // Validate URL
    try {
      new URL(updatedLink.url);
    } catch {
      alert("Please enter a valid URL");
      return;
    }

    const updatedLinks = [...links];
    updatedLinks[index] = updatedLink;
    setLinks(updatedLinks);
    setEditingIndex(null);
    handleSave(updatedLinks);
  };

  const handleDeleteLink = (index: number) => {
    if (!confirm("Are you sure you want to delete this link?")) return;

    const updatedLinks = links.filter((_, i) => i !== index);
    setLinks(updatedLinks);
    handleSave(updatedLinks);
  };

  const handleSave = async (linksToSave: Link[]) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          links: linksToSave,
        }),
      });

      if (response.ok) {
        onUpdate?.();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to save links");
        // Revert to previous state on error
        setLinks(initialLinks || []);
      }
    } catch (error) {
      console.error("Error saving links:", error);
      alert("An error occurred. Please try again.");
      // Revert to previous state on error
      setLinks(initialLinks || []);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setLinks(initialLinks || []);
  };

  const handleCancelEditingMode = () => {
    setIsEditingMode(false);
    setEditingIndex(null);
    setNewLink({ label: "", url: "" });
    setLinks(initialLinks || []);
  };

  return (
    <Card>
      <CardHeader className="pt-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Links</CardTitle>
          {/* Only show edit button if using internal edit mode (not controlled externally) */}
          {canEdit && !isEditingMode && externalIsEditing === undefined && (
            <Button variant="outline" size="sm" onClick={() => setIsEditingMode(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-3 space-y-4">
        {canEdit && isEditingMode && (
          <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="link-label">Link Label</Label>
                <Input
                  id="link-label"
                  value={newLink.label}
                  onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
                  placeholder="e.g., DICOM Viewer"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="link-url">URL</Label>
                <Input
                  id="link-url"
                  type="url"
                  value={newLink.url}
                  onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                  placeholder="https://example.com/viewer"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleAddLink}
                disabled={saving || !newLink.label.trim() || !newLink.url.trim()}
                size="sm"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Link
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEditingMode}
                disabled={saving}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {links.length === 0 && !isEditingMode ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No links added yet
          </p>
        ) : (
          <div className="space-y-2">
            {links.map((link, index) => (
              <div
                key={`${link.url}-${index}`}
                className="flex items-center justify-between gap-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                {editingIndex === index ? (
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Label</Label>
                      <Input
                        value={link.label}
                        onChange={(e) => {
                          const updated = [...links];
                          updated[index] = { ...updated[index], label: e.target.value };
                          setLinks(updated);
                        }}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL</Label>
                      <Input
                        type="url"
                        value={link.url}
                        onChange={(e) => {
                          const updated = [...links];
                          updated[index] = { ...updated[index], url: e.target.value };
                          setLinks(updated);
                        }}
                        disabled={saving}
                      />
                    </div>
                    <div className="md:col-span-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(index, link)}
                        disabled={saving}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={saving}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 flex-1 min-w-0 hover:underline"
                      title={link.url}
                    >
                      <ExternalLink className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium flex-shrink-0">{link.label}</span>
                      <span className="text-sm text-muted-foreground truncate min-w-0">
                        ({link.url})
                      </span>
                    </a>
                    {canEdit && isEditingMode && (
                      <div className="flex gap-2 ml-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditLink(index)}
                          disabled={saving || (editingIndex !== null && editingIndex !== index)}
                          title="Edit link"
                          className="h-8 w-8 hover:bg-accent"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteLink(index)}
                          disabled={saving || editingIndex !== null}
                          title="Delete link"
                          className="h-8 w-8 hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

