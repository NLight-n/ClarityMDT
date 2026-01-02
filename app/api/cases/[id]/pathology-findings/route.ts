import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditPathologyFindings } from "@/lib/permissions/accessControl";
import { z } from "zod";

const updatePathologyFindingsSchema = z.object({
  pathologyFindings: z.any(), // JSON field
});

/**
 * PATCH /api/cases/[id]/pathology-findings - Update pathology findings
 * Only coordinators, admins, or pathology consultants can update
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
    const canEdit = await canEditPathologyFindings(user, id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit pathology findings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = updatePathologyFindingsSchema.parse(body);

    // Update pathology findings
    const updatedCase = await prisma.case.update({
      where: { id },
      data: {
        pathologyFindings: validatedData.pathologyFindings,
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

    console.error("Error updating pathology findings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


