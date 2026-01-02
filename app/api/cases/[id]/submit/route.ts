import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase, isCoordinator } from "@/lib/permissions/accessControl";
import { CaseStatus } from "@prisma/client";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { NotificationType } from "@prisma/client";

// POST /api/cases/[id]/submit - Submit a case
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

    // Only creator, coordinator, or admin can submit cases
    const canEdit = await canEditCase(user, id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "Only the creator, coordinator, or admin can submit cases" },
        { status: 403 }
      );
    }

    // Can only submit draft cases
    if (existingCase.status !== CaseStatus.DRAFT) {
      return NextResponse.json(
        { error: "Only draft cases can be submitted" },
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

      // Prevent submission to cancelled meetings
      if (meeting.status === "CANCELLED") {
        return NextResponse.json(
          { error: "Cannot submit case to a cancelled meeting" },
          { status: 400 }
        );
      }
    }

    // Update case status based on meeting assignment
    // Per requirements: assigned to meeting = SUBMITTED, unassigned = DRAFT
    const updateData: any = {};

    // Assign meeting if provided
    if (assignedMeetingId) {
      updateData.assignedMeetingId = assignedMeetingId;
      updateData.status = CaseStatus.SUBMITTED; // Assigned = SUBMITTED
      updateData.submittedAt = new Date();
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

    // Create audit log for case submission
    await createAuditLog({
      action: AuditAction.CASE_SUBMIT,
      userId: user.id,
      caseId: id,
      details: {
        patientName: updatedCase.patientName,
        previousStatus: existingCase.status,
        newStatus: CaseStatus.SUBMITTED,
      },
      ipAddress: getIpAddress(request.headers),
    });

    // Create notifications for all users about the submitted case
    if (assignedMeetingId && updatedCase.assignedMeeting) {
      const allUsers = await prisma.user.findMany({ select: { id: true } });
      const meetingDateStr = updatedCase.assignedMeeting.date.toLocaleDateString();
      await createNotificationsForUsers(
        allUsers.map((u) => u.id),
        {
          type: NotificationType.CASE_SUBMITTED,
          title: "Case Submitted to Meeting",
          message: `New case from ${updatedCase.presentingDepartment.name} submitted to MDT meeting on ${meetingDateStr}: ${updatedCase.patientName}`,
          meetingId: assignedMeetingId,
          caseId: id,
      }
      );
    }

    return NextResponse.json(updatedCase);
  } catch (error) {
    console.error("Error submitting case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

