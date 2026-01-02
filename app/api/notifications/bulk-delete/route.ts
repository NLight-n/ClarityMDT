import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { z } from "zod";

const bulkDeleteSchema = z.object({
  notificationIds: z.array(z.string()).min(1, "At least one notification ID is required"),
});

/**
 * POST /api/notifications/bulk-delete - Delete multiple notifications
 * All authenticated users can delete their own notifications
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = bulkDeleteSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { notificationIds } = validationResult.data;

    // Verify all notifications belong to the user
    const notifications = await prisma.notification.findMany({
      where: {
        id: { in: notificationIds },
        userId: user.id,
      },
      select: { id: true },
    });

    if (notifications.length !== notificationIds.length) {
      return NextResponse.json(
        { error: "Some notifications not found or you don't have permission to delete them" },
        { status: 403 }
      );
    }

    // Delete all notifications
    await prisma.notification.deleteMany({
      where: {
        id: { in: notificationIds },
        userId: user.id,
      },
    });

    return NextResponse.json({
      message: `Successfully deleted ${notificationIds.length} notification(s)`,
      deletedCount: notificationIds.length,
    });
  } catch (error) {
    console.error("Error bulk deleting notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/bulk-delete - Delete all notifications for current user
 * All authenticated users can delete all their notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete all notifications for the user
    const result = await prisma.notification.deleteMany({
      where: {
        userId: user.id,
      },
    });

    return NextResponse.json({
      message: `Successfully deleted all notifications`,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Error deleting all notifications:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

