import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { z } from "zod";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { NotificationType } from "@prisma/client";

const cancelMeetingSchema = z.object({
  cancellationRemarks: z.string().optional(),
  reassignCases: z
    .object({
      caseId: z.string(),
      newMeetingId: z.string().nullable(),
    })
    .array()
    .optional(),
});

/**
 * POST /api/meetings/[id]/cancel - Mark a meeting as cancelled
 * Only coordinators (admin/coordinator) can cancel meetings
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only coordinators can cancel meetings
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can cancel meetings" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify that the meeting exists and get case count
    const existingMeeting = await prisma.meeting.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        date: true,
        description: true,
        cases: {
          where: {
            status: { in: ["SUBMITTED", "PENDING"] },
          },
          select: {
            id: true,
            status: true,
            presentingDepartmentId: true,
          },
        },
        _count: {
          select: {
            cases: true,
          },
        },
      },
    });

    if (!existingMeeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (existingMeeting.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Meeting is already cancelled" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = cancelMeetingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { cancellationRemarks, reassignCases } = validationResult.data;

    // Check if there are submitted/pending cases
    const submittedCases = existingMeeting.cases;
    if (submittedCases.length > 0) {
      // If reassignCases is not provided or incomplete, return error
      if (!reassignCases || reassignCases.length !== submittedCases.length) {
        return NextResponse.json(
          {
            error:
              "All submitted/pending cases must be reassigned before cancelling the meeting",
            cases: submittedCases.map((c) => ({
              id: c.id,
              status: c.status,
            })),
          },
          { status: 400 }
        );
      }

      // Verify all case IDs match
      const caseIds = submittedCases.map((c) => c.id).sort();
      const reassignCaseIds = reassignCases.map((r) => r.caseId).sort();
      if (
        caseIds.length !== reassignCaseIds.length ||
        !caseIds.every((id, idx) => id === reassignCaseIds[idx])
      ) {
        return NextResponse.json(
          { error: "Case reassignment does not match submitted cases" },
          { status: 400 }
        );
      }

      // Verify new meeting IDs are valid (if not null)
      const newMeetingIds = reassignCases
        .map((r) => r.newMeetingId)
        .filter((id): id is string => id !== null);
      if (newMeetingIds.length > 0) {
        const validMeetings = await prisma.meeting.findMany({
          where: {
            AND: [
              { id: { in: newMeetingIds } },
              { id: { not: id } }, // Can't reassign to the same meeting
            ],
          },
          select: { id: true },
        });

        if (validMeetings.length !== newMeetingIds.length) {
          return NextResponse.json(
            { error: "One or more target meeting IDs are invalid" },
            { status: 400 }
          );
        }
      }
    }

    // Preload case and meeting details for notifications
    const submittedCaseIds = submittedCases.map((c) => c.id);
    const caseDetails =
      submittedCaseIds.length > 0
        ? await prisma.case.findMany({
            where: { id: { in: submittedCaseIds } },
            select: {
              id: true,
              patientName: true,
              presentingDepartment: { select: { id: true, name: true } },
              createdById: true,
            },
          })
        : [];

    const reassignTargetMeetingIds =
      reassignCases
        ?.map((r) => r.newMeetingId)
        .filter((id): id is string => !!id) ?? [];

    const targetMeetings =
      reassignTargetMeetingIds.length > 0
        ? await prisma.meeting.findMany({
            where: { id: { in: reassignTargetMeetingIds } },
            select: { id: true, date: true, description: true },
          })
        : [];

    // Update meeting status and reassign cases
    const updatedMeeting = await prisma.$transaction(async (tx) => {
      // Reassign cases if provided
      if (reassignCases && reassignCases.length > 0) {
        for (const reassign of reassignCases) {
          await tx.case.update({
            where: { id: reassign.caseId },
            data: {
              assignedMeetingId: reassign.newMeetingId,
            },
          });
        }
      }

      // Update meeting status
      return await tx.meeting.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancellationRemarks: cancellationRemarks || null,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          attendees: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                  department: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              cases: true,
            },
          },
        },
      });
    });

    // Notify all users about the cancelled meeting
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    const meetingDateStr = existingMeeting.date
      ? existingMeeting.date.toLocaleDateString()
      : "the scheduled date";

    await createNotificationsForUsers(
      allUsers.map((u) => u.id),
      {
        type: NotificationType.MEETING_CANCELLED,
        title: "Meeting Cancelled",
        message: `MDT meeting on ${meetingDateStr} has been cancelled${existingMeeting.description ? `: ${existingMeeting.description}` : ""}`,
        meetingId: updatedMeeting.id,
      }
    );

    // Prepare department consultants map for postponed cases
    const deptIds = Array.from(
      new Set(caseDetails.map((c) => c.presentingDepartment.id))
    );
    const deptConsultants =
      deptIds.length > 0
        ? await prisma.user.findMany({
            where: { departmentId: { in: deptIds }, role: "Consultant" },
            select: { id: true, departmentId: true },
          })
        : [];
    const deptConsultantsMap = new Map<string, string[]>();
    for (const user of deptConsultants) {
      const list = deptConsultantsMap.get(user.departmentId ?? "") ?? [];
      list.push(user.id);
      deptConsultantsMap.set(user.departmentId ?? "", list);
    }

    const targetMeetingMap = new Map(
      targetMeetings.map((m) => [m.id, m])
    );

    // Notify per-case postponement when reassigned to a new meeting
    if (reassignCases && reassignCases.length > 0) {
      for (const reassign of reassignCases) {
        if (!reassign.newMeetingId) continue;
        const caseInfo = caseDetails.find((c) => c.id === reassign.caseId);
        const newMeeting = targetMeetingMap.get(reassign.newMeetingId);
        if (!caseInfo || !newMeeting) continue;

        const recipients = new Set<string>();
        if (caseInfo.createdById) {
          recipients.add(caseInfo.createdById);
        }
        const deptUsers = deptConsultantsMap.get(caseInfo.presentingDepartment.id);
        if (deptUsers) {
          deptUsers.forEach((id) => recipients.add(id));
        }

        if (recipients.size > 0) {
          const newMeetingDateStr = newMeeting.date.toLocaleDateString();
          await createNotificationsForUsers(Array.from(recipients), {
            type: NotificationType.CASE_POSTPONED,
            title: "Case Postponed to Next Meeting",
            message: `Case ${caseInfo.patientName} postponed to MDT meeting on ${newMeetingDateStr}${newMeeting.description ? `: ${newMeeting.description}` : ""}`,
            meetingId: newMeeting.id,
            caseId: caseInfo.id,
          });
        }
      }
    }

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error("Error cancelling meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

