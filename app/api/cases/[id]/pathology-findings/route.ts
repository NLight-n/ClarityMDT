import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditPathologyFindings } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { z } from "zod";

const updatePathologyFindingsSchema = z.object({
  pathologyFindings: z.any(), // JSON field
});

const normalizeJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

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
      select: {
        id: true,
        patientName: true,
        mrn: true,
        pathologyFindings: true,
      },
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
    const previousValue = normalizeJson(existingCase.pathologyFindings);
    const nextValue = normalizeJson(validatedData.pathologyFindings);
    const hasChanged = JSON.stringify(previousValue) !== JSON.stringify(nextValue);

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

    if (hasChanged) {
      await createAuditLog({
        action: AuditAction.CASE_UPDATE,
        userId: user.id,
        caseId: id,
        details: {
          patientName: existingCase.patientName,
          mrn: existingCase.mrn,
          changes: {
            pathologyFindings: {
              old: previousValue,
              new: nextValue,
            },
          },
        },
        ipAddress: getIpAddress(request.headers),
      });
    }

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


