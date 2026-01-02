import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { AuditAction } from "@/lib/audit/logger";

/**
 * GET /api/audit-logs - Get audit logs with filtering and pagination
 * Only admins can access audit logs
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can view audit logs
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (action) {
      where.action = action;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // Add one day to include the entire end date
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Get total count for pagination
    const total = await prisma.auditLog.count({ where });

    // Get audit logs with user information and case information if applicable
    const auditLogs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            loginId: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    // Get case information for logs that have caseId
    const caseIds = auditLogs
      .filter((log) => log.caseId)
      .map((log) => log.caseId!)
      .filter((id, index, self) => self.indexOf(id) === index); // Unique IDs

    const cases = caseIds.length > 0
      ? await prisma.case.findMany({
          where: { id: { in: caseIds } },
          select: {
            id: true,
            patientName: true,
            mrn: true,
          },
        })
      : [];

    const caseMap = new Map(cases.map((c) => [c.id, c]));

    // Format the response
    const formattedLogs = auditLogs.map((log) => {
      const caseInfo = log.caseId ? caseMap.get(log.caseId) : null;
      return {
        id: log.id,
        action: log.action,
        userId: log.userId,
        userName: log.user.name,
        userLoginId: log.user.loginId,
        userRole: log.user.role,
        caseId: log.caseId,
        casePatientName: caseInfo?.patientName || null,
        caseMrn: caseInfo?.mrn || null,
        targetUserId: log.targetUserId,
        details: log.details ? JSON.parse(log.details) : null,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
      };
    });

    return NextResponse.json({
      logs: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

