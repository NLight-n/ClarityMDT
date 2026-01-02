"use client";

import { useState, useEffect } from "react";
import { MeetingCard } from "@/app/register/components/MeetingCard";
import { MeetingListItem } from "./components/MeetingListItem";
import { MeetingForm } from "@/app/register/components/MeetingForm";
import { AttendeesList } from "./components/AttendeesList";
import { CompleteMeetingDialog } from "./components/CompleteMeetingDialog";
import { CancelMeetingDialog } from "./components/CancelMeetingDialog";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { isCoordinator } from "@/lib/permissions/client";
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

interface Meeting {
  id: string;
  date: string;
  description: string | null;
  status?: string;
  cancellationRemarks?: string | null;
  createdBy: {
    id: string;
    name: string;
  };
  attendees?: Array<{
    id: string;
    user: {
      id: string;
      name: string;
      role: string;
      department: {
        id: string;
        name: string;
      } | null;
    };
  }>;
  cases?: Array<{
    id: string;
    patientName: string;
    mrn: string | null;
    status: string;
  }>;
  _count: {
    cases: number;
  };
}

export default function MeetingsPage() {
  const { data: session } = useSession();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [deletingMeeting, setDeletingMeeting] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [completingMeetingId, setCompletingMeetingId] = useState<string | null>(null);
  const [cancellingMeeting, setCancellingMeeting] = useState<Meeting | null>(null);
  const [viewingAttendeesMeetingId, setViewingAttendeesMeetingId] = useState<string | null>(null);

  const user = session?.user
    ? {
        id: session.user.id,
        role: session.user.role,
        departmentId: session.user.departmentId,
      }
    : null;

  const canManageMeetings = user && isCoordinator(user);

  useEffect(() => {
    loadMeetings();
  }, []);

  const loadMeetings = async () => {
    try {
      const response = await fetch("/api/meetings");
      if (response.ok) {
        const data = await response.json();
        setMeetings(data);
      }
    } catch (error) {
      console.error("Error loading meetings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (meeting?: Meeting) => {
    setEditingMeeting(meeting || null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingMeeting(null);
  };

  const handleDeleteClick = (meetingId: string) => {
    setDeletingMeeting(meetingId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingMeeting) return;

    try {
      const response = await fetch(`/api/meetings/${deletingMeeting}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadMeetings();
      } else {
        const error = await response.json();
        alert(error.error || "Failed to delete meeting");
      }
    } catch (error) {
      console.error("Error deleting meeting:", error);
      alert("An error occurred. Please try again.");
    } finally {
      setIsDeleteDialogOpen(false);
      setDeletingMeeting(null);
    }
  };

  const handleCompleteClick = (meetingId: string) => {
    setCompletingMeetingId(meetingId);
  };

  const handleCancelClick = async (meetingId: string) => {
    // Load meeting details with cases
    try {
      const response = await fetch(`/api/meetings/${meetingId}`);
      if (response.ok) {
        const meeting = await response.json();
        setCancellingMeeting(meeting);
      } else {
        alert("Failed to load meeting details");
      }
    } catch (error) {
      console.error("Error loading meeting:", error);
      alert("An error occurred. Please try again.");
    }
  };

  const handleViewAttendees = (meetingId: string) => {
    setViewingAttendeesMeetingId(meetingId);
  };

  // Separate upcoming and past meetings
  const now = new Date();
  const upcomingMeetings = meetings.filter(
    (meeting) => new Date(meeting.date) >= now
  );
  const pastMeetings = meetings.filter(
    (meeting) => new Date(meeting.date) < now
  );

  // Check if meeting can be deleted (only if case count is 0 and user is coordinator/admin)
  const canDeleteMeeting = (meeting: Meeting) => {
    return canManageMeetings && meeting._count.cases === 0;
  };

  // Sort upcoming (ascending) and past (descending)
  upcomingMeetings.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  pastMeetings.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Meetings</h1>
            <p className="text-muted-foreground">
              View and manage all MDT meetings
            </p>
          </div>
          {canManageMeetings && (
            <Button onClick={() => handleOpenForm()}>
              <Plus className="mr-2 h-4 w-4" />
              New Meeting
            </Button>
          )}
        </div>

        {/* Upcoming Meetings */}
        {upcomingMeetings.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Upcoming Meetings</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  onEdit={
                    canManageMeetings && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED"
                      ? () => handleOpenForm(meeting)
                      : undefined
                  }
                  onDelete={
                    canDeleteMeeting(meeting)
                      ? () => handleDeleteClick(meeting.id)
                      : undefined
                  }
                  onComplete={
                    canManageMeetings && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED"
                      ? () => handleCompleteClick(meeting.id)
                      : undefined
                  }
                  onCancel={
                    canManageMeetings && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED"
                      ? () => handleCancelClick(meeting.id)
                      : undefined
                  }
                  onViewAttendees={undefined}
                  canEdit={!!canManageMeetings}
                  isPast={false}
                />
              ))}
            </div>
          </div>
        )}

        {/* Past Meetings - List Format */}
        {pastMeetings.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Past Meetings</h2>
            <div className="space-y-2">
              {pastMeetings.map((meeting) => (
                <MeetingListItem
                  key={meeting.id}
                  meeting={meeting}
                  onEdit={
                    canManageMeetings && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED"
                      ? () => handleOpenForm(meeting)
                      : undefined
                  }
                  onComplete={
                    canManageMeetings && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED"
                      ? () => handleCompleteClick(meeting.id)
                      : undefined
                  }
                  onCancel={
                    canManageMeetings && meeting.status !== "COMPLETED" && meeting.status !== "CANCELLED"
                      ? () => handleCancelClick(meeting.id)
                      : undefined
                  }
                  onViewAttendees={
                    meeting.status === "COMPLETED"
                      ? () => handleViewAttendees(meeting.id)
                      : undefined
                  }
                  canEdit={!!canManageMeetings}
                />
              ))}
            </div>
          </div>
        )}

        {meetings.length === 0 && (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-muted-foreground">No meetings found.</p>
          </div>
        )}
      </div>

      {/* Meeting Form Modal */}
      {canManageMeetings && (
        <MeetingForm
          open={isFormOpen}
          onOpenChange={handleCloseForm}
          meeting={editingMeeting || undefined}
          onSuccess={loadMeetings}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this meeting? All cases assigned
              to this meeting will be unassigned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Meeting Dialog */}
      {completingMeetingId && (
        <CompleteMeetingDialog
          open={!!completingMeetingId}
          onOpenChange={(open) => {
            if (!open) setCompletingMeetingId(null);
          }}
          meetingId={completingMeetingId}
          onSuccess={loadMeetings}
        />
      )}

      {/* Cancel Meeting Dialog */}
      {cancellingMeeting && (
        <CancelMeetingDialog
          open={!!cancellingMeeting}
          onOpenChange={(open) => {
            if (!open) setCancellingMeeting(null);
          }}
          meetingId={cancellingMeeting.id}
          caseCount={cancellingMeeting._count.cases}
          submittedCases={cancellingMeeting.cases?.filter(
            (c) => c.status === "SUBMITTED" || c.status === "PENDING"
          )}
          onSuccess={loadMeetings}
        />
      )}

      {/* Attendees List Dialog */}
      {viewingAttendeesMeetingId && (
        <AttendeesList
          open={!!viewingAttendeesMeetingId}
          onOpenChange={(open) => {
            if (!open) setViewingAttendeesMeetingId(null);
          }}
          meetingId={viewingAttendeesMeetingId}
          canEdit={!!canManageMeetings}
          onUpdate={loadMeetings}
        />
      )}
    </>
  );
}
