import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";

/**
 * GET /api/register/meetings-navigation - Get previous and next meetings relative to a given meeting
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const currentMeetingId = searchParams.get("meetingId");

    if (!currentMeetingId) {
      return NextResponse.json(
        { error: "meetingId is required" },
        { status: 400 }
      );
    }

    // Get current meeting date
    const currentMeeting = await prisma.meeting.findUnique({
      where: { id: currentMeetingId },
      select: { date: true },
    });

    if (!currentMeeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    const currentDate = currentMeeting.date;

    // Get previous meeting (before current date, exclude cancelled)
    const previousMeeting = await prisma.meeting.findFirst({
      where: {
        date: {
          lt: currentDate,
        },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        date: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    // Get next meeting (after current date, exclude cancelled)
    const nextMeeting = await prisma.meeting.findFirst({
      where: {
        date: {
          gt: currentDate,
        },
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        date: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    return NextResponse.json({
      previous: previousMeeting,
      next: nextMeeting,
    });
  } catch (error) {
    console.error("Error fetching meetings navigation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

