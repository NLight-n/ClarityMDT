import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { deleteFolder } from "@/lib/minio";
import { Role } from "@prisma/client";

/**
 * DELETE /api/mpr/delete/[jobId]
 * 
 * Deletes a specific MPR job and its derived DICOM files from MinIO.
 * Used by the OHIF overlay to let users remove individual MPR results.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role check: Admin, Coordinator, Consultant
    const allowedRoles: Role[] = [Role.Admin, Role.Coordinator, Role.Consultant];
    if (!allowedRoles.includes(currentUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { jobId } = await params;

    const job = await prisma.mprJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Delete derived DICOM files from MinIO
    try {
      const folderPrefix = `cases/${job.caseId}/dicom/mpr/${job.id}/`;
      await deleteFolder(folderPrefix);
    } catch (err) {
      console.error(`Failed to delete MPR files for job ${jobId}:`, err);
      // Continue with DB deletion even if MinIO cleanup fails
    }

    // Delete the job record from database
    await prisma.mprJob.delete({ where: { id: jobId } });

    return NextResponse.json({
      ok: true,
      message: "MPR job and derived files deleted",
    });
  } catch (error) {
    console.error("Error deleting MPR job:", error);
    return NextResponse.json(
      { error: "Failed to delete MPR job" },
      { status: 500 }
    );
  }
}
