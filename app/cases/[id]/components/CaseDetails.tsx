"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "../../components/StatusBadge";
import { CaseStatus, Gender } from "@prisma/client";
import { format } from "date-fns";
import { Archive, Send, RotateCcw, Edit, Save, X, Loader2, Calendar, Trash2, FileText } from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MessageDialog } from "@/components/ui/message-dialog";

interface CaseDetailsProps {
  caseData: {
    id: string;
    patientName: string;
    mrn: string | null;
    age: number;
    gender: Gender;
    presentingDepartment: {
      id: string;
      name: string;
    };
    clinicalDetails: string;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
    status: CaseStatus;
    createdBy: {
      id: string;
      name: string;
    };
    assignedMeeting: {
      id: string;
      date: string;
      description: string | null;
    } | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  onStatusChange?: () => void;
  showUpToPatientInfo?: boolean; // If true, only show header and patient info. If false, show everything except header and patient info.
  isEditing?: boolean;
  setIsEditing?: (editing: boolean) => void;
  onSave?: (data?: {
    patientName: string;
    mrn: string | null;
    age: number;
    gender: Gender;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
  }) => Promise<void>;
  saving?: boolean;
  saveStatus?: string;
  compactMode?: boolean;
  showMeetingOnly?: boolean;
  onFormDataChange?: (data: {
    patientName: string;
    mrn: string | null;
    age: number;
    gender: Gender;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
  }) => void;
  onRegisterFormDataGetter?: (getter: () => {
    patientName: string;
    mrn: string | null;
    age: number;
    gender: Gender;
    diagnosisStage: string;
    treatmentPlan: string;
    question: string;
  }) => void;
}

export function CaseDetails({ caseData, onStatusChange, showUpToPatientInfo, isEditing: externalIsEditing, setIsEditing: setExternalIsEditing, onSave: externalOnSave, saving: externalSaving, saveStatus: externalSaveStatus, compactMode, showMeetingOnly, onFormDataChange, onRegisterFormDataGetter }: CaseDetailsProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Use external edit mode if provided, otherwise use internal
  const isEditing = externalIsEditing !== undefined ? externalIsEditing : internalIsEditing;
  const setIsEditing = setExternalIsEditing || setInternalIsEditing;
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [isResubmitDialogOpen, setIsResubmitDialogOpen] = useState(false);
  const [isAssignMeetingDialogOpen, setIsAssignMeetingDialogOpen] = useState(false);
  const [isReassignRemoveDialogOpen, setIsReassignRemoveDialogOpen] = useState(false);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Array<{ id: string; date: string; description: string | null; status?: string }>>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>("none");
  const [selectedResubmitMeetingId, setSelectedResubmitMeetingId] = useState<string>("none");
  const [selectedReassignMeetingId, setSelectedReassignMeetingId] = useState<string>("none");
  const [assigningMeeting, setAssigningMeeting] = useState(false);
  const [unassigningMeeting, setUnassigningMeeting] = useState(false);
  const [reassigningMeeting, setReassigningMeeting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  
  // MessageDialog state
  const [messageDialog, setMessageDialog] = useState<{
    open: boolean;
    type: "success" | "error" | "info";
    title: string;
    message: string;
  }>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });
  
  // PDF section selection state - default sections checked
  const [pdfSections, setPdfSections] = useState({
    hospitalHeader: false, // Default false to leave blank space for letterhead
    patientDetails: true,
    clinicalDetails: true,
    radiologyFindings: false,
    pathologyFindings: false,
    diagnosisStage: false,
    finalDiagnosis: true,
    treatmentPlan: false,
    specialistsOpinions: false,
    question: false,
    consensusReport: true,
  });
  const [formData, setFormData] = useState({
    patientName: caseData.patientName,
    mrn: caseData.mrn || "",
    age: caseData.age.toString(),
    gender: caseData.gender,
    diagnosisStage: caseData.diagnosisStage,
    treatmentPlan: caseData.treatmentPlan,
    question: caseData.question,
  });

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  // Can edit if status is DRAFT, SUBMITTED, PENDING, or RESUBMITTED, and user is author/coordinator/admin
  const canEdit = 
    (caseData.status === CaseStatus.DRAFT || 
     caseData.status === CaseStatus.SUBMITTED || 
     caseData.status === CaseStatus.PENDING ||
     caseData.status === CaseStatus.RESUBMITTED) &&
    (caseData.createdBy.id === user?.id || isCoordinator(user));
  const canSubmit = caseData.status === CaseStatus.DRAFT;
  const canArchive = isCoordinator(user) && caseData.status !== CaseStatus.ARCHIVED;
  const canResubmit = caseData.status === CaseStatus.REVIEWED;
  const canGeneratePdf = caseData.status === CaseStatus.REVIEWED || caseData.status === CaseStatus.RESUBMITTED;
  // Can delete if: DRAFT, SUBMITTED, or PENDING status, and user is coordinator/admin/author consultant
  const isCreator = caseData.createdBy.id === user?.id;
  const canDelete = (caseData.status === CaseStatus.DRAFT || caseData.status === CaseStatus.SUBMITTED || caseData.status === CaseStatus.PENDING) &&
    user && (isCoordinator(user) || isCreator);
  // Coordinators/admins can always assign/unassign meetings. Case creators can also assign/unassign.
  // But "Remove from meeting" should not be available for REVIEWED cases (unless RESUBMITTED)
  const hasAssignedMeeting = caseData.assignedMeeting !== null && caseData.assignedMeeting !== undefined;
  const isUserCoordinator = user ? isCoordinator(user) : false;
  const isUserCreator = user ? caseData.createdBy.id === user.id : false;
  const canAssignMeeting = !hasAssignedMeeting && user && (isUserCoordinator || isUserCreator);
  // Can only unassign if not REVIEWED (unless RESUBMITTED, which allows unassigning)
  const canUnassignMeeting = hasAssignedMeeting && user && (isUserCoordinator || isUserCreator) && 
    caseData.status !== CaseStatus.REVIEWED;

  // Track previous caseData to avoid unnecessary updates
  const prevCaseDataRef = useRef(caseData);

  useEffect(() => {
    // Only sync formData from caseData when:
    // 1. Not in editing mode (to avoid overwriting user edits)
    // 2. caseData actually changed (not just a reference change)
    const caseDataChanged = 
      prevCaseDataRef.current.patientName !== caseData.patientName ||
      prevCaseDataRef.current.mrn !== caseData.mrn ||
      prevCaseDataRef.current.age !== caseData.age ||
      prevCaseDataRef.current.gender !== caseData.gender ||
      prevCaseDataRef.current.diagnosisStage !== caseData.diagnosisStage ||
      prevCaseDataRef.current.treatmentPlan !== caseData.treatmentPlan ||
      prevCaseDataRef.current.question !== caseData.question;
    
    if (!isEditing && caseDataChanged) {
    setFormData({
      patientName: caseData.patientName,
      mrn: caseData.mrn || "",
      age: caseData.age.toString(),
      gender: caseData.gender,
      diagnosisStage: caseData.diagnosisStage,
      treatmentPlan: caseData.treatmentPlan,
      question: caseData.question,
    });
    }
    
    prevCaseDataRef.current = caseData;
  }, [caseData, isEditing]);
  
  // Register formData getter with parent
  useEffect(() => {
    if (onRegisterFormDataGetter) {
      onRegisterFormDataGetter(() => ({
        patientName: formData.patientName.trim(),
        mrn: formData.mrn.trim() || null,
        age: parseInt(formData.age) || 0,
        gender: formData.gender,
        diagnosisStage: formData.diagnosisStage.trim(),
        treatmentPlan: formData.treatmentPlan.trim(),
        question: formData.question.trim(),
      }));
    }
  }, [formData, onRegisterFormDataGetter]);

  // Notify parent of formData changes whenever formData changes (debounced)
  useEffect(() => {
    if (onFormDataChange && isEditing) {
      const timeoutId = setTimeout(() => {
        onFormDataChange({
          patientName: formData.patientName.trim(),
          mrn: formData.mrn.trim() || null,
          age: parseInt(formData.age) || 0,
          gender: formData.gender,
          diagnosisStage: formData.diagnosisStage.trim(),
          treatmentPlan: formData.treatmentPlan.trim(),
          question: formData.question.trim(),
        });
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [formData, isEditing, onFormDataChange]);

  const loadUpcomingMeetings = async (includePast = false, limit?: number) => {
    setLoadingMeetings(true);
    try {
      const response = await fetch("/api/meetings");
      if (response.ok) {
        const meetings = await response.json();
        
        let filteredMeetings = meetings;
        // First, filter out cancelled and completed meetings
        filteredMeetings = meetings.filter((m: { date: string; status?: string }) => 
          m.status !== "CANCELLED" && m.status !== "COMPLETED"
        );
        
        if (!includePast) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          // Filter meetings that are today or in the future
          filteredMeetings = filteredMeetings.filter((m: { date: string }) => {
            const meetingDate = new Date(m.date);
            meetingDate.setHours(0, 0, 0, 0);
            return meetingDate >= today;
          });
        }
        
        // Sort by date (ascending - earliest first)
        const sorted = filteredMeetings.sort((a: { date: string }, b: { date: string }) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        // Limit to specified number (default: no limit)
        const limited = limit ? sorted.slice(0, limit) : sorted;
        
        setUpcomingMeetings(limited);
        
        // Auto-select the first (nearest) upcoming meeting if available
        if (limited.length > 0) {
          const firstMeetingId = limited[0].id;
          setSelectedMeetingId(firstMeetingId);
          setSelectedResubmitMeetingId(firstMeetingId);
        } else {
          setSelectedMeetingId("none");
          setSelectedResubmitMeetingId("none");
        }
      }
    } catch (error) {
      console.error("Error loading meetings:", error);
    } finally {
      setLoadingMeetings(false);
    }
  };

  const handleSubmitClick = () => {
    loadUpcomingMeetings();
    setIsSubmitDialogOpen(true);
  };

  const handleAssignMeetingClick = () => {
    loadUpcomingMeetings(false, 3); // Only today or upcoming meetings, limit to 3
    setIsAssignMeetingDialogOpen(true);
  };

  const handleAssignMeeting = async () => {
    if (!selectedMeetingId || selectedMeetingId === "none") {
      setMessageDialog({
        open: true,
        type: "error",
        title: "No Meeting Selected",
        message: "Please select a meeting",
      });
      return;
    }

    setAssigningMeeting(true);
    setIsAssignMeetingDialogOpen(false);

    try {
      const response = await fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedMeetingId: selectedMeetingId,
        }),
      });

      if (response.ok) {
        onStatusChange?.();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Assignment Failed",
          message: error.error || "Failed to assign meeting",
        });
        setIsAssignMeetingDialogOpen(true); // Reopen dialog on error
      }
    } catch (error) {
      console.error("Error assigning meeting:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
      setIsAssignMeetingDialogOpen(true); // Reopen dialog on error
    } finally {
      setAssigningMeeting(false);
    }
  };

  const handleUnassignMeeting = async () => {
    if (!confirm("Are you sure you want to remove this case from the assigned meeting? The case status will change to SUBMITTED.")) {
      return;
    }

    setUnassigningMeeting(true);

    try {
      const response = await fetch(`/api/cases/${caseData.id}/unassign-meeting`, {
        method: "POST",
      });

      if (response.ok) {
        onStatusChange?.();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Unassignment Failed",
          message: error.error || "Failed to unassign meeting",
        });
      }
    } catch (error) {
      console.error("Error unassigning meeting:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setUnassigningMeeting(false);
    }
  };

  const handleReassignRemoveClick = () => {
    // Load upcoming meetings, excluding the currently assigned one
    const currentMeetingId = caseData.assignedMeeting?.id;
    loadUpcomingMeetingsForReassign(currentMeetingId);
    setSelectedReassignMeetingId("none");
    setIsReassignRemoveDialogOpen(true);
  };

  const loadUpcomingMeetingsForReassign = async (excludeMeetingId?: string) => {
    setLoadingMeetings(true);
    try {
      const response = await fetch("/api/meetings");
      if (response.ok) {
        const meetings = await response.json();
        
        // Filter meetings that are today or in the future
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const filteredMeetings = meetings.filter((m: { id: string; date: string; status?: string }) => {
          const meetingDate = new Date(m.date);
          meetingDate.setHours(0, 0, 0, 0);
          // Exclude cancelled, completed meetings and the currently assigned meeting
          return m.status !== "CANCELLED" && m.status !== "COMPLETED" && meetingDate >= today && m.id !== excludeMeetingId;
        });
        
        // Sort by date (ascending - earliest first)
        const sorted = filteredMeetings.sort((a: { date: string }, b: { date: string }) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        
        setUpcomingMeetings(sorted);
      }
    } catch (error) {
      console.error("Error loading meetings:", error);
    } finally {
      setLoadingMeetings(false);
    }
  };

  const handleReassignRemove = async () => {
    if (!selectedReassignMeetingId) {
      setMessageDialog({
        open: true,
        type: "error",
        title: "No Option Selected",
        message: "Please select an option",
      });
      return;
    }

    setReassigningMeeting(true);
    setIsReassignRemoveDialogOpen(false);

    try {
      if (selectedReassignMeetingId === "none") {
        // Remove from meeting
        const response = await fetch(`/api/cases/${caseData.id}/unassign-meeting`, {
          method: "POST",
        });

        if (response.ok) {
          onStatusChange?.();
        } else {
          const error = await response.json();
          setMessageDialog({
            open: true,
            type: "error",
            title: "Action Failed",
            message: error.error || "Failed to remove from meeting",
          });
          setIsReassignRemoveDialogOpen(true);
        }
      } else {
        // Reassign to a different meeting
        const response = await fetch(`/api/cases/${caseData.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignedMeetingId: selectedReassignMeetingId,
          }),
        });

        if (response.ok) {
          onStatusChange?.();
        } else {
          const error = await response.json();
          setMessageDialog({
            open: true,
            type: "error",
            title: "Reassignment Failed",
            message: error.error || "Failed to reassign meeting",
          });
          setIsReassignRemoveDialogOpen(true);
        }
      }
    } catch (error) {
      console.error("Error reassigning/removing meeting:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
      setIsReassignRemoveDialogOpen(true);
    } finally {
      setReassigningMeeting(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedMeetingId || selectedMeetingId === "none") {
      setMessageDialog({
        open: true,
        type: "error",
        title: "No Meeting Selected",
        message: "Please select a meeting to submit the case",
      });
      return;
    }

    setSubmitting(true);
    setIsSubmitDialogOpen(false);
    
    try {
      const response = await fetch(`/api/cases/${caseData.id}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedMeetingId: selectedMeetingId,
        }),
      });
      
      if (response.ok) {
        onStatusChange?.();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Submission Failed",
          message: error.error || "Failed to submit case",
        });
        setIsSubmitDialogOpen(true); // Reopen dialog on error
      }
    } catch (error) {
      console.error("Error submitting case:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
      setIsSubmitDialogOpen(true); // Reopen dialog on error
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm("Are you sure you want to archive this case?")) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/cases/${caseData.id}/archive`, {
        method: "POST",
      });
      if (response.ok) {
        onStatusChange?.();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Archive Failed",
          message: error.error || "Failed to archive case",
        });
      }
    } catch (error) {
      console.error("Error archiving case:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/cases/${caseData.id}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        // Redirect to cases list after successful deletion
        router.push("/cases");
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Delete Failed",
          message: error.error || "Failed to delete case",
        });
        setDeleting(false);
        setIsDeleteDialogOpen(false);
      }
    } catch (error) {
      console.error("Error deleting case:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
      setDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleResubmitClick = () => {
    loadUpcomingMeetings();
    setIsResubmitDialogOpen(true);
  };

  const handleGeneratePdfClick = async () => {
    setPdfDialogOpen(true);
    // Load attendees if there's an assigned meeting
    if (caseData.assignedMeeting?.id) {
      await loadAttendees(caseData.assignedMeeting.id);
    }
  };

  const loadAttendees = async (meetingId: string) => {
    setLoadingAttendees(true);
    try {
      const response = await fetch(`/api/meetings/${meetingId}`);
      if (response.ok) {
        const meeting = await response.json();
        setAttendees(meeting.attendees || []);
        // Pre-select all attendees (with or without signatures)
        const allIds = (meeting.attendees || []).map((a: any) => a.userId);
        setSelectedAttendeeIds(allIds);
      }
    } catch (error) {
      console.error("Error loading attendees:", error);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const handlePdfSectionToggle = (section: keyof typeof pdfSections) => {
    setPdfSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleGeneratePdf = async () => {
    setDownloadingPdf(true);
    try {
      // Convert sections object to array of selected sections
      const selectedSections = Object.entries(pdfSections)
        .filter(([_, selected]) => selected)
        .map(([section, _]) => section);

      // Build query string with sections
      const params = new URLSearchParams();
      selectedSections.forEach((section) => {
        params.append("sections", section);
      });

      // Add selected attendee IDs
      selectedAttendeeIds.forEach((id) => {
        params.append("attendeeIds", id);
      });

      const response = await fetch(`/api/consensus/${caseData.id}/pdf?${params.toString()}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `consensus-report-${caseData.id.substring(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setPdfDialogOpen(false);
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "PDF Generation Failed",
          message: error.error || "Failed to generate PDF",
        });
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred while generating the PDF. Please try again.",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleResubmit = async () => {
    setSubmitting(true);
    setIsResubmitDialogOpen(false);
    
    try {
      const body: { assignedMeetingId?: string } = {};
      if (selectedResubmitMeetingId && selectedResubmitMeetingId !== "none") {
        body.assignedMeetingId = selectedResubmitMeetingId;
      }

      const response = await fetch(`/api/cases/${caseData.id}/resubmit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        onStatusChange?.();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Resubmission Failed",
          message: error.error || "Failed to resubmit case",
        });
      }
    } catch (error) {
      console.error("Error resubmitting case:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSave = async () => {
    // Update parent formData before saving - ensure immediate sync
    const currentFormData = {
      patientName: formData.patientName.trim(),
      mrn: formData.mrn.trim() || null,
      age: parseInt(formData.age) || 0,
      gender: formData.gender,
      diagnosisStage: formData.diagnosisStage.trim(),
      treatmentPlan: formData.treatmentPlan.trim(),
      question: formData.question.trim(),
    };
    
    if (onFormDataChange) {
      // Sync immediately before save
      onFormDataChange(currentFormData);
    }
    
    if (externalOnSave) {
      // Pass current formData to ensure latest changes are saved
      await externalOnSave(currentFormData);
    } else {
      // Internal save handler
    setSaving(true);
    try {
      const response = await fetch(`/api/cases/${caseData.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientName: formData.patientName.trim(),
          mrn: formData.mrn.trim() || null,
          age: parseInt(formData.age),
          gender: formData.gender,
          diagnosisStage: formData.diagnosisStage.trim(),
          treatmentPlan: formData.treatmentPlan.trim(),
          question: formData.question.trim(),
        }),
      });

      if (response.ok) {
        setIsEditing(false);
        onStatusChange?.();
      } else {
        const error = await response.json();
        setMessageDialog({
          open: true,
          type: "error",
          title: "Save Failed",
          message: error.error || "Failed to save changes",
        });
      }
    } catch (error) {
      console.error("Error saving case:", error);
      setMessageDialog({
        open: true,
        type: "error",
        title: "Error",
        message: "An error occurred. Please try again.",
      });
    } finally {
      setSaving(false);
      }
    }
  };
  
  const isSaving = externalSaving !== undefined ? externalSaving : saving;

  const handleCancel = () => {
    setFormData({
      patientName: caseData.patientName,
      mrn: caseData.mrn || "",
      age: caseData.age.toString(),
      gender: caseData.gender,
      diagnosisStage: caseData.diagnosisStage,
      treatmentPlan: caseData.treatmentPlan,
      question: caseData.question,
    });
    setIsEditing(false);
    // Reset will be handled by child components via useEffect
  };

  // If compactMode, only show action buttons
  if (compactMode) {
  return (
      <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
          <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          {isEditing && (
            <>
            <Button onClick={handleCancel} variant="outline" size="sm" disabled={isSaving}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            <Button 
              onClick={async () => {
                // For compactMode, we don't render the form, so we can't sync formData from here
                // Instead, rely on the parent's caseFormData which has been updated by the actual form instances
                // via onFormDataChange callbacks
                if (externalOnSave) {
                  // Call without arguments - parent will use merged caseFormData from all instances
                  await externalOnSave();
                } else {
                  await handleSave();
                }
              }} 
              size="sm" 
              disabled={isSaving}
            >
              {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {externalSaveStatus || "Saving..."}
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
            </>
          )}
          {canSubmit && !isEditing && (
          <Button onClick={handleSubmitClick} size="sm" disabled={submitting}>
              <Send className="mr-2 h-4 w-4" />
              Submit
            </Button>
          )}
          {canResubmit && !isEditing && (
          <Button onClick={handleResubmitClick} size="sm" disabled={submitting} variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" />
              Resubmit
            </Button>
          )}
          {canArchive && !isEditing && (
          <Button onClick={handleArchive} size="sm" disabled={submitting} variant="outline">
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </Button>
          )}
          {canGeneratePdf && !isEditing && (
          <Button onClick={handleGeneratePdfClick} size="sm" disabled={downloadingPdf} variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              Consensus PDF Report
            </Button>
          )}
          {canDelete && !isEditing && (
            <Button 
              onClick={() => setIsDeleteDialogOpen(true)} 
            size="sm"
              disabled={deleting} 
              variant="destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Case</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this case? This action cannot be undone.
                <br />
                <strong>Patient: {caseData.patientName}</strong>
                {caseData.mrn && <><br />MRN: {caseData.mrn}</>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Submit Dialog */}
        <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Case</DialogTitle>
              <DialogDescription>
                Select a meeting date for this case.
              </DialogDescription>
            </DialogHeader>
            
            {loadingMeetings ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
        </div>
            ) : (
              <div className="py-4">
                {upcomingMeetings.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 space-y-2">
                    <p>No upcoming meetings found.</p>
                    <p>
                      To request a meeting, go to{" "}
                      <Link href="/settings?tab=notifications" className="text-primary underline hover:no-underline">
                        Settings → Notifications → Request meeting
                      </Link>
                      .
                    </p>
                  </div>
                ) : (
                  <RadioGroup
                    value={selectedMeetingId}
                    onValueChange={setSelectedMeetingId}
                  >
                    {upcomingMeetings.map((meeting) => (
                      <div key={meeting.id} className="flex items-center space-x-2 py-2">
                        <RadioGroupItem value={meeting.id} id={meeting.id} />
                        <Label htmlFor={meeting.id} className="cursor-pointer flex-1">
                          <div>
                            <div className="font-medium">
                              {format(new Date(meeting.date), "EEEE, MMMM dd, yyyy")}
                            </div>
                            {meeting.description && (
                              <div className="text-sm text-muted-foreground">
                                {meeting.description}
                              </div>
                            )}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
      </div>
      )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsSubmitDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={submitting || loadingMeetings || !selectedMeetingId || selectedMeetingId === "none" || upcomingMeetings.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Case
                </>
              )}
            </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Resubmit Dialog */}
        <Dialog open={isResubmitDialogOpen} onOpenChange={setIsResubmitDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resubmit Case</DialogTitle>
              <DialogDescription>
                Select a meeting date for this case, or resubmit without assignment.
              </DialogDescription>
            </DialogHeader>
            
            {loadingMeetings ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="py-4">
                <RadioGroup
                  value={selectedResubmitMeetingId}
                  onValueChange={setSelectedResubmitMeetingId}
                >
                  <div className="flex items-center space-x-2 py-2">
                    <RadioGroupItem value="none" id="resubmit-none" />
                    <Label htmlFor="resubmit-none" className="cursor-pointer">
                      Resubmit without meeting assignment
                    </Label>
                  </div>
                  
                  {upcomingMeetings.map((meeting) => (
                    <div key={meeting.id} className="flex items-center space-x-2 py-2">
                      <RadioGroupItem value={meeting.id} id={`resubmit-${meeting.id}`} />
                      <Label htmlFor={`resubmit-${meeting.id}`} className="cursor-pointer flex-1">
                        <div>
                          <div className="font-medium">
                            {format(new Date(meeting.date), "EEEE, MMMM dd, yyyy")}
                          </div>
                          {meeting.description && (
                            <div className="text-sm text-muted-foreground">
                              {meeting.description}
                            </div>
                          )}
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                
                {upcomingMeetings.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">
                    No upcoming meetings found. You can resubmit the case without assignment.
                  </p>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsResubmitDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={handleResubmit} disabled={submitting || loadingMeetings}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resubmitting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Resubmit Case
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PDF Generation Dialog */}
        <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate PDF Report</DialogTitle>
              <DialogDescription>
                Select the sections you want to include in the PDF report.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="hospitalHeader"
                  checked={pdfSections.hospitalHeader}
                  onCheckedChange={() => handlePdfSectionToggle("hospitalHeader")}
                />
                <Label htmlFor="hospitalHeader" className="cursor-pointer">
                  Hospital Name/Logo
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="patientDetails"
                  checked={pdfSections.patientDetails}
                  onCheckedChange={() => handlePdfSectionToggle("patientDetails")}
                />
                <Label htmlFor="patientDetails" className="cursor-pointer">
                  Patient Details
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="clinicalDetails"
                  checked={pdfSections.clinicalDetails}
                  onCheckedChange={() => handlePdfSectionToggle("clinicalDetails")}
                />
                <Label htmlFor="clinicalDetails" className="cursor-pointer">
                  Clinical Details
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="radiologyFindings"
                  checked={pdfSections.radiologyFindings}
                  onCheckedChange={() => handlePdfSectionToggle("radiologyFindings")}
                />
                <Label htmlFor="radiologyFindings" className="cursor-pointer">
                  Radiology Findings
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="pathologyFindings"
                  checked={pdfSections.pathologyFindings}
                  onCheckedChange={() => handlePdfSectionToggle("pathologyFindings")}
                />
                <Label htmlFor="pathologyFindings" className="cursor-pointer">
                  Pathology Findings
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="diagnosisStage"
                  checked={pdfSections.diagnosisStage}
                  onCheckedChange={() => handlePdfSectionToggle("diagnosisStage")}
                />
                <Label htmlFor="diagnosisStage" className="cursor-pointer">
                  Diagnosis Stage
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="finalDiagnosis"
                  checked={pdfSections.finalDiagnosis}
                  onCheckedChange={() => handlePdfSectionToggle("finalDiagnosis")}
                />
                <Label htmlFor="finalDiagnosis" className="cursor-pointer">
                  Final Diagnosis
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="treatmentPlan"
                  checked={pdfSections.treatmentPlan}
                  onCheckedChange={() => handlePdfSectionToggle("treatmentPlan")}
                />
                <Label htmlFor="treatmentPlan" className="cursor-pointer">
                  Treatment Plan
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="specialistsOpinions"
                  checked={pdfSections.specialistsOpinions}
                  onCheckedChange={() => handlePdfSectionToggle("specialistsOpinions")}
                />
                <Label htmlFor="specialistsOpinions" className="cursor-pointer">
                  Specialists&apos; Opinions
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="question"
                  checked={pdfSections.question}
                  onCheckedChange={() => handlePdfSectionToggle("question")}
                />
                <Label htmlFor="question" className="cursor-pointer">
                  Discussion Question
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="consensusReport"
                  checked={pdfSections.consensusReport}
                  onCheckedChange={() => handlePdfSectionToggle("consensusReport")}
                />
                <Label htmlFor="consensusReport" className="cursor-pointer">
                  Consensus Report
                </Label>
              </div>
            </div>
            
            {/* Attendee Selection Section */}
            {caseData.assignedMeeting && (
              <div className="space-y-3 border-t pt-4">
                <div>
                  <Label className="text-sm font-medium">Meeting Attendees</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Select attendees to include in the PDF. Attendees with authenticated digital signatures will show their signatures. Others will show a blank space for physical signature.
                  </p>
                </div>
                {loadingAttendees ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : attendees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No attendees found for this meeting.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {attendees.map((attendee) => {
                      const hasSignature = attendee.user.signatureUrl && attendee.user.signatureAuthenticated;
                      return (
                        <div
                          key={attendee.user.id}
                          className="flex items-center space-x-2 p-2 rounded border"
                        >
                          <Checkbox
                            id={`pdf-attendee-${attendee.user.id}`}
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
                            htmlFor={`pdf-attendee-${attendee.user.id}`}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-sm">{attendee.user.name}</div>
                              {hasSignature ? (
                                <span className="text-xs text-green-600">✓ Digital Signature</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">(Physical Signature)</span>
                              )}
                            </div>
                            {attendee.user.department && (
                              <div className="text-xs text-muted-foreground">
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
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPdfDialogOpen(false)}
                disabled={downloadingPdf}
              >
                Cancel
              </Button>
              <Button onClick={handleGeneratePdf} disabled={downloadingPdf}>
                {downloadingPdf ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Generate PDF
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // If showMeetingOnly, only show meeting assignment as badge (no assign button)
  if (showMeetingOnly) {
    // For SUBMITTED or PENDING status cases, use the re-assign/remove dialog
    const shouldUseReassignDialog = (caseData.status === CaseStatus.SUBMITTED || caseData.status === CaseStatus.PENDING) && hasAssignedMeeting;
    
    return (
      <>
      <div className="flex items-center gap-2">
        {hasAssignedMeeting && caseData.assignedMeeting ? (
          <>
              <Link 
                href={`/register?meetingId=${caseData.assignedMeeting.id}`} 
                className="inline-flex items-center gap-1"
              >
                <Badge 
                  variant="secondary" 
                  className="text-sm cursor-pointer hover:bg-secondary/80 transition-colors whitespace-nowrap"
                >
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  {format(new Date(caseData.assignedMeeting.date), "MMM dd, yyyy")}
                </Badge>
              </Link>
            {canUnassignMeeting && (
              <Button
                variant="ghost"
                size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    shouldUseReassignDialog ? handleReassignRemoveClick() : handleUnassignMeeting();
                  }}
                  disabled={unassigningMeeting || reassigningMeeting}
                className="h-6 px-2 text-xs"
              >
                  {(unassigningMeeting || reassigningMeeting) ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </Button>
            )}
          </>
        ) : (
          <Badge variant="outline" className="text-sm">No meeting assigned</Badge>
        )}
      </div>
        
        {/* Re-assign / Remove Dialog - for SUBMITTED status cases */}
        {shouldUseReassignDialog && (
          <Dialog open={isReassignRemoveDialogOpen} onOpenChange={setIsReassignRemoveDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Re-assign / Remove Meeting</DialogTitle>
                <DialogDescription>
                  Remove this case from the current meeting or reassign it to an upcoming meeting.
                </DialogDescription>
              </DialogHeader>
              
              {loadingMeetings ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="py-4">
                  <RadioGroup
                    value={selectedReassignMeetingId}
                    onValueChange={setSelectedReassignMeetingId}
                  >
                    <div className="flex items-center space-x-2 py-2">
                      <RadioGroupItem value="none" id="reassign-remove-none" />
                      <Label htmlFor="reassign-remove-none" className="cursor-pointer">
                        Remove from meeting
                      </Label>
                    </div>
                    
                    {upcomingMeetings.map((meeting) => (
                      <div key={meeting.id} className="flex items-center space-x-2 py-2">
                        <RadioGroupItem value={meeting.id} id={`reassign-${meeting.id}`} />
                        <Label htmlFor={`reassign-${meeting.id}`} className="cursor-pointer flex-1">
                          <div>
                            <div className="font-medium">
                              {format(new Date(meeting.date), "EEEE, MMMM dd, yyyy")}
                            </div>
                            {meeting.description && (
                              <div className="text-sm text-muted-foreground">
                                {meeting.description}
                              </div>
                            )}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  
                  {upcomingMeetings.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4">
                      No upcoming meetings found. You can remove the case from the current meeting.
                    </p>
                  )}
                </div>
              )}
              
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsReassignRemoveDialogOpen(false)}
                  disabled={reassigningMeeting}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleReassignRemove} 
                  disabled={reassigningMeeting || loadingMeetings || !selectedReassignMeetingId}
                >
                  {reassigningMeeting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    selectedReassignMeetingId === "none" ? "Remove from Meeting" : "Reassign"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Delete Confirmation Dialog - only show once */}
      {(showUpToPatientInfo === true || showUpToPatientInfo === undefined) && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Case</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this case? This action cannot be undone.
              <br />
              <strong>Patient: {caseData.patientName}</strong>
              {caseData.mrn && <><br />MRN: {caseData.mrn}</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {/* Patient Information - only show when showUpToPatientInfo is true or undefined and not in compact mode */}
      {(showUpToPatientInfo === true || showUpToPatientInfo === undefined) && !compactMode && (
        <Card>
        <CardHeader className="pt-3 pb-2">
          <CardTitle>Patient Information</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-3">
          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name *</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) =>
                    setFormData({ ...formData, patientName: e.target.value })
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mrn">MRN</Label>
                <Input
                  id="mrn"
                  value={formData.mrn}
                  onChange={(e) =>
                    setFormData({ ...formData, mrn: e.target.value })
                  }
                  disabled={isSaving}
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
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value: Gender) =>
                    setFormData({ ...formData, gender: value })
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Gender.Male}>Male</SelectItem>
                    <SelectItem value={Gender.Female}>Female</SelectItem>
                    <SelectItem value={Gender.Other}>Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Age</p>
                <p className="font-medium">{caseData.age}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gender</p>
                <p className="font-medium">{caseData.gender}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Department</p>
                <p className="font-medium">{caseData.presentingDepartment.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created By</p>
                <p className="font-medium">{caseData.createdBy.name}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* If showUpToPatientInfo is false, show Diagnosis Stage and other sections */}
      {showUpToPatientInfo === false && (
        <>
          {/* Diagnosis Stage */}
          <Card>
        <CardHeader className="pt-3 pb-2">
          <CardTitle>Diagnosis Stage</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-3">
          {isEditing ? (
            <Input
              value={formData.diagnosisStage}
              onChange={(e) =>
                setFormData({ ...formData, diagnosisStage: e.target.value })
              }
              disabled={isSaving}
              placeholder="Enter diagnosis stage..."
            />
          ) : (
            <p className="whitespace-pre-wrap">{caseData.diagnosisStage || "—"}</p>
          )}
        </CardContent>
      </Card>

      {/* Treatment Plan */}
      <Card>
        <CardHeader className="pt-3 pb-2">
          <CardTitle>Treatment Plan</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-3">
          {isEditing ? (
            <Textarea
              value={formData.treatmentPlan}
              onChange={(e) =>
                setFormData({ ...formData, treatmentPlan: e.target.value })
              }
              rows={4}
              disabled={isSaving}
              placeholder="Enter treatment plan..."
              className="whitespace-pre-wrap"
            />
          ) : (
            <p className="whitespace-pre-wrap">{caseData.treatmentPlan || "—"}</p>
          )}
        </CardContent>
      </Card>

      {/* Discussion Question */}
      <Card>
        <CardHeader className="pt-3 pb-2">
          <CardTitle>Discussion Question</CardTitle>
        </CardHeader>
        <CardContent className="pt-2 pb-3">
          {isEditing ? (
            <Textarea
              value={formData.question}
              onChange={(e) =>
                setFormData({ ...formData, question: e.target.value })
              }
              rows={3}
              disabled={isSaving}
              placeholder="Enter discussion question..."
              className="whitespace-pre-wrap"
            />
          ) : (
            <p className="whitespace-pre-wrap">{caseData.question || "—"}</p>
          )}
        </CardContent>
      </Card>
                    </>
                  )}

      {/* All Dialogs - render for all modes */}
        <>
          {/* Submit Dialog */}
          <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Case</DialogTitle>
            <DialogDescription>
              Select a meeting date for this case.
            </DialogDescription>
          </DialogHeader>
          
          {loadingMeetings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="py-4">
                {upcomingMeetings.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 space-y-2">
                    <p>No upcoming meetings found.</p>
                    <p>
                      To request a meeting, go to{" "}
                      <Link href="/settings?tab=notifications" className="text-primary underline hover:no-underline">
                        Settings → Notifications → Request meeting
                      </Link>
                      .
                    </p>
                  </div>
                ) : (
              <RadioGroup
                value={selectedMeetingId}
                onValueChange={setSelectedMeetingId}
              >
                {upcomingMeetings.map((meeting) => (
                  <div key={meeting.id} className="flex items-center space-x-2 py-2">
                    <RadioGroupItem value={meeting.id} id={meeting.id} />
                    <Label htmlFor={meeting.id} className="cursor-pointer flex-1">
                      <div>
                        <div className="font-medium">
                          {format(new Date(meeting.date), "EEEE, MMMM dd, yyyy")}
                        </div>
                        {meeting.description && (
                          <div className="text-sm text-muted-foreground">
                            {meeting.description}
                          </div>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSubmitDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={submitting || loadingMeetings || !selectedMeetingId || selectedMeetingId === "none" || upcomingMeetings.length === 0}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Case
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resubmit Dialog */}
      <Dialog open={isResubmitDialogOpen} onOpenChange={setIsResubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resubmit Case</DialogTitle>
            <DialogDescription>
              Select a meeting date for this case, or resubmit without assignment.
            </DialogDescription>
          </DialogHeader>
          
          {loadingMeetings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="py-4">
              <RadioGroup
                value={selectedResubmitMeetingId}
                onValueChange={setSelectedResubmitMeetingId}
              >
                <div className="flex items-center space-x-2 py-2">
                  <RadioGroupItem value="none" id="resubmit-none" />
                  <Label htmlFor="resubmit-none" className="cursor-pointer">
                    Resubmit without meeting assignment
                  </Label>
                </div>
                
                {upcomingMeetings.map((meeting) => (
                  <div key={meeting.id} className="flex items-center space-x-2 py-2">
                    <RadioGroupItem value={meeting.id} id={`resubmit-${meeting.id}`} />
                    <Label htmlFor={`resubmit-${meeting.id}`} className="cursor-pointer flex-1">
                      <div>
                        <div className="font-medium">
                          {format(new Date(meeting.date), "EEEE, MMMM dd, yyyy")}
                        </div>
                        {meeting.description && (
                          <div className="text-sm text-muted-foreground">
                            {meeting.description}
                          </div>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              
              {upcomingMeetings.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">
                  No upcoming meetings found. You can resubmit the case without assignment.
                </p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsResubmitDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleResubmit} disabled={submitting || loadingMeetings}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resubmitting...
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Resubmit Case
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Meeting Dialog */}
      <Dialog open={isAssignMeetingDialogOpen} onOpenChange={setIsAssignMeetingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Meeting</DialogTitle>
            <DialogDescription>
              Select a meeting to assign this case to.
            </DialogDescription>
          </DialogHeader>
          
          {loadingMeetings ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="py-4">
              <RadioGroup
                value={selectedMeetingId}
                onValueChange={setSelectedMeetingId}
              >
                {upcomingMeetings.map((meeting) => (
                  <div key={meeting.id} className="flex items-center space-x-2 py-2">
                    <RadioGroupItem value={meeting.id} id={`assign-${meeting.id}`} />
                    <Label htmlFor={`assign-${meeting.id}`} className="cursor-pointer flex-1">
                      <div>
                        <div className="font-medium">
                          {format(new Date(meeting.date), "EEEE, MMMM dd, yyyy")}
                        </div>
                        {meeting.description && (
                          <div className="text-sm text-muted-foreground">
                            {meeting.description}
                          </div>
                        )}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              
              {upcomingMeetings.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">
                  No meetings found.
                </p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAssignMeetingDialogOpen(false)}
              disabled={assigningMeeting}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAssignMeeting} 
              disabled={assigningMeeting || loadingMeetings || selectedMeetingId === "none"}
            >
              {assigningMeeting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign Meeting"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Dialog */}
      <MessageDialog
        open={messageDialog.open}
        onOpenChange={(open) => setMessageDialog({ ...messageDialog, open })}
        type={messageDialog.type}
        title={messageDialog.title}
        message={messageDialog.message}
      />
        </>
    </div>
  );
}

