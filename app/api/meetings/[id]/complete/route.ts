import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { z } from "zod";

const completeMeetingSchema = z.object({
  attendeeIds: z.array(z.string()).min(1, "At least one attendee is required"),
});

/**
 * POST /api/meetings/[id]/complete - Mark a meeting as completed
 * Only coordinators (admin/coordinator) can complete meetings
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only coordinators can complete meetings
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can complete meetings" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Verify that the meeting exists
    const existingMeeting = await prisma.meeting.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingMeeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Check current status
    const currentMeeting = await prisma.meeting.findUnique({
      where: { id },
      select: { status: true },
    });

    if (currentMeeting?.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Meeting is already completed" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = completeMeetingSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation error", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { attendeeIds } = validationResult.data;

    // Verify all attendee IDs are valid users (consultants or coordinators)
    const validUsers = await prisma.user.findMany({
      where: {
        id: { in: attendeeIds },
        role: { in: ["Consultant", "Coordinator", "Admin"] },
      },
      select: { id: true },
    });

    if (validUsers.length !== attendeeIds.length) {
      return NextResponse.json(
        { error: "One or more attendee IDs are invalid" },
        { status: 400 }
      );
    }

    // Update meeting status and set attendees
    const updatedMeeting = await prisma.$transaction(async (tx) => {
      // Delete existing attendees
      await tx.meetingAttendee.deleteMany({
        where: { meetingId: id },
      });

      // Create new attendees
      await tx.meetingAttendee.createMany({
        data: attendeeIds.map((userId) => ({
          meetingId: id,
          userId,
        })),
      });

      // Update meeting status
      return await tx.meeting.update({
        where: { id },
        data: {
          status: "COMPLETED",
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
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
    });

    return NextResponse.json(updatedMeeting);
  } catch (error) {
    console.error("Error completing meeting:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

