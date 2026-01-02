import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditOpinion } from "@/lib/permissions/accessControl";
import { z } from "zod";

const updateOpinionSchema = z.object({
  opinionText: z.string().min(1, "Opinion text is required").optional(),
  departmentId: z.string().min(1, "Department ID is required").optional(),
});

/**
 * PATCH /api/opinions/edit/[id] - Edit a specialist opinion
 * Rules:
 * - Only author/admin/coordinator can edit
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

    // Verify that the opinion exists
    const existingOpinion = await prisma.specialistsOpinion.findUnique({
      where: { id: id },
      select: {
        id: true,
        consultantId: true,
        departmentId: true,
      },
    });

    if (!existingOpinion) {
      return NextResponse.json({ error: "Opinion not found" }, { status: 404 });
    }

    // Check if user can edit this opinion
    const canEdit = await canEditOpinion(user, id);
    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit this opinion" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateOpinionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData: {
      opinionText?: string;
      departmentId?: string;
    } = {};

    if (validationResult.data.opinionText !== undefined) {
      updateData.opinionText = validationResult.data.opinionText;
    }

    if (validationResult.data.departmentId !== undefined) {
      // Verify that the department exists
      const department = await prisma.department.findUnique({
        where: { id: validationResult.data.departmentId },
        select: { id: true },
      });

      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 404 }
        );
      }

      updateData.departmentId = validationResult.data.departmentId;
    }

    // If no fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Update the opinion
    const updatedOpinion = await prisma.specialistsOpinion.update({
      where: { id: id },
      data: updateData,
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
        case: {
          select: {
            id: true,
            patientName: true,
          },
        },
      },
    });

    return NextResponse.json(updatedOpinion);
  } catch (error) {
    console.error("Error updating specialist opinion:", error);
    return NextResponse.json(
      { error: "Failed to update specialist opinion" },
      { status: 500 }
    );
  }
}

