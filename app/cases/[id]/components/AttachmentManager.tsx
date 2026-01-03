"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, X, File, FileText, Image, Loader2, Trash2, RotateCcw, Eye, Download } from "lucide-react";
import { FileIcon, defaultStyles } from "react-file-icon";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import { CaseStatus } from "@prisma/client";
import { format } from "date-fns";
import { useAlertContext } from "@/contexts/AlertContext";

// File validation constants (matching API route)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  // PDF
  "application/pdf",
  // Word documents
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  // Excel documents
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  // PowerPoint documents
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
];

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageKey: string;
  createdAt: string;
}

interface AttachmentManagerProps {
  caseId: string;
  caseStatus: CaseStatus;
  caseCreatedById: string;
  initialAttachments?: Attachment[];
  onUpdate?: () => void;
  isEditing?: boolean;
  setIsEditing?: (editing: boolean) => void;
  onStagedFilesChange?: (files: File[], filesToDelete: string[]) => void;
}

export function AttachmentManager({
  caseId,
  caseStatus,
  caseCreatedById,
  initialAttachments = [],
  onUpdate,
  isEditing: externalIsEditing,
  setIsEditing: setExternalIsEditing,
  onStagedFilesChange,
}: AttachmentManagerProps) {
  const { data: session } = useSession();
  const { alert } = useAlertContext();
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);

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
  
  // Use external edit mode if provided, otherwise attachments are always editable when canEdit is true
  const isEditing = externalIsEditing !== undefined ? externalIsEditing : canEdit;
  
  // Notify parent of staged files changes (only when they actually change)
  const prevStagedFilesRef = useRef<string>();
  const prevFilesToDeleteRef = useRef<string>();
  
  useEffect(() => {
    const stagedFilesStr = JSON.stringify(stagedFiles.map(f => ({ name: f.name, size: f.size })));
    const filesToDeleteStr = JSON.stringify(filesToDelete);
    
    if (prevStagedFilesRef.current !== stagedFilesStr || prevFilesToDeleteRef.current !== filesToDeleteStr) {
      prevStagedFilesRef.current = stagedFilesStr;
      prevFilesToDeleteRef.current = filesToDeleteStr;
      onStagedFilesChange?.(stagedFiles, filesToDelete);
        }
  }, [stagedFiles, filesToDelete]); // Removed onStagedFilesChange from dependencies

  // Use ref to track previous initialAttachments to avoid infinite loops
  const prevInitialAttachmentsRef = useRef<string>();

  // Load attachments when initialAttachments change
  useEffect(() => {
    const initialAttachmentsStr = JSON.stringify(initialAttachments);
    if (prevInitialAttachmentsRef.current !== initialAttachmentsStr) {
      prevInitialAttachmentsRef.current = initialAttachmentsStr;
    setAttachments(initialAttachments);
    }
  }, [initialAttachments]);

  const validateFile = (file: File): string | null => {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const maxSizeMB = MAX_FILE_SIZE / 1024 / 1024;
      return `File "${file.name}" exceeds maximum allowed size of ${maxSizeMB}MB`;
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      const allowedTypes = [
        "Images (JPEG, PNG, GIF)",
        "PDF",
        "Word documents (.doc, .docx)",
        "Excel documents (.xls, .xlsx)",
        "PowerPoint documents (.ppt, .pptx)",
      ].join(", ");
      return `File type not supported for "${file.name}". Allowed types: ${allowedTypes}`;
    }

    return null; // File is valid
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    // Validate each file
    Array.from(files).forEach((file) => {
      const error = validateFile(file);
      if (error) {
        errors.push(error);
      } else {
        validFiles.push(file);
      }
    });

    // Show errors if any
    if (errors.length > 0) {
      // Show all errors in a single alert
      await alert({
        type: "error",
        title: "File Upload Error",
        message: errors.join("\n\n"),
      });
    }

    // Only add valid files to staged files
    if (validFiles.length > 0) {
      setStagedFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const handleDelete = (attachmentId: string) => {
    // Mark for deletion instead of deleting immediately
    setFilesToDelete((prev) => [...prev, attachmentId]);
        setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  const handleRemoveStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUndoDelete = (attachmentId: string) => {
    setFilesToDelete((prev) => prev.filter((id) => id !== attachmentId));
    // Restore attachment from initialAttachments
    const attachment = initialAttachments.find((a) => a.id === attachmentId);
    if (attachment) {
      setAttachments((prev) => [...prev, attachment]);
      }
  };

  // Reset staged changes when edit mode is cancelled
  const prevIsEditingRef = useRef<boolean | null | undefined>();
  useEffect(() => {
    // Only reset when transitioning from editing to not editing
    if (prevIsEditingRef.current === true && !isEditing && externalIsEditing !== undefined) {
      setStagedFiles([]);
      setFilesToDelete([]);
      setAttachments(initialAttachments);
      onStagedFilesChange?.([], []);
    }
    prevIsEditingRef.current = isEditing;
  }, [isEditing, externalIsEditing]); // Removed initialAttachments and onStagedFilesChange from dependencies

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isEditing) {
      setIsDragging(true);
    }
  }, [isEditing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isEditing && e.dataTransfer.files) {
      const files = e.dataTransfer.files;
      handleFileSelect(files);
    }
  }, [isEditing]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (fileName: string, fileType: string) => {
    // Extract file extension
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Handle image files with Image icon from lucide
    if (fileType.startsWith("image/")) {
      return <Image className="h-12 w-12 text-blue-500" aria-label="Image file" />;
    }
    
    // Use react-file-icon for other file types
    const fileIconProps = extension && defaultStyles[extension as keyof typeof defaultStyles]
      ? { ...defaultStyles[extension as keyof typeof defaultStyles] }
      : {};
    
    return (
      <div className="w-12 h-12 flex items-center justify-center">
        <FileIcon
          extension={extension || undefined}
          {...fileIconProps}
          labelColor="#ffffff"
          labelUppercase={false}
        />
      </div>
    );
  };

  const handleDownload = (attachment: Attachment) => {
    window.open(`/api/attachments/file/${attachment.id}`, "_blank");
  };

  const handleView = async (attachment: Attachment) => {
    try {
      // Get presigned URL for viewing
      const response = await fetch(`/api/attachments/view/${attachment.id}`);
      if (!response.ok) {
        throw new Error("Failed to get view URL");
      }
      const data = await response.json();
      const { url, fileType, needsConversion } = data;

      // Check file type to determine how to open it
      const isImage = fileType.startsWith("image/");
      const isPdf = fileType === "application/pdf";
      const isWord = fileType === "application/msword" || 
                     fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const isExcel = fileType === "application/vnd.ms-excel" || 
                      fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const isPowerPoint = fileType === "application/vnd.ms-powerpoint" || 
                           fileType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";

      if (isImage || isPdf) {
        // Open images and PDFs directly in browser
        window.open(url, "_blank");
      } else if (isWord || isExcel || isPowerPoint) {
        // For Office files, convert to PDF first
        if (needsConversion) {
          // Set loading state
          setLoadingAttachmentId(attachment.id);
          try {
            const conversionResponse = await fetch(url);
            if (!conversionResponse.ok) {
              const errorData = await conversionResponse.json();
              throw new Error(errorData.error || "Failed to convert file to PDF");
            }
            const conversionData = await conversionResponse.json();
            // Open the converted PDF in new tab
            window.open(conversionData.url, "_blank");
          } catch (conversionError: any) {
            console.error("Error converting file to PDF:", conversionError);
            await alert({
              type: "error",
              title: "Conversion Error",
              message: conversionError.message || "Failed to convert file to PDF. Please try downloading the file instead.",
            });
          } finally {
            // Clear loading state
            setLoadingAttachmentId(null);
          }
        } else {
          // Direct URL (shouldn't happen for Office files, but fallback)
          window.open(url, "_blank");
        }
      } else {
        // Fallback to direct download for other file types
        window.open(url, "_blank");
      }
    } catch (error) {
      console.error("Error viewing attachment:", error);
      setLoadingAttachmentId(null); // Clear loading state on error
      await alert({
        type: "error",
        title: "Error",
        message: "Failed to open attachment. Please try downloading it instead.",
      });
    }
  };


  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="pt-3 pb-2">
          <CardTitle>Attachments</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-3 space-y-4">
        {isEditing && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/50"
            }`}
          >
            <input
              type="file"
              id="file-upload"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
              disabled={!isEditing}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8" />
                <div>
                  <span className="text-sm font-medium">
                    Click to upload or drag and drop
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Images, PDF, Word, Excel, PowerPoint (max 10MB)
                  </p>
                </div>
              </div>
            </label>
          </div>
        )}

        {/* Staged files (to be uploaded) */}
        {stagedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">New files (will be uploaded on save):</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {stagedFiles.map((file, index) => (
                <div
                  key={`staged-${index}`}
                  className="relative group border rounded-lg p-4 bg-blue-50 border-blue-200"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center justify-center w-16 h-16">
                      {getFileIcon(file.name, file.type)}
                    </div>
                    <div className="w-full text-center">
                      <p className="text-xs font-medium truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  {isEditing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveStagedFile(index);
                      }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                    >
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Existing attachments */}
        {attachments.length === 0 && stagedFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No attachments yet
          </p>
        ) : (
          attachments.length > 0 && (
          <div className="space-y-2">
              {stagedFiles.length > 0 && <p className="text-xs font-medium text-muted-foreground">Existing attachments:</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {attachments.map((attachment) => {
                  const isMarkedForDelete = filesToDelete.includes(attachment.id);
                  return (
              <div
                key={attachment.id}
                      className={`relative group border rounded-lg p-4 transition-colors ${
                        isMarkedForDelete 
                          ? "bg-red-50 border-red-200 opacity-60" 
                          : "hover:bg-accent/50"
                      }`}
              >
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center justify-center w-16 h-16">
                          {getFileIcon(attachment.fileName, attachment.fileType)}
                        </div>
                        <div className="w-full text-center">
                          <p className="text-xs font-medium truncate" title={attachment.fileName}>
                      {attachment.fileName}
                    </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatFileSize(attachment.fileSize)}
                    </p>
                  </div>
                  {!isMarkedForDelete && (
                    <div className="flex items-center justify-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleView(attachment);
                            }}
                            className="h-7 w-7"
                            disabled={loadingAttachmentId === attachment.id}
                          >
                            {loadingAttachmentId === attachment.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{loadingAttachmentId === attachment.id ? "Converting..." : "View"}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(attachment);
                            }}
                            className="h-7 w-7"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Download</p>
                        </TooltipContent>
                      </Tooltip>
                      {isEditing && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(attachment.id);
                              }}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
                      {isEditing && isMarkedForDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUndoDelete(attachment.id);
                          }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                        >
                          <RotateCcw className="h-3 w-3 text-green-600" />
                  </Button>
                )}
                    </div>
                  );
                })}
              </div>
          </div>
          )
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}

