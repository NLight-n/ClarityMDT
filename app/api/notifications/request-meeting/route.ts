import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { z } from "zod";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { NotificationType } from "@prisma/client";

const requestMeetingSchema = z.object({
  remarks: z.string().optional(),
});

/**
 * POST /api/notifications/request-meeting - Request MDT meeting
 * All authenticated users can request meetings
 * Notification is sent to all coordinators and admins
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validationResult = requestMeetingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { remarks } = validationResult.data;

    // Get user details for the notification message
    const userDetails = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        department: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!userDetails) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get all coordinators and admins
    const coordinatorsAndAdmins = await prisma.user.findMany({
      where: {
        role: {
          in: ["Coordinator", "Admin"],
        },
      },
      select: { id: true },
    });

    if (coordinatorsAndAdmins.length === 0) {
      return NextResponse.json(
        { error: "No coordinators or admins found" },
        { status: 400 }
      );
    }

    const recipientIds = coordinatorsAndAdmins.map((u) => u.id);

    // Create notification message
    const departmentName = userDetails.department?.name || "Unknown Department";
    const message = remarks
      ? `${userDetails.name} from ${departmentName} has requested an MDT meeting.\n\nRemarks: ${remarks}`
      : `${userDetails.name} from ${departmentName} has requested an MDT meeting.`;

    // Create notifications for all coordinators and admins
    await createNotificationsForUsers(recipientIds, {
      type: NotificationType.MEETING_REQUEST,
      title: "MDT Meeting Request",
      message,
    });

    return NextResponse.json({
      message: "Meeting request sent to coordinators and admins",
      recipientCount: recipientIds.length,
    });
  } catch (error) {
    console.error("Error requesting meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

