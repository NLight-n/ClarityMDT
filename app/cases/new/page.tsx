"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, Plus, X, Upload, FileArchive, Trash2, FolderOpen, Folder } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Gender } from "@prisma/client";
import { isConsultant, isCoordinator } from "@/lib/permissions/client";
import Link from "next/link";
import { RichTextEditor } from "@/components/editors/RichTextEditor";
import { parseDicomFiles } from "@/lib/dicom/parser";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Department {
  id: string;
  name: string;
}

export default function NewCasePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = session?.user
    ? {
      id: session.user.id,
      role: session.user.role,
      departmentId: session.user.departmentId,
    }
    : null;

  const canCreateCase = user && (isConsultant(user) || isCoordinator(user));

  const [formData, setFormData] = useState({
    patientName: "",
    mrn: "",
    age: "",
    gender: "" as Gender | "",
    presentingDepartmentId: "",
    clinicalDetails: { type: "doc", content: [] } as any, // JSON field (ProseMirror format)
    diagnosisStage: "",
    treatmentPlan: "",
    question: "",
    concernedDepartmentIds: [] as string[],
    links: [] as Array<{ label: string; url: string }>,
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [pendingDicomFiles, setPendingDicomFiles] = useState<FileList | null>(null);
  const [studyNameInput, setStudyNameInput] = useState("");
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [dicomActionFiles, setDicomActionFiles] = useState<FileList | null>(null);
  const [dicomProgress, setDicomProgress] = useState(0);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!canCreateCase) {
      router.push("/cases");
      return;
    }

    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCreateCase, router]);

  const loadDepartments = async () => {
    try {
      const response = await fetch("/api/departments");
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);

        // If user is a consultant or coordinator with a department, auto-select their department
        if (user?.departmentId) {
          setFormData((prev) => ({
            ...prev,
            presentingDepartmentId: user.departmentId!,
          }));
        }
      }
    } catch (error) {
      console.error("Error loading departments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setAttachments((prev) => [...prev, ...Array.from(files)]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!submitting && !uploadingAttachments) {
      setIsDragging(true);
    }
  }, [submitting, uploadingAttachments]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!submitting && !uploadingAttachments && e.dataTransfer.files) {
      const files = e.dataTransfer.files;
      handleFileSelect(files);
    }
  }, [submitting, uploadingAttachments, handleFileSelect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    if (!formData.diagnosisStage.trim()) {
      setError("Diagnosis Stage is required");
      return;
    }
    if (!formData.question.trim()) {
      setError("Discussion Question is required");
      return;
    }

    setSubmitting(true);

    try {
      // Create the case first
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientName: formData.patientName.trim(),
          mrn: formData.mrn.trim() || undefined,
          age: parseInt(formData.age),
          gender: formData.gender,
          presentingDepartmentId: formData.presentingDepartmentId,
          clinicalDetails: formData.clinicalDetails,
          diagnosisStage: formData.diagnosisStage.trim(),
          treatmentPlan: formData.treatmentPlan.trim() || undefined,
          question: formData.question.trim(),
          concernedDepartmentIds: formData.concernedDepartmentIds.length > 0
            ? formData.concernedDepartmentIds
            : undefined,
          radiologyFindings: { type: "doc", content: [] },
          pathologyFindings: { type: "doc", content: [] },
          links: formData.links.length > 0 ? formData.links : undefined,
        }),
      });

      if (response.ok) {
        const newCase = await response.json();

        // Upload DICOM files if any
        if (pendingDicomFiles && pendingDicomFiles.length > 0) {
          setUploadingAttachments(true);
          try {
            const fileArray = Array.from(pendingDicomFiles).filter(f => !f.name.startsWith("."));
            const fileNames = fileArray.map(f => f.webkitRelativePath || f.name);
            
            const res = await fetch(`/api/dicom/upload-urls/${newCase.id}`, {
              method: "POST",
              body: JSON.stringify({ fileNames }),
              headers: { "Content-Type": "application/json" }
            });
            
            if (!res.ok) throw new Error("Failed to get presigned URLs");
            const { uploadInstructions } = await res.json();
            
            const instructionsMap = new Map();
            uploadInstructions.forEach((inst: any) => {
              instructionsMap.set(inst.fileName, inst);
            });

            setDicomProgress(10);
            const manifest = await parseDicomFiles(fileArray);

            const studyDate = manifest.studies?.[0]?.StudyDate || "UnknownDate";
            const studyName = studyNameInput.trim();
            const mrnStr = formData.mrn ? formData.mrn.slice(-6) : "NoMRN";
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
                    const uploadRes = await fetch(`/api/dicom/upload-proxy?key=${encodeURIComponent(inst.storageKey)}`, {
                      method: "PUT",
                      body: f
                    });
                    if (!uploadRes.ok) throw new Error("S3 Upload failed");
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
            
            const dicomFormData = new FormData();
            dicomFormData.append("file", manifestFile);
            dicomFormData.append("isDicomBundle", "true");
            
            await fetch(`/api/attachments/upload/${newCase.id}`, {
              method: "POST",
              body: dicomFormData,
            });
            
            setDicomProgress(100);
          } catch (error) {
            console.error("Error uploading DICOM files:", error);
          }
        }

        // Upload attachments if any
        if (attachments.length > 0) {
          setUploadingAttachments(true);
          try {
            for (const file of attachments) {
              const formData = new FormData();
              formData.append("file", file);

              const uploadResponse = await fetch(`/api/attachments/upload/${newCase.id}`, {
                method: "POST",
                body: formData,
              });

              if (!uploadResponse.ok) {
                const error = await uploadResponse.json();
                console.error(`Failed to upload ${file.name}:`, error);
                // Continue with other files
              }
            }
          } catch (error) {
            console.error("Error uploading attachments:", error);
            // Continue anyway - user can add attachments later
          } finally {
            setUploadingAttachments(false);
          }
        }

        router.push(`/cases/${newCase.id}`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create case");
        setSubmitting(false);
      }
    } catch (error) {
      console.error("Error creating case:", error);
      setError("An error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (!canCreateCase) {
    return null; // Will redirect
  }

  // Filter departments for consultants/coordinators with departments
  const availableDepartments = user?.departmentId
    ? departments.filter((d) => d.id === user.departmentId)
    : departments;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/cases">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Cases
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create New Case</h1>
          <p className="text-muted-foreground">Fill in the case details below</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Case Information</CardTitle>
            <CardDescription>Enter patient and case details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name *</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) =>
                    setFormData({ ...formData, patientName: e.target.value })
                  }
                  required
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mrn">MRN (Medical Record Number)</Label>
                <Input
                  id="mrn"
                  value={formData.mrn}
                  onChange={(e) =>
                    setFormData({ ...formData, mrn: e.target.value })
                  }
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Age *</Label>
                <Input
                  id="age"
                  type="number"
                  min="0"
                  max="150"
                  value={formData.age}
                  onChange={(e) =>
                    setFormData({ ...formData, age: e.target.value })
                  }
                  required
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value: Gender) =>
                    setFormData({ ...formData, gender: value })
                  }
                  required
                  disabled={submitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Gender.Male}>Male</SelectItem>
                    <SelectItem value={Gender.Female}>Female</SelectItem>
                    <SelectItem value={Gender.Other}>Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="presentingDepartmentId">Presenting Department *</Label>
                <Select
                  value={formData.presentingDepartmentId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, presentingDepartmentId: value })
                  }
                  required
                  disabled={submitting || (user?.departmentId !== null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDepartments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {user?.departmentId && (
                  <p className="text-xs text-muted-foreground">
                    You can only create cases for your department.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicalDetails">Clinical Details *</Label>
              <div className="border rounded-md p-4">
                <RichTextEditor
                  content={formData.clinicalDetails}
                  onChange={(content) =>
                    setFormData({ ...formData, clinicalDetails: content })
                  }
                  editable={true}
                  caseId="" // Empty for new cases - images will be processed after case creation
                  imageType="clinical"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use the editor above to enter clinical details. You can format text and add images.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="diagnosisStage">Diagnosis Stage *</Label>
              <Input
                id="diagnosisStage"
                value={formData.diagnosisStage}
                onChange={(e) =>
                  setFormData({ ...formData, diagnosisStage: e.target.value })
                }
                required
                disabled={submitting}
                placeholder="Enter diagnosis stage..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatmentPlan">Treatment Plan</Label>
              <Textarea
                id="treatmentPlan"
                value={formData.treatmentPlan}
                onChange={(e) =>
                  setFormData({ ...formData, treatmentPlan: e.target.value })
                }
                rows={4}
                disabled={submitting}
                placeholder="Enter treatment plan (optional)..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="question">Discussion Question *</Label>
              <Textarea
                id="question"
                value={formData.question}
                onChange={(e) =>
                  setFormData({ ...formData, question: e.target.value })
                }
                required
                rows={3}
                disabled={submitting}
                placeholder="Enter discussion question for MDT..."
              />
            </div>

            <div className="space-y-2">
              <Label>Concerned Departments</Label>
              <div className="rounded-md border p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {departments.map((department) => {
                  const isChecked = formData.concernedDepartmentIds.includes(department.id);
                  return (
                    <label key={department.id} className="flex items-center gap-2 text-sm cursor-pointer min-h-8">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData((prev) => ({
                            ...prev,
                            concernedDepartmentIds: checked
                              ? Array.from(new Set([...prev.concernedDepartmentIds, department.id]))
                              : prev.concernedDepartmentIds.filter((id) => id !== department.id),
                          }));
                        }}
                        disabled={submitting}
                      />
                      <span>{department.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Select departments from which expert opinions are needed (optional).
              </p>
            </div>

            {/* DICOM & Links Section */}
            <div className="space-y-2">
              <Label>DICOM &amp; Links</Label>
              <div className="border rounded-lg p-4 space-y-4">
                {/* DICOM Files Sub-section */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" />
                    DICOM Folder
                  </Label>
                  
                  {pendingDicomFiles && pendingDicomFiles.length > 0 && (
                    <div className="flex items-center gap-2 p-2 border rounded bg-muted/50">
                      <Folder className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {studyNameInput} ({pendingDicomFiles.length} files)
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPendingDicomFiles(null);
                          setStudyNameInput("");
                        }}
                        disabled={submitting || uploadingAttachments}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                  
                  {!pendingDicomFiles && (
                    <>
                      <input
                        type="file"
                        id="dicom-folder-upload"
                        {...({ webkitdirectory: "true", directory: "true" } as any)}
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setDicomActionFiles(e.target.files);
                            setStudyNameInput("");
                            setPromptModalOpen(true);
                          }
                          e.target.value = ""; // Reset input
                        }}
                        className="hidden"
                        disabled={submitting || uploadingAttachments}
                      />
                      <label htmlFor="dicom-folder-upload" className="cursor-pointer block">
                        <div className="border-2 border-dashed rounded-lg p-4 text-center transition-colors border-muted-foreground/25 hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/20">
                          <FolderOpen className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                          <p className="text-sm font-medium">Click to select DICOM folder</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Select a folder containing extracted DICOM files (.dcm)
                          </p>
                        </div>
                      </label>
                    </>
                  )}
                  {dicomProgress > 0 && dicomProgress < 100 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span>Uploading DICOM</span>
                        <span>{dicomProgress}%</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-300 ease-in-out" 
                          style={{ width: `${dicomProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t" />

                {/* Links Sub-section */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Links</Label>
                  {formData.links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 border rounded bg-muted/50">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{link.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updatedLinks = formData.links.filter((_, i) => i !== index);
                          setFormData({ ...formData, links: updatedLinks });
                        }}
                        disabled={submitting}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      id="link-label"
                      placeholder="Link label (e.g., DICOM Viewer)"
                      disabled={submitting}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const labelInput = e.currentTarget;
                          const urlInput = document.getElementById("link-url") as HTMLInputElement;
                          if (labelInput.value.trim() && urlInput?.value.trim()) {
                            try {
                              new URL(urlInput.value);
                              setFormData({
                                ...formData,
                                links: [
                                  ...formData.links,
                                  { label: labelInput.value.trim(), url: urlInput.value.trim() },
                                ],
                              });
                              labelInput.value = "";
                              urlInput.value = "";
                            } catch {
                              alert("Please enter a valid URL");
                            }
                          }
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        id="link-url"
                        type="url"
                        placeholder="https://example.com/viewer"
                        disabled={submitting}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const urlInput = e.currentTarget;
                            const labelInput = document.getElementById("link-label") as HTMLInputElement;
                            if (labelInput?.value.trim() && urlInput.value.trim()) {
                              try {
                                new URL(urlInput.value);
                                setFormData({
                                  ...formData,
                                  links: [
                                    ...formData.links,
                                    { label: labelInput.value.trim(), url: urlInput.value.trim() },
                                  ],
                                });
                                labelInput.value = "";
                                urlInput.value = "";
                              } catch {
                                alert("Please enter a valid URL");
                              }
                            }
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const labelInput = document.getElementById("link-label") as HTMLInputElement;
                          const urlInput = document.getElementById("link-url") as HTMLInputElement;
                          if (labelInput?.value.trim() && urlInput?.value.trim()) {
                            try {
                              new URL(urlInput.value);
                              setFormData({
                                ...formData,
                                links: [
                                  ...formData.links,
                                  { label: labelInput.value.trim(), url: urlInput.value.trim() },
                                ],
                              });
                              labelInput.value = "";
                              urlInput.value = "";
                            } catch {
                              alert("Please enter a valid URL");
                            }
                          }
                        }}
                        disabled={submitting}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add links to external resources (optional)
                  </p>
                </div>
              </div>
            </div>

            {/* Attachments Section */}
            <div className="space-y-2">
              <Label>Attachments</Label>
              <div className="border rounded-lg p-4 space-y-3">
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded bg-muted/50">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAttachments(attachments.filter((_, i) => i !== index));
                          }}
                          disabled={submitting || uploadingAttachments}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  id="file-upload"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                  disabled={submitting || uploadingAttachments}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/50"
                      }`}
                  >
                    <Upload className="h-6 w-6 mx-auto mb-2" />
                    <p className="text-sm font-medium">
                      {uploadingAttachments ? "Uploading..." : "Click to upload or drag and drop"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Images, PDF, Word, Excel, PowerPoint (max 10MB)
                    </p>
                  </div>
                </label>
                <p className="text-xs text-muted-foreground">
                  Attachments will be uploaded after case creation (optional)
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/cases")}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || uploadingAttachments || dicomProgress > 0}>
                {submitting || uploadingAttachments || dicomProgress > 0 ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {uploadingAttachments || dicomProgress > 0 ? "Uploading attachments..." : "Creating..."}
                  </>
                ) : (
                  "Create Case"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Study Name Prompt Dialog */}
      <Dialog 
        open={promptModalOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setPromptModalOpen(false);
            setDicomActionFiles(null);
            setStudyNameInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Study Information</DialogTitle>
            <DialogDescription>
              Please provide a short, descriptive name for the DICOM study you are uploading.
              This will help identify the study later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="studyName">Study Name</Label>
              <Input
                id="studyName"
                placeholder="e.g. CECT Abdomen, MR Brain, etc."
                value={studyNameInput}
                onChange={(e) => setStudyNameInput(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setPromptModalOpen(false);
                setDicomActionFiles(null);
                setStudyNameInput("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (!studyNameInput.trim()) {
                  alert("Please enter a study name.");
                  return;
                }
                setPendingDicomFiles(dicomActionFiles);
                setPromptModalOpen(false);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
