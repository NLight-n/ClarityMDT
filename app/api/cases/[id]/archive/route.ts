import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { CaseStatus } from "@prisma/client";

// POST /api/cases/[id]/archive - Archive a case
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only coordinators/admins can archive cases
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators or admins can archive cases" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Get the existing case
    const existingCase = await prisma.case.findUnique({
      where: { id },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check if already archived
    if (existingCase.status === CaseStatus.ARCHIVED) {
      return NextResponse.json(
        { error: "Case is already archived" },
        { status: 400 }
      );
    }

    // Update case status to ARCHIVED and set archivedAt
    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        status: CaseStatus.ARCHIVED,
        archivedAt: new Date(),
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
    console.error("Error archiving case:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

