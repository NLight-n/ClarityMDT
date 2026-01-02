import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin, revokeCoordinator } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";

// PATCH /api/users/[id]/revoke-coordinator - Revoke coordinator role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only Admin can revoke coordinator role
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

    // Check if user is a coordinator
    if (targetUser.role !== "Coordinator") {
      return NextResponse.json(
        { error: "User is not a Coordinator" },
        { status: 400 }
      );
    }

    // Revoke coordinator role
    await revokeCoordinator(id);

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

    // Create audit log for coordinator revocation
    await createAuditLog({
      action: AuditAction.COORDINATOR_REVOKE,
      userId: user.id,
      targetUserId: id,
      details: {
        targetUserName: updatedUser?.name,
        targetUserLoginId: updatedUser?.loginId,
        previousRole: "Coordinator",
        newRole: targetUser.previousRole || "Unknown",
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json({
      message: "Coordinator role revoked successfully",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Error revoking coordinator:", error);
    
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

