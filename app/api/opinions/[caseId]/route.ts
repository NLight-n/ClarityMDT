import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canAddOpinion, canViewCase } from "@/lib/permissions/accessControl";
import { z } from "zod";

const createOpinionSchema = z.object({
  opinionText: z.string().min(1, "Opinion text is required"),
  departmentId: z.string().min(1, "Department ID is required").optional(),
});

/**
 * POST /api/opinions/[caseId] - Add a specialist opinion
 * Rules:
 * - Only consultants can add opinions
 * - User must have a department
 * - Case must exist
 * - User must be able to view the case
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { caseId } = await params;

    // Check if user can add opinions (only consultants can add)
    if (!canAddOpinion(user)) {
      return NextResponse.json(
        { error: "Only consultants can add specialist opinions" },
        { status: 403 }
      );
    }

    // Verify that the case exists and user can view it
    const canView = await canViewCase(user, caseId);
    if (!canView) {
      return NextResponse.json(
        { error: "Case not found or access denied" },
        { status: 404 }
      );
    }

    // Verify case exists
    const caseRecord = await prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createOpinionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { opinionText, departmentId } = validationResult.data;

    // Ensure consultant has a department
    if (!user.departmentId) {
      return NextResponse.json(
        { error: "Consultant must belong to a department to add opinions" },
        { status: 400 }
      );
    }

    // Use the consultant's department (they can only add opinions from their own department)
    const finalDepartmentId = user.departmentId;

    // If departmentId was provided, verify it matches the consultant's department
    if (departmentId && departmentId !== user.departmentId) {
      return NextResponse.json(
        { error: "Consultants can only add opinions from their own department" },
        { status: 403 }
      );
    }

    // Verify that the department exists
    const department = await prisma.department.findUnique({
      where: { id: finalDepartmentId },
      select: { id: true },
    });

    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    // Create the opinion
    const opinion = await prisma.specialistsOpinion.create({
      data: {
        caseId: caseId,
        consultantId: user.id,
        departmentId: finalDepartmentId,
        opinionText,
      },
      include: {
        consultant: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(opinion, { status: 201 });
  } catch (error) {
    console.error("Error creating specialist opinion:", error);
    return NextResponse.json(
      { error: "Failed to create specialist opinion" },
      { status: 500 }
    );
  }
}

