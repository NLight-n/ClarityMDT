import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { z } from "zod";

const updateAttendeesSchema = z.object({
  attendeeIds: z.array(z.string()),
});

/**
 * GET /api/meetings/[id]/attendees - Get attendees for a meeting
 * All authenticated users can view attendees
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

    const attendees = await prisma.meetingAttendee.findMany({
      where: { meetingId: id },
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
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json(attendees);
  } catch (error) {
    console.error("Error fetching attendees:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/meetings/[id]/attendees - Update attendees for a meeting
 * Only coordinators (admin/coordinator) can update attendees
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

    // Only coordinators can update attendees
    if (!isCoordinator(user)) {
      return NextResponse.json(
        { error: "Only coordinators and admins can update attendees" },
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

    const body = await request.json();
    const validationResult = updateAttendeesSchema.safeParse(body);

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

    // Update attendees
    await prisma.$transaction(async (tx) => {
      // Delete existing attendees
      await tx.meetingAttendee.deleteMany({
        where: { meetingId: id },
      });

      // Create new attendees
      if (attendeeIds.length > 0) {
        await tx.meetingAttendee.createMany({
          data: attendeeIds.map((userId) => ({
            meetingId: id,
            userId,
          })),
        });
      }
    });

    // Fetch updated attendees
    const attendees = await prisma.meetingAttendee.findMany({
      where: { meetingId: id },
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
      orderBy: {
        createdAt: "asc",
      },
    });

    return NextResponse.json(attendees);
  } catch (error) {
    console.error("Error updating attendees:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

