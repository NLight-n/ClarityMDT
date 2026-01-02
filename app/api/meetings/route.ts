import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { z } from "zod";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { NotificationType } from "@prisma/client";

const createMeetingSchema = z.object({
  date: z.string().min(1, "Date is required"),
  description: z.string().optional(),
});

/**
 * GET /api/meetings - List all meetings
 * All authenticated users can view meetings
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meetings = await prisma.meeting.findMany({
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
        attendees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                department: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            cases: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    return NextResponse.json(meetings);
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings - Create a new meeting
 * Only coordinators (admin/coordinator) can create meetings
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only coordinators can create meetings
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can create meetings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validationResult = createMeetingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { date, description } = validationResult.data;

    // Parse the date string to DateTime
    const meetingDate = new Date(date);

    // Validate that the date is valid
    if (isNaN(meetingDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    const newMeeting = await prisma.meeting.create({
      data: {
        date: meetingDate,
        description: description || null,
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
        _count: {
          select: {
            cases: true,
          },
        },
      },
    });

    // Create notifications for all users about the new meeting
    const allUsers = await prisma.user.findMany({
      select: { id: true },
    });

    if (allUsers.length > 0) {
      const meetingDateStr = meetingDate.toLocaleDateString();
      await createNotificationsForUsers(
        allUsers.map((u) => u.id),
        {
          type: NotificationType.MEETING_CREATED,
          title: "New Meeting Created",
          message: `A new MDT meeting has been scheduled for ${meetingDateStr}${description ? `: ${description}` : ""}`,
          meetingId: newMeeting.id,
        }
      );
    }

    return NextResponse.json(newMeeting, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error creating meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

