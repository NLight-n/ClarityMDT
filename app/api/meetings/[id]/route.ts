import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { z } from "zod";
import { createNotificationsForUsers } from "@/lib/notifications/createNotification";
import { NotificationType } from "@prisma/client";

const updateMeetingSchema = z.object({
  date: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

/**
 * GET /api/meetings/[id] - Get a single meeting
 * All authenticated users can view meetings
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id },
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
        cases: {
          select: {
            id: true,
            patientName: true,
            mrn: true,
            status: true,
          },
        },
        _count: {
          select: {
            cases: true,
          },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json(meeting);
  } catch (error) {
    console.error("Error fetching meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/meetings/[id] - Update a meeting
 * Only coordinators (admin/coordinator) can update meetings
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

    // Only coordinators can update meetings
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can update meetings" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify that the meeting exists
    const existingMeeting = await prisma.meeting.findUnique({
      where: { id },
      select: { id: true, date: true, description: true },
    });

    if (!existingMeeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const body = await request.json();
    const validationResult = updateMeetingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const updateData: {
      date?: Date;
      description?: string | null;
    } = {};

    if (validationResult.data.date !== undefined) {
      const meetingDate = new Date(validationResult.data.date);
      if (isNaN(meetingDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format" },
          { status: 400 }
        );
      }
      updateData.date = meetingDate;
    }

    if (validationResult.data.description !== undefined) {
      updateData.description = validationResult.data.description;
    }

    // If no fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id },
      data: updateData,
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
    });

    // Notify all users if the meeting date was changed
    if (updateData.date && existingMeeting.date && updatedMeeting.date) {
      const allUsers = await prisma.user.findMany({ select: { id: true } });
      const oldDateStr = existingMeeting.date.toLocaleDateString();
      const newDateStr = updatedMeeting.date.toLocaleDateString();

      await createNotificationsForUsers(
        allUsers.map((u) => u.id),
        {
          type: NotificationType.MEETING_UPDATED,
          title: "Meeting Date Changed",
          message: `MDT meeting date changed from ${oldDateStr} to ${newDateStr}${updatedMeeting.description ? `: ${updatedMeeting.description}` : ""}`,
          meetingId: updatedMeeting.id,
        }
      );
    }

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/meetings/[id] - Delete a meeting
 * Only coordinators (admin/coordinator) can delete meetings
 * Note: Cases are connected via assignedMeetingId, so we need to handle that
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only coordinators can delete meetings
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can delete meetings" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify that the meeting exists
    const existingMeeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            cases: true,
          },
        },
      },
    });

    if (!existingMeeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Check if there are cases assigned to this meeting
    if (existingMeeting._count.cases > 0) {
      // Unassign all cases from this meeting before deleting
      await prisma.case.updateMany({
        where: { assignedMeetingId: id },
        data: { assignedMeetingId: null },
      });
    }

    // Delete the meeting
    await prisma.meeting.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

