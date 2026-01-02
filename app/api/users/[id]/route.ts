import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin, isCoordinator } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  loginId: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().nullable().optional(),
});

// PATCH /api/users/[id] - Update a user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin and Coordinator can update users
    if (!isAdmin(user) && !isCoordinator(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const validatedData = updateUserSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if loginId is being changed and if it's already taken
    if (validatedData.loginId && validatedData.loginId !== existingUser.loginId) {
      const loginIdExists = await prisma.user.findUnique({
        where: { loginId: validatedData.loginId },
      });

      if (loginIdExists) {
        return NextResponse.json(
          { error: "Login ID already exists" },
          { status: 400 }
        );
      }
    }

    // Validate departmentId if provided
    if (validatedData.departmentId !== undefined && validatedData.departmentId !== null) {
      const department = await prisma.department.findUnique({
        where: { id: validatedData.departmentId },
      });

      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 400 }
        );
      }
    }

    // Coordinators cannot change roles to Admin or Coordinator
    if (!isAdmin(user) && validatedData.role !== undefined) {
      if (validatedData.role === Role.Admin || validatedData.role === Role.Coordinator) {
        return NextResponse.json(
          { error: "Coordinators cannot assign Admin or Coordinator roles" },
          { status: 403 }
        );
      }
      // Also prevent changing existing Admin or Coordinator users
      if (existingUser.role === Role.Admin || existingUser.role === Role.Coordinator) {
        return NextResponse.json(
          { error: "Coordinators cannot modify Admin or Coordinator users" },
          { status: 403 }
        );
      }
    }

    // Prevent password changes for Admin users (unless current user is also Admin)
    if (validatedData.password && existingUser.role === Role.Admin && !isAdmin(user)) {
      return NextResponse.json(
        { error: "Cannot change password for Admin users" },
        { status: 403 }
      );
    }

    // Prevent password changes for self
    if (validatedData.password && id === user.id) {
      return NextResponse.json(
        { error: "Cannot change your own password here. Please use the Profile page." },
        { status: 400 }
      );
    }

    // Validate department requirement based on role
    const finalRole = validatedData.role ?? existingUser.role;
    const finalDepartmentId = validatedData.departmentId !== undefined 
      ? validatedData.departmentId 
      : existingUser.departmentId;

    if (
      (finalRole === Role.Consultant || finalRole === Role.Coordinator) &&
      !finalDepartmentId
    ) {
      return NextResponse.json(
        { error: "Department is required for Consultant and Coordinator roles" },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.loginId !== undefined) updateData.loginId = validatedData.loginId;
    if (validatedData.role !== undefined) updateData.role = validatedData.role;
    if (validatedData.departmentId !== undefined) {
      updateData.departmentId = validatedData.departmentId;
    }

    // Hash password if provided (password reset for other users by Admin/Coordinator)
    if (validatedData.password) {
      updateData.passwordHash = await bcrypt.hash(validatedData.password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        loginId: true,
        role: true,
        previousRole: true,
        departmentId: true,
        telegramId: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    // Log audit entry
    await createAuditLog({
      action: AuditAction.USER_UPDATE,
      userId: user.id,
      targetUserId: id,
      details: {
        userName: updatedUser.name,
        loginId: updatedUser.loginId,
        previousRole: existingUser.role,
        newRole: updatedUser.role,
        previousDepartmentId: existingUser.departmentId,
        newDepartmentId: updatedUser.departmentId,
        changes: Object.keys(updateData),
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] - Delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin can delete users
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Prevent deleting yourself
    if (id === user.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Log audit entry before deletion
    await createAuditLog({
      action: AuditAction.USER_DELETE,
      userId: user.id,
      targetUserId: id,
      details: {
        userName: existingUser.name,
        loginId: existingUser.loginId,
        role: existingUser.role,
        departmentId: existingUser.departmentId,
      },
      ipAddress: getIpAddress(request.headers),
    });

    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

