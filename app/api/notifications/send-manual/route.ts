import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { z } from "zod";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { NotificationType } from "@prisma/client";

const sendManualNotificationSchema = z.object({
  title: z.string().min(1, "Title is required"),
  message: z.string().min(1, "Message is required"),
  recipientType: z.enum(["everyone", "department", "individual"]),
  departmentId: z.string().optional(),
  userId: z.string().optional(),
});

/**
 * POST /api/notifications/send-manual - Send manual notification
 * Only coordinators (admin/coordinator) can send manual notifications
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only coordinators can send manual notifications
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can send manual notifications" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validationResult = sendManualNotificationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { title, message, recipientType, departmentId, userId } = validationResult.data;

    let recipientIds: string[] = [];

    if (recipientType === "everyone") {
      // Get all users
      const allUsers = await prisma.user.findMany({
        select: { id: true },
      });
      recipientIds = allUsers.map((u) => u.id);
    } else if (recipientType === "department") {
      if (!departmentId) {
        return NextResponse.json(
          { error: "Department ID is required for department notifications" },
          { status: 400 }
        );
      }

      // Verify department exists
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
      });

      if (!department) {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 404 }
        );
      }

      // Get all users in the department
      const departmentUsers = await prisma.user.findMany({
        where: { departmentId },
        select: { id: true },
      });
      recipientIds = departmentUsers.map((u) => u.id);
    } else if (recipientType === "individual") {
      if (!userId) {
        return NextResponse.json(
          { error: "User ID is required for individual notifications" },
          { status: 400 }
        );
      }

      // Verify user exists
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }

      recipientIds = [userId];
    }

    if (recipientIds.length === 0) {
      return NextResponse.json(
        { error: "No recipients found" },
        { status: 400 }
      );
    }

    // Create notifications for all recipients
    await createNotificationsForUsers(recipientIds, {
      type: NotificationType.MANUAL_NOTIFICATION,
      title,
      message,
    });

    return NextResponse.json({
      message: `Notification sent to ${recipientIds.length} recipient(s)`,
      recipientCount: recipientIds.length,
    });
  } catch (error) {
    console.error("Error sending manual notification:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

