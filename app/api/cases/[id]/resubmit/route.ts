import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase } from "@/lib/permissions/accessControl";
import { CaseStatus, NotificationType } from "@prisma/client";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";

// POST /api/cases/[id]/resubmit - Resubmit a case
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get the existing case
    const existingCase = await prisma.case.findUnique({
      where: { id },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Only creator, coordinator, or admin can resubmit cases
    const canEdit = await canEditCase(user, id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "Only the creator, coordinator, or admin can resubmit cases" },
        { status: 403 }
      );
    }

    // Can only resubmit reviewed cases
    if (existingCase.status !== CaseStatus.REVIEWED) {
      return NextResponse.json(
        { error: "Only reviewed cases can be resubmitted" },
        { status: 400 }
      );
    }

    // Get optional assignedMeetingId from request body
    const body = await request.json().catch(() => ({}));
    const { assignedMeetingId } = body;

    // Validate meeting if being assigned
    if (assignedMeetingId) {
      const meeting = await prisma.meeting.findUnique({
        where: { id: assignedMeetingId },
        select: { id: true, status: true },
      });

      if (!meeting) {
        return NextResponse.json(
          { error: "Meeting not found" },
          { status: 400 }
        );
      }

      // Prevent resubmission to cancelled meetings
      if (meeting.status === "CANCELLED") {
        return NextResponse.json(
          { error: "Cannot resubmit case to a cancelled meeting" },
          { status: 400 }
        );
      }
    }

    // Update case status based on meeting assignment
    // Per requirements: unassigned = DRAFT
    // RESUBMITTED status is kept when assigned to meeting
    const updateData: any = {};

    // Assign meeting if provided
    if (assignedMeetingId) {
      updateData.assignedMeetingId = assignedMeetingId;
      updateData.status = CaseStatus.RESUBMITTED; // Keep RESUBMITTED status when assigned
    } else {
      // No meeting assigned = DRAFT (per requirements: unassigned cases = DRAFT)
      updateData.status = CaseStatus.DRAFT;
    }

    const updatedCase = await prisma.case.update({
      where: { id },
      data: updateData,
      include: {
        presentingDepartment: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedMeeting: {
          select: {
            id: true,
            date: true,
            description: true,
          },
        },
      },
    });

    // Notify all users about the resubmitted case when assigned to a meeting
    if (assignedMeetingId && updatedCase.assignedMeeting) {
      const allUsers = await prisma.user.findMany({ select: { id: true } });
      const meetingDateStr = updatedCase.assignedMeeting.date.toLocaleDateString();
      await createNotificationsForUsers(
        allUsers.map((u) => u.id),
        {
          type: NotificationType.CASE_RESUBMITTED,
          title: "Case Resubmitted to Meeting",
          message: `Case from ${updatedCase.presentingDepartment.name} resubmitted to MDT meeting on ${meetingDateStr}: ${updatedCase.patientName}`,
          meetingId: assignedMeetingId,
          caseId: id,
        }
      );
    }

    return NextResponse.json(updatedCase);
  } catch (error) {
    console.error("Error resubmitting case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

