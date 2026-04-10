"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink, Plus, Edit, Trash2, Save, X, Loader2, Upload, Download, FileArchive, FolderOpen, Folder, Eye } from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import { CaseStatus } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseDicomFiles } from "@/lib/dicom/parser";
import { useAlertContext } from "@/contexts/AlertContext";

interface Link {
  label: string;
  url: string;
}

interface DicomFile {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
}

interface LinksEditorProps {
  caseId: string;
  caseStatus: CaseStatus;
  caseCreatedById: string;
  initialLinks?: Link[] | null;
  initialDicomFiles?: DicomFile[] | null;
  dicomBundles?: any[];
  patientMrn?: string | null;
  onUpdate?: () => void;
  isEditing?: boolean;
  setIsEditing?: (editing: boolean) => void;
}

export function LinksEditor({
  caseId,
  caseStatus,
  caseCreatedById,
  initialLinks = [],
  initialDicomFiles = [],
  dicomBundles = [],
  patientMrn,
  onUpdate,
  isEditing: externalIsEditing,
  setIsEditing: setExternalIsEditing,
}: LinksEditorProps) {
  const { data: session } = useSession();
  const { alert: customAlert } = useAlertContext();
  const [links, setLinks] = useState<Link[]>(initialLinks || []);
  const [dicomFiles, setDicomFiles] = useState<DicomFile[]>(initialDicomFiles || []);
  const [bundles, setBundles] = useState<any[]>(dicomBundles || []);
  const [internalIsEditingMode, setInternalIsEditingMode] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const [saving, setSaving] = useState(false);
  const [uploadingDicom, setUploadingDicom] = useState(false);
  const [dicomProgress, setDicomProgress] = useState(0);
  const [downloadingDicomId, setDownloadingDicomId] = useState<string | null>(null);
  const [canEditPermission, setCanEditPermission] = useState(false);
  const userId = session?.user?.id;
  const userRole = session?.user?.role;
  const userDepartmentId = session?.user?.departmentId ?? null;

  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [studyNameInput, setStudyNameInput] = useState("");
  const [pendingDicomFiles, setPendingDicomFiles] = useState<FileList | null>(null);

  // Use external edit mode if provided, otherwise use internal
  const isEditingMode = externalIsEditing !== undefined ? externalIsEditing : internalIsEditingMode;
  const setIsEditingMode = setExternalIsEditing || setInternalIsEditingMode;

  const user = userId && userRole
    ? {
      id: userId,
      role: userRole,
      departmentId: userDepartmentId,
    }
    : null;

  const isCreator = user?.id === caseCreatedById;

  useEffect(() => {
    const checkEditPermission = async () => {
      if (!user) {
        setCanEditPermission(false);
        return;
      }

      if (isCoordinator(user) || isCreator) {
        setCanEditPermission(true);
        return;
      }

      try {
        const response = await fetch(`/api/cases/${caseId}/permissions?type=edit`);
        if (response.ok) {
          const data = await response.json();
          setCanEditPermission(!!data.canEdit);
        } else {
          setCanEditPermission(false);
        }
      } catch (error) {
        console.error("Error checking links/dicom edit permissions:", error);
        setCanEditPermission(false);
      }
    };

    checkEditPermission();
  }, [caseId, isCreator, userId, userRole, userDepartmentId]);

  // Check if editing is allowed based on status
  const canEditByStatus =
    caseStatus === CaseStatus.DRAFT ||
    caseStatus === CaseStatus.SUBMITTED ||
    caseStatus === CaseStatus.PENDING ||
    caseStatus === CaseStatus.RESUBMITTED;

  const canEdit = !!canEditPermission && canEditByStatus;

  // Use ref to track previous initialLinks to avoid infinite loops
  const prevInitialLinksRef = useRef<string>();
  const prevInitialDicomRef = useRef<string>();

  useEffect(() => {
    // Only update if the content actually changed (deep comparison)
    const newLinksStr = JSON.stringify(initialLinks || []);
    if (prevInitialLinksRef.current !== newLinksStr) {
      prevInitialLinksRef.current = newLinksStr;
      setLinks(initialLinks || []);
    }
  }, [initialLinks]);

  useEffect(() => {
    const newDicomStr = JSON.stringify(initialDicomFiles || []);
    if (prevInitialDicomRef.current !== newDicomStr) {
      prevInitialDicomRef.current = newDicomStr;
      setDicomFiles(initialDicomFiles || []);
    }
  }, [initialDicomFiles]);

  useEffect(() => {
    setBundles(dicomBundles || []);
  }, [dicomBundles]);

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

  // --- DICOM file handling ---

  const handleDicomFolderSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingDicomFiles(files);
    setStudyNameInput("");
    setPromptModalOpen(true);
  };

  const handlePromptSubmit = async () => {
    if (!studyNameInput.trim()) {
      await customAlert({ type: "error", title: "Missing Information", message: "Study name is required." });
      return;
    }

    setPromptModalOpen(false);
    const files = pendingDicomFiles;
    if (!files || files.length === 0) return;

    setUploadingDicom(true);
    setDicomProgress(0);

    try {
      const fileArray = Array.from(files).filter(f => !f.name.startsWith("."));
      
      const fileNames = fileArray.map(f => f.webkitRelativePath || f.name);
      
      const res = await fetch(`/api/dicom/upload-urls/${caseId}`, {
        method: "POST",
        body: JSON.stringify({ fileNames }),
        headers: { "Content-Type": "application/json" }
      });
      
      if (!res.ok) throw new Error("Failed to get presigned URLs");
      const { uploadInstructions, timestamp: batchTimestamp } = await res.json();

      
      const instructionsMap = new Map();
      uploadInstructions.forEach((inst: any) => {
        instructionsMap.set(inst.fileName, inst);
      });

      setDicomProgress(10);
      const manifest = await parseDicomFiles(fileArray);

      const studyDate = manifest.studies?.[0]?.StudyDate || "UnknownDate";
      const studyName = studyNameInput.trim();
      const mrnStr = patientMrn ? patientMrn.slice(-6) : "NoMRN";
      const folderName = `${studyDate}-${studyName}-${mrnStr}`;

      for (const study of manifest.studies) {
        for (const series of study.series) {
          for (const instance of series.instances) {
            const originalPath = instance.url.replace("dicomweb:blob://", "").replace("wadouri:blob://", "").replace("blob://", "");
            let inst = instructionsMap.get(originalPath);
            if (!inst) {
               inst = Array.from(instructionsMap.values()).find((req: any) => 
                 req.fileName === originalPath || req.fileName.endsWith(`/${originalPath}`)
               );
            }

            if (inst) {
              instance.url = inst.storageKey; 
            } else {
              console.warn("Could not find upload instruction for:", originalPath);
            }
            delete instance.file; 
          }
        }
      }
      
      setDicomProgress(20);

      const CHUNK_SIZE = 50;
      for (let i = 0; i < fileArray.length; i += CHUNK_SIZE) {
        const chunk = fileArray.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (f) => {
          const path = f.webkitRelativePath || f.name;
          const inst = instructionsMap.get(path);
          if (inst?.presignedUrl) {
            try {
              const res = await fetch(inst.presignedUrl, {
                method: "PUT",
                body: f
              });
              if (!res.ok) {
                console.error("Failed to upload chunk", res.statusText);
                throw new Error("S3 Upload failed");
              }
            } catch (err) {
              throw err;
            }
          }
        }));
        
        setDicomProgress(20 + Math.round((i / fileArray.length) * 70));
      }

      setDicomProgress(95);

      const manifestStr = JSON.stringify(manifest);
      const manifestBlob = new Blob([manifestStr], { type: "application/json" });
      const manifestFile = new File([manifestBlob], `${folderName}_manifest.json`, { type: "application/json" });
      
      const formData = new FormData();
      formData.append("file", manifestFile);
      formData.append("isDicomBundle", "true");
      if (batchTimestamp) {
        formData.append("timestamp", batchTimestamp.toString());
      }
      
      const uploadRes = await fetch(`/api/attachments/upload/${caseId}`, {
        method: "POST",
        body: formData,
      });
      
      if (!uploadRes.ok) throw new Error("Failed to upload DICOM manifest");
      
      setDicomProgress(100);
      
      await customAlert({
        type: "success",
        title: "DICOM Upload Complete",
        message: `Successfully processed and uploaded DICOM folder as ${folderName}.`,
      });
      
      onUpdate?.();

    } catch (e: any) {
      console.error(e);
      await customAlert({
        type: "error",
        title: "DICOM Upload Failed",
        message: e.message || "An unexpected error occurred during DICOM upload.",
      });
    } finally {
      setUploadingDicom(false);
      setDicomProgress(0);
      setPendingDicomFiles(null);
    }
  };

  const handleDicomDownload = async (dicom: DicomFile) => {
    setDownloadingDicomId(dicom.id);
    try {
      const response = await fetch(`/api/dicom/download/${dicom.id}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = dicom.fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Prompt user to open with RadiantViewer
        setTimeout(() => {
          alert(`"${dicom.fileName}" has been downloaded.\n\nTo view the DICOM images, please open the downloaded ZIP file using RadiantViewer or your preferred DICOM viewer application.`);
        }, 500);
      } else {
        const error = await response.json();
        alert(error.error || "Failed to download DICOM file");
      }
    } catch (error) {
      console.error("Error downloading DICOM file:", error);
      alert("An error occurred while downloading the DICOM file.");
    } finally {
      setDownloadingDicomId(null);
    }
  };

  const handleDicomDelete = async (dicom: DicomFile) => {
    if (!confirm(`Are you sure you want to delete the DICOM file "${dicom.fileName}"?`)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/dicom/${dicom.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onUpdate?.();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete DICOM file");
      }
    } catch (error) {
      console.error("Error deleting DICOM file:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDicomBundleDelete = async (attachmentId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete the DICOM folder "${fileName}"?`)) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/attachments/${attachmentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onUpdate?.();
      } else {
        const error = await response.json();
        await customAlert({ type: "error", title: "Error", message: error.error || "Failed to delete DICOM file" });
      }
    } catch (error) {
      console.error("Error deleting DICOM folder:", error);
      await customAlert({ type: "error", title: "Error", message: "An error occurred. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader className="pt-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>DICOM &amp; Links</CardTitle>
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

        {/* === DICOM Files Section === */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <FileArchive className="h-4 w-4" />
            DICOM Files
          </Label>

          {/* Legacy DICOM files list (ZIPs) */}
          {dicomFiles.length > 0 && (
            <div className="space-y-2">
              {dicomFiles.map((dicom) => (
                <div
                  key={dicom.id}
                  className="flex items-center justify-between gap-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:underline"
                    onClick={() => handleDicomDownload(dicom)}
                    title={`Click to download ${dicom.fileName} and open with RadiantViewer`}
                  >
                    <FileArchive className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{dicom.fileName}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatFileSize(dicom.fileSize)})
                      </span>
                    </div>
                    {downloadingDicomId === dicom.id ? (
                      <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                    ) : (
                      <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                  {canEdit && isEditingMode && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDicomDelete(dicom)}
                      disabled={saving}
                      title="Delete DICOM file"
                      className="h-8 w-8 hover:bg-destructive/10 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New DICOM bundles list (Folders) */}
          {bundles.length > 0 && (
            <div className="space-y-2 mt-2">
              {bundles.map((bundle) => (
                <div
                  key={bundle.id}
                  className="flex items-center justify-between gap-2 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                  >
                    <Folder className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{bundle.fileName.replace("_manifest.json", "")}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatFileSize(bundle.realSize || bundle.fileSize)})
                      </span>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/ohif-viewer/viewer?url=/api/dicom-manifest/${bundle.id}`, "_blank");
                      }}
                      className="bg-blue-600 hover:bg-blue-700 ml-2 h-8 text-xs font-medium"
                    >
                      <Eye className="h-4 w-4 mr-1.5" /> Open in OHIF
                    </Button>
                  </div>
                  {canEdit && isEditingMode && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDicomBundleDelete(bundle.id, bundle.fileName)}
                      disabled={saving}
                      title="Delete DICOM folder"
                      className="h-8 w-8 hover:bg-destructive/10 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {dicomFiles.length === 0 && bundles.length === 0 && !isEditingMode && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No DICOM files attached
            </p>
          )}

          {/* DICOM Upload Area */}
          {canEdit && isEditingMode && (
            <div className="space-y-2">
              <div className="border border-dashed border-blue-300 bg-blue-50/50 rounded-lg p-4 text-center transition-colors">
                <input
                  type="file"
                  id="dicom-folder-upload"
                  //@ts-ignore
                  webkitdirectory=""
                  directory=""
                  onChange={(e) => handleDicomFolderSelect(e.target.files)}
                  className="hidden"
                  disabled={uploadingDicom || saving}
                />
                <label htmlFor="dicom-folder-upload" className="cursor-pointer block w-full h-full">
                  {uploadingDicom ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-2">
                      <span className="text-sm font-medium text-blue-700">Uploading and Processing... {dicomProgress}%</span>
                      <div className="w-full bg-blue-200 rounded-full h-2.5 max-w-[250px]">
                        <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${dicomProgress}%` }}></div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Folder className="h-6 w-6 text-blue-600" />
                      <div>
                        <span className="text-sm font-medium text-blue-700">
                          Upload DICOM Folder
                        </span>
                        <p className="text-xs text-blue-600/70 mt-1">
                          Select a folder containing DICOM images to view instantly in browser
                        </p>
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Separator between DICOM and Links */}
        {(dicomFiles.length > 0 || links.length > 0 || isEditingMode) && (
          <div className="border-t" />
        )}

        {/* === Links Section === */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Links
          </Label>

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
                {externalIsEditing === undefined && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEditingMode}
                    disabled={saving}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}

          {links.length === 0 && !isEditingMode ? (
            <p className="text-sm text-muted-foreground text-center py-2">
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
        </div>
      </CardContent>
      <Dialog open={promptModalOpen} onOpenChange={setPromptModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Study Name</DialogTitle>
            <DialogDescription>
              Please enter the clinical study you are uploading (e.g., CECTAbdomen, MRISpine). 
              The folder will be formatted with the DICOM Study Date and the patient's MRN automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="studyName">Study Name</Label>
            <Input 
              id="studyName" 
              placeholder="e.g., CECTAbdomen" 
              value={studyNameInput} 
              onChange={(e) => setStudyNameInput(e.target.value)}
              onKeyDown={(e) => {
                if(e.key === "Enter") handlePromptSubmit();
              }}
              autoFocus
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptModalOpen(false)}>Cancel</Button>
            <Button onClick={handlePromptSubmit}>Confirm Upload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
