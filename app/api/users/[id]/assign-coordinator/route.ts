import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin, assignCoordinator } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";

// PATCH /api/users/[id]/assign-coordinator - Assign coordinator role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin can assign coordinator role
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        previousRole: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is already a coordinator
    if (targetUser.role === "Coordinator") {
      return NextResponse.json(
        { error: "User is already a Coordinator" },
        { status: 400 }
      );
    }

    // Assign coordinator role
    await assignCoordinator(id);

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        loginId: true,
        role: true,
        previousRole: true,
        departmentId: true,
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

    // Create audit log for coordinator assignment
    await createAuditLog({
      action: AuditAction.COORDINATOR_ASSIGN,
      userId: user.id,
      targetUserId: id,
      details: {
        targetUserName: updatedUser?.name,
        targetUserLoginId: updatedUser?.loginId,
        previousRole: targetUser.role,
        newRole: "Coordinator",
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json({
      message: "Coordinator role assigned successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Error assigning coordinator:", error);
    
    if (error.message) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

