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
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

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
    const thirtyDaysFromNow = new Date(startOfToday);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const upcomingMeetings = await prisma.meeting.count({
      where: {
        date: {
          gte: startOfToday,
          lte: thirtyDaysFromNow,
        },
      },
    });

    // Get total users count
    const totalUsers = await prisma.user.count();

    // Get total storage space used by files
    const storageStats = await prisma.caseAttachment.aggregate({
      _sum: {
        fileSize: true,
      },
    });
    
    // Default max storage to 500GB constraint
    const totalStorageUsed = storageStats._sum.fileSize || 0;
    const totalStorageLimit = 500 * 1024 * 1024 * 1024; // 500GB

    return NextResponse.json({
      totalCases,
      pendingCases,
      upcomingMeetings,
      totalUsers,
      totalStorageUsed,
      totalStorageLimit,
    });
  } catch (error) {
    console.error("Error fetching dashboard statistics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

