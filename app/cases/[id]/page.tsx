"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Suspense } from "react";
import { CaseDetails } from "./components/CaseDetails";
import { ClinicalDetailsEditor } from "./components/ClinicalDetailsEditor";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { RadiologyEditor } from "./components/RadiologyEditor";
import { PathologyEditor } from "./components/PathologyEditor";
import { SpecialistOpinions } from "./components/SpecialistOpinions";
import { ConsensusEditor } from "./components/ConsensusEditor";
import { CaseHistory } from "./components/CaseHistory";
import { AttachmentManager } from "./components/AttachmentManager";
import { LinksEditor } from "./components/LinksEditor";
import { FollowUpEditor } from "./components/FollowUpEditor";

function CaseDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const caseId = params.id as string;
  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [clinicalDetailsContent, setClinicalDetailsContent] = useState<any>(null);
  const [radiologyContent, setRadiologyContent] = useState<any>(null);
  const [pathologyContent, setPathologyContent] = useState<any>(null);
  const clinicalContentGetter = useRef<(() => any) | null>(null);
  const radiologyContentGetter = useRef<(() => any) | null>(null);
  const pathologyContentGetter = useRef<(() => any) | null>(null);
  const [stagedAttachments, setStagedAttachments] = useState<File[]>([]);
  const [attachmentsToDelete, setAttachmentsToDelete] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [caseFormData, setCaseFormData] = useState<{
    patientName: string;
    mrn: string | null;
    age: number;
    gender: any;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
    concernedDepartmentIds: string[];
  } | null>(null);
  const patientInfoFormDataGetter = useRef<(() => {
    patientName: string;
    mrn: string | null;
    age: number;
    gender: any;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
    concernedDepartmentIds: string[];
  }) | null>(null);
  const diagnosisFormDataGetter = useRef<(() => {
    patientName: string;
    mrn: string | null;
    age: number;
    gender: any;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
    concernedDepartmentIds: string[];
  }) | null>(null);

  // Get the referrer from query params
  const from = searchParams.get("from") || "cases";

  const loadCase = async () => {
    try {
      // Add cache-busting to ensure fresh data
      const response = await fetch(`/api/cases/${caseId}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        setCaseData(data);
      } else if (response.status === 404) {
        router.push("/cases");
      } else {
        const error = await response.json();
        alert(error.error || "Failed to load case");
      }
    } catch (error) {
      console.error("Error loading case:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) {
      loadCase();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // Initialize content states when case data loads
  useEffect(() => {
    if (caseData?.clinicalDetails) {
      setClinicalDetailsContent(caseData.clinicalDetails);
    }
    if (caseData?.radiologyFindings) {
      setRadiologyContent(caseData.radiologyFindings);
    }
    if (caseData?.pathologyFindings) {
      setPathologyContent(caseData.pathologyFindings);
    }
  }, [caseData?.clinicalDetails, caseData?.radiologyFindings, caseData?.pathologyFindings]);

  // Initialize case form data when case data loads
  useEffect(() => {
    if (caseData) {
      setCaseFormData({
        patientName: caseData.patientName,
        mrn: caseData.mrn,
        age: caseData.age,
        gender: caseData.gender,
        diagnosisStage: caseData.diagnosisStage,
        treatmentPlan: caseData.treatmentPlan,
        question: caseData.question,
        concernedDepartmentIds: Array.isArray(caseData.concernedDepartmentIds)
          ? caseData.concernedDepartmentIds
          : [],
      });
    }
  }, [caseData]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Case not found</p>
      </div>
    );
  }

  // Determine back button text and URL based on referrer
  const getBackButtonConfig = () => {
    if (from === "register") {
      // If coming from register, get the meetingId if available, otherwise go to register
      const meetingId = searchParams.get("meetingId");
      const backUrl = meetingId ? `/register?meetingId=${meetingId}` : "/register";
      return { text: "Back to Register", url: backUrl };
    }
    return { text: "Back to Cases List", url: "/cases" };
  };

  const backButtonConfig = getBackButtonConfig();

  const handleUnifiedSave = async (formDataFromComponent?: {
    patientName: string;
    mrn: string | null;
    age: number;
    gender: any;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
    concernedDepartmentIds: string[];
  }) => {
    // Get latest formData from all instances immediately (no debounce delay)
    let dataToSave: {
      patientName: string;
      mrn: string | null;
      age: number;
      gender: any;
      diagnosisStage: string;
      treatmentPlan: string;
      question: string;
      concernedDepartmentIds: string[];
    } | null = null;

    // Start with caseFormData from state
    if (caseFormData) {
      dataToSave = { ...caseFormData };
    }

    // Override with formData from component if provided
    if (formDataFromComponent) {
      dataToSave = dataToSave
        ? { ...dataToSave, ...formDataFromComponent }
        : formDataFromComponent;
    }

    // Get latest formData directly from instances (bypassing debounce)
    // Patient Information instance (has patientName, mrn, age, gender)
    if (patientInfoFormDataGetter.current) {
      const patientData = patientInfoFormDataGetter.current();
      dataToSave = dataToSave
        ? {
          ...dataToSave,
          patientName: patientData.patientName,
          mrn: patientData.mrn,
          age: patientData.age,
          gender: patientData.gender,
        }
        : {
          patientName: patientData.patientName,
          mrn: patientData.mrn,
          age: patientData.age,
          gender: patientData.gender,
          diagnosisStage: patientData.diagnosisStage,
          treatmentPlan: patientData.treatmentPlan,
          question: patientData.question,
          concernedDepartmentIds: patientData.concernedDepartmentIds,
        };
    }

    // Diagnosis/Treatment/Question instance (has diagnosisStage, treatmentPlan, question)
    if (diagnosisFormDataGetter.current) {
      const diagnosisData = diagnosisFormDataGetter.current();
      if (dataToSave) {
        dataToSave.diagnosisStage = diagnosisData.diagnosisStage;
        dataToSave.treatmentPlan = diagnosisData.treatmentPlan;
        dataToSave.question = diagnosisData.question;
        dataToSave.concernedDepartmentIds = diagnosisData.concernedDepartmentIds;
      } else {
        dataToSave = {
          patientName: diagnosisData.patientName,
          mrn: diagnosisData.mrn,
          age: diagnosisData.age,
          gender: diagnosisData.gender,
          diagnosisStage: diagnosisData.diagnosisStage,
          treatmentPlan: diagnosisData.treatmentPlan,
          question: diagnosisData.question,
          concernedDepartmentIds: diagnosisData.concernedDepartmentIds,
        };
      }
    }

    if (!dataToSave) {
      alert("No data to save");
      return;
    }

    // Ensure age is a number
    if (typeof dataToSave.age === 'string') {
      dataToSave.age = parseInt(dataToSave.age) || 0;
    }

    setSaving(true);
    try {
      const updatePayload: Record<string, any> = { ...dataToSave };
      const latestClinicalContent = clinicalContentGetter.current ? clinicalContentGetter.current() : clinicalDetailsContent;
      const latestRadiologyContent = radiologyContentGetter.current ? radiologyContentGetter.current() : radiologyContent;
      const latestPathologyContent = pathologyContentGetter.current ? pathologyContentGetter.current() : pathologyContent;

      // 1. Include all rich text fields in a single case update payload
      if (latestClinicalContent) {
        updatePayload.clinicalDetails = latestClinicalContent;
      }

      if (latestRadiologyContent) {
        updatePayload.radiologyFindings = latestRadiologyContent;
      }

      if (latestPathologyContent) {
        updatePayload.pathologyFindings = latestPathologyContent;
      }

      // 2. Save all case changes in a single request for one combined audit entry
      setSaveStatus("Saving case information...");
      const caseResponse = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });

      if (!caseResponse.ok) {
        const error = await caseResponse.json();
        throw new Error(error.error || "Failed to save case");
      }

      // Don't update caseData here - wait until after all saves complete and edit mode is exited
      // This prevents the useEffect in CaseDetails from overwriting formData during save

      // 3. Upload staged attachments
      if (stagedAttachments.length > 0) {
        setSaveStatus(`Uploading ${stagedAttachments.length} attachment(s)...`);
        for (let i = 0; i < stagedAttachments.length; i++) {
          const file = stagedAttachments[i];
          setSaveStatus(`Uploading ${i + 1}/${stagedAttachments.length}: ${file.name}...`);
          const formData = new FormData();
          formData.append("file", file);

          const uploadResponse = await fetch(`/api/attachments/upload/${caseId}`, {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            const error = await uploadResponse.json();
            console.error(`Failed to upload ${file.name}:`, error);
            // Continue with other files
          }
        }
      }

      // 4. Delete marked attachments
      if (attachmentsToDelete.length > 0) {
        setSaveStatus("Deleting attachments...");
        for (const attachmentId of attachmentsToDelete) {
          const deleteResponse = await fetch(`/api/attachments/${attachmentId}`, {
            method: "DELETE",
          });

          if (!deleteResponse.ok) {
            const error = await deleteResponse.json();
            console.error(`Failed to delete attachment ${attachmentId}:`, error);
            // Continue with other deletions
          }
        }
      }

      // 5. Exit edit mode first, then reload case data
      setSaveStatus("Finalizing...");
      setIsEditing(false);
      // Small delay to ensure edit mode is fully exited before reloading
      await new Promise(resolve => setTimeout(resolve, 100));
      // Reload full case data to get all relations (attachments, opinions, etc.)
      await loadCase();
    } catch (error) {
      console.error("Error saving:", error);
      alert(error instanceof Error ? error.message : "An error occurred. Please try again.");
    } finally {
      setSaving(false);
      setSaveStatus("");
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-3">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-4 pb-2 -mx-4 px-4 -mt-4 mb-2 border-b drop-shadow-sm">
        {/* Compact Header with Back button and Action Buttons */}
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-border/40">
          <Button variant="outline" size="sm" asChild>
            <Link href={backButtonConfig.url}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backButtonConfig.text}
            </Link>
          </Button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <CaseDetails
              caseData={caseData}
              onStatusChange={loadCase}
              showUpToPatientInfo={true}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              onSave={async (data) => {
                // Use parent's caseFormData which should have all the latest changes
                if (caseFormData) {
                  await handleUnifiedSave(caseFormData);
                } else if (data) {
                  await handleUnifiedSave(data);
                } else {
                  await handleUnifiedSave();
                }
              }}
              saving={saving}
              saveStatus={saveStatus}
              compactMode={true}
              onFormDataChange={(data) => {
                setCaseFormData((prev) => prev ? { ...prev, ...data } : data);
              }}
            />
          </div>
        </div>

        {/* Patient Name, Status, and MRN */}
        <div className="flex items-center justify-between gap-4 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{caseData.patientName}</h1>
            <StatusBadge status={caseData.status} />
            {caseData.mrn && (
              <Badge variant="outline">MRN: {caseData.mrn}</Badge>
            )}
          </div>
          {/* Meeting Assignment Badge - moved to right */}
          <CaseDetails
            caseData={caseData}
            onStatusChange={loadCase}
            showMeetingOnly={true}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
          />
        </div>
      </div>

      {/* Patient Information */}
      <CaseDetails
        caseData={caseData}
        onStatusChange={loadCase}
        showUpToPatientInfo={true}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        onSave={handleUnifiedSave}
        saving={saving}
        saveStatus={saveStatus}
        onFormDataChange={(data) => {
          setCaseFormData((prev) => prev ? { ...prev, ...data } : data);
        }}
        onRegisterFormDataGetter={(getter) => {
          patientInfoFormDataGetter.current = getter;
        }}
      />

      {/* Clinical Details */}
      <ClinicalDetailsEditor
        caseId={caseId}
        caseStatus={caseData.status}
        caseCreatedById={caseData.createdBy.id}
        initialData={caseData.clinicalDetails}
        onSave={loadCase}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        onContentChange={setClinicalDetailsContent}
        onContentGetter={(getter) => { clinicalContentGetter.current = getter; }}
      />

      {/* Radiology & Pathology Findings */}
      <div className="grid gap-4 md:grid-cols-2">
        <RadiologyEditor
          caseId={caseId}
          caseStatus={caseData.status}
          initialData={caseData.radiologyFindings}
          onSave={loadCase}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          onContentChange={setRadiologyContent}
          onContentGetter={(getter) => { radiologyContentGetter.current = getter; }}
        />
        <PathologyEditor
          caseId={caseId}
          caseStatus={caseData.status}
          initialData={caseData.pathologyFindings}
          onSave={loadCase}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          onContentChange={setPathologyContent}
          onContentGetter={(getter) => { pathologyContentGetter.current = getter; }}
        />
      </div>

      {/* Diagnosis Stage, Treatment Plan, Discussion Question */}
      <CaseDetails
        caseData={caseData}
        onStatusChange={loadCase}
        showUpToPatientInfo={false}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        onSave={handleUnifiedSave}
        saving={saving}
        saveStatus={saveStatus}
        onFormDataChange={(data) => {
          setCaseFormData((prev) => prev ? { ...prev, ...data } : data);
        }}
        onRegisterFormDataGetter={(getter) => {
          diagnosisFormDataGetter.current = getter;
        }}
      />

      <LinksEditor
        caseId={caseId}
        caseStatus={caseData.status}
        caseCreatedById={caseData.createdBy.id}
        initialLinks={caseData.links || []}
        initialDicomFiles={caseData.dicomFiles || []}
        dicomBundles={caseData.attachments?.filter((a: any) => a.isDicomBundle) || []}
        patientMrn={caseData.mrn}
        onUpdate={loadCase}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />

      <AttachmentManager
        caseId={caseId}
        caseStatus={caseData.status}
        caseCreatedById={caseData.createdBy.id}
        initialAttachments={caseData.attachments?.filter((a: any) => !a.isDicomBundle) || []}
        onUpdate={loadCase}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        onStagedFilesChange={(files, filesToDelete) => {
          setStagedAttachments(files);
          setAttachmentsToDelete(filesToDelete);
        }}
      />

      <SpecialistOpinions
        caseId={caseId}
        opinions={caseData.specialistsOpinions || []}
        onRefresh={loadCase}
      />

      <ConsensusEditor
        caseId={caseId}
        initialConsensus={caseData.consensusReport || null}
        onSave={loadCase}
        assignedMeetingId={caseData.assignedMeetingId || null}
      />

      <FollowUpEditor
        caseId={caseId}
        caseCreatedById={caseData.createdBy.id}
        caseStatus={caseData.status}
        initialFollowUp={caseData.followUp || null}
        onUpdate={loadCase}
      />

      {/* Combined Timeline & Case History */}
      <CaseHistory caseData={caseData} />
    </div>
  );
}

export default function CaseDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </div>
      }
    >
      <CaseDetailPageContent />
    </Suspense>
  );
}
