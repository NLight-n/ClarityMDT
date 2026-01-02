import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditRadiologyFindings } from "@/lib/permissions/accessControl";
import { z } from "zod";

const updateRadiologyFindingsSchema = z.object({
  radiologyFindings: z.any(), // JSON field
});

/**
 * PATCH /api/cases/[id]/radiology-findings - Update radiology findings
 * Only coordinators, admins, or radiology consultants can update
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if case exists
    const existingCase = await prisma.case.findUnique({
      where: { id },
    });

    if (!existingCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Check permissions
    const canEdit = await canEditRadiologyFindings(user, id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit radiology findings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = updateRadiologyFindingsSchema.parse(body);

    // Update radiology findings
    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        radiologyFindings: validatedData.radiologyFindings,
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating radiology findings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


