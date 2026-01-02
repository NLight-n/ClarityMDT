import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase, isCoordinator } from "@/lib/permissions/accessControl";
import { CaseStatus } from "@prisma/client";

/**
 * POST /api/cases/[id]/unassign-meeting - Unassign a case from its meeting
 * Only coordinators/admins or the case creator can unassign meetings
 * Sets case status to SUBMITTED and removes assignedMeetingId
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

    const { id } = await params;

    // Get the existing case
    const existingCase = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        assignedMeetingId: true,
        createdById: true,
        status: true,
      },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check if case has an assigned meeting
    if (!existingCase.assignedMeetingId) {
      return NextResponse.json(
        { error: "Case is not assigned to any meeting" },
        { status: 400 }
      );
    }

    // Check permissions: Only coordinator/admin or case creator can unassign
    const isCaseCreator = existingCase.createdById === user.id;
    if (!isCoordinator(user) && !isCaseCreator) {
      return NextResponse.json(
        { error: "Only coordinators, admins, or the case creator can unassign meetings" },
        { status: 403 }
      );
    }

    // Unassign the meeting and set status to DRAFT
    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        assignedMeetingId: null,
        status: CaseStatus.DRAFT, // Reset status to DRAFT when unassigned
      },
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

    return NextResponse.json(updatedCase);
  } catch (error) {
    console.error("Error unassigning meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


