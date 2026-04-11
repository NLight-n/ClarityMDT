import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { deleteFolder } from "@/lib/minio";
import { Role } from "@prisma/client";

/**
 * POST /api/mpr/cleanup
 * 
 * Cleans up expired MPR jobs and their derived DICOM files from MinIO.
 * Can be called manually by Admin or via a cron job.
 * 
 * Query params:
 *   ?force=true — Delete ALL completed jobs regardless of expiry
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin and Coordinator only (matches Storage tab access)
    const allowedRoles: Role[] = [Role.Admin, Role.Coordinator];
    if (!allowedRoles.includes(currentUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const force = request.nextUrl.searchParams.get("force") === "true";

    // Find expired jobs
    const whereClause: any = {
      status: "COMPLETED",
    };

    if (!force) {
      whereClause.expiresAt = {
        lte: new Date(),
        not: null,
      };
    }

    const expiredJobs = await prisma.mprJob.findMany({
      where: whereClause,
      select: {
        id: true,
        caseId: true,
        derivedSeriesKeys: true,
      },
    });

    let deletedCount = 0;
    let errorCount = 0;

    for (const job of expiredJobs) {
      try {
        // Delete derived DICOM files from MinIO
        const folderPrefix = `cases/${job.caseId}/dicom/mpr/${job.id}/`;
        await deleteFolder(folderPrefix);

        // Delete job record from database
        await prisma.mprJob.delete({ where: { id: job.id } });
        deletedCount++;
      } catch (err) {
        console.error(`Failed to cleanup MPR job ${job.id}:`, err);
        errorCount++;
      }
    }

    // Also clean up FAILED jobs older than 24 hours
    const failedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deletedFailed = await prisma.mprJob.deleteMany({
      where: {
        status: "FAILED",
        createdAt: { lte: failedCutoff },
      },
    });

    return NextResponse.json({
      message: "Cleanup complete",
      expiredJobsDeleted: deletedCount,
      failedJobsDeleted: deletedFailed.count,
      errors: errorCount,
    });
  } catch (error) {
    console.error("Error during MPR cleanup:", error);
    return NextResponse.json(
      { error: "Failed to run cleanup" },
      { status: 500 }
    );
  }
}
