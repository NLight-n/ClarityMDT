import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { CaseStatus } from "@prisma/client";

/**
 * GET /api/dashboard/stats - Get dashboard statistics
 * Returns statistics for the dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Get total cases count (excluding archived)
    const totalCases = await prisma.case.count({
      where: {
        status: {
          not: CaseStatus.ARCHIVED,
        },
      },
    });

    // Get pending cases count
    const pendingCases = await prisma.case.count({
      where: {
        status: CaseStatus.PENDING,
      },
    });

    // Get upcoming meetings count (next 30 days)
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const upcomingMeetings = await prisma.meeting.count({
      where: {
        date: {
          gte: now,
          lte: thirtyDaysFromNow,
        },
      },
    });

    // Get total users count
    const totalUsers = await prisma.user.count();

    return NextResponse.json({
      totalCases,
      pendingCases,
      upcomingMeetings,
      totalUsers,
    });
  } catch (error) {
    console.error("Error fetching dashboard statistics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

