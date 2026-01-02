import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { z } from "zod";

const updateDepartmentSchema = z.object({
  name: z.string().min(1, "Department name is required").optional(),
});

// PATCH /api/departments/[id] - Update a department
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin can update departments
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateDepartmentSchema.parse(body);

    // Check if department exists
    const existingDepartment = await prisma.department.findUnique({
      where: { id },
    });

    if (!existingDepartment) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    // Check if new name already exists (if name is being changed)
    if (validatedData.name && validatedData.name !== existingDepartment.name) {
      const nameExists = await prisma.department.findUnique({
        where: { name: validatedData.name },
      });

      if (nameExists) {
        return NextResponse.json(
          { error: "Department name already exists" },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    if (validatedData.name !== undefined) {
      updateData.name = validatedData.name;
    }

    const updatedDepartment = await prisma.department.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            cases: true,
          },
        },
      },
    });

    const formattedDepartment = {
      id: updatedDepartment.id,
      name: updatedDepartment.name,
      userCount: updatedDepartment._count.users,
      caseCount: updatedDepartment._count.cases,
      createdAt: updatedDepartment.createdAt,
      updatedAt: updatedDepartment.updatedAt,
    };

    // Log audit entry
    await createAuditLog({
      action: AuditAction.DEPARTMENT_UPDATE,
      userId: user.id,
      details: {
        departmentId: id,
        previousName: existingDepartment.name,
        newName: updatedDepartment.name,
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json(formattedDepartment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating department:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/departments/[id] - Delete a department
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin can delete departments
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check if department exists
    const existingDepartment = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            cases: true,
          },
        },
      },
    });

    if (!existingDepartment) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    // Check if department has users
    if (existingDepartment._count.users > 0) {
      return NextResponse.json(
        { error: "Cannot delete department with existing users" },
        { status: 400 }
      );
    }

    // Log audit entry before deletion
    await createAuditLog({
      action: AuditAction.DEPARTMENT_DELETE,
      userId: user.id,
      details: {
        departmentId: id,
        departmentName: existingDepartment.name,
        userCount: existingDepartment._count.users,
        caseCount: existingDepartment._count.cases,
      },
      ipAddress: getIpAddress(request.headers),
    });

    await prisma.department.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Department deleted successfully" });
  } catch (error) {
    console.error("Error deleting department:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

