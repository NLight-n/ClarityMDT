import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getFileStream } from "@/lib/minio";
import { Role } from "@prisma/client";

/**
 * POST /api/mpr/trigger
 * 
 * Triggers server-side MPR processing for a specific series in a DICOM bundle.
 * 
 * Body: { attachmentId, caseId, seriesInstanceUID }
 * 
 * Returns existing job if already processed (cache hit) or in progress (dedup).
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role gating: Admin, Coordinator, Consultant only
    const allowedRoles: Role[] = [Role.Admin, Role.Coordinator, Role.Consultant];
    if (!allowedRoles.includes(currentUser.role)) {
      return NextResponse.json(
        { error: "MPR generation is restricted to Admin, Coordinator, and Consultant roles" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { attachmentId, caseId, seriesInstanceUID } = body;

    if (!attachmentId || !caseId || !seriesInstanceUID) {
      return NextResponse.json(
        { error: "Missing required fields: attachmentId, caseId, seriesInstanceUID" },
        { status: 400 }
      );
    }

    // Check if MPR is enabled
    if (process.env.MPR_ENABLED === "false") {
      return NextResponse.json(
        { error: "Server-side MPR processing is disabled" },
        { status: 503 }
      );
    }

    // Verify case exists and check permissions
    const canView = await canViewCase(currentUser, caseId);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the attachment
    const attachment = await prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Check for existing MPR job (cache hit or dedup)
    const existingJob = await prisma.mprJob.findUnique({
      where: {
        attachmentId_seriesInstanceUID: {
          attachmentId,
          seriesInstanceUID,
        },
      },
    });

    if (existingJob) {
      if (existingJob.status === "COMPLETED") {
        // Cache hit — already processed
        return NextResponse.json({
          jobId: existingJob.id,
          status: "COMPLETED",
          message: "MPR already processed",
        });
      }

      if (existingJob.status === "QUEUED" || existingJob.status === "PROCESSING") {
        // Already in progress — dedup
        return NextResponse.json({
          jobId: existingJob.id,
          status: existingJob.status,
          progress: existingJob.progress,
          message: "MPR job already in progress",
        });
      }

      // FAILED — delete old job and re-create
      await prisma.mprJob.delete({ where: { id: existingJob.id } });
    }

    // Parse manifest to get storage keys for the requested series
    const stream = await getFileStream(attachment.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const manifest = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    let storageKeys: string[] = [];
    let seriesDescription = "";
    let studyInstanceUID = "";

    if (manifest.studies && Array.isArray(manifest.studies)) {
      for (const study of manifest.studies) {
        studyInstanceUID = study.StudyInstanceUID || "";
        if (study.series && Array.isArray(study.series)) {
          for (const series of study.series) {
            if (series.SeriesInstanceUID === seriesInstanceUID) {
              seriesDescription = series.SeriesDescription || "";
              if (series.instances && Array.isArray(series.instances)) {
                storageKeys = series.instances
                  .map((inst: any) => inst.url)
                  .filter((url: string) => url && !url.startsWith("wadouri:"));
              }
              break;
            }
          }
        }
      }
    }

    if (storageKeys.length < 3) {
      return NextResponse.json(
        { error: "Series has too few instances for MPR processing (need at least 3)" },
        { status: 400 }
      );
    }

    // Calculate expiry date
    const expiryDays = parseInt(process.env.MPR_RESULT_EXPIRY_DAYS || "7", 10);
    const expiresAt = expiryDays > 0
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      : null;

    // Create MprJob record
    const mprJob = await prisma.mprJob.create({
      data: {
        caseId,
        attachmentId,
        seriesInstanceUID,
        seriesDescription,
        status: "QUEUED",
        planes: ["sagittal", "coronal"],
        progress: 0,
        instanceCount: storageKeys.length,
        expiresAt,
      },
    });

    // Fire async request to Python worker (non-blocking)
    const mprWorkerUrl = process.env.MPR_WORKER_URL || "http://mpr-worker:5100";
    const callbackUrl = `http://app:3000/api/mpr/callback`;

    // Use fetch with no await — fire and forget
    fetch(`${mprWorkerUrl}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: mprJob.id,
        studyInstanceUID,
        seriesInstanceUID,
        seriesDescription,
        storageKeys,
        outputPrefix: `cases/${caseId}/dicom/mpr/${mprJob.id}`,
        callbackUrl,
      }),
    }).catch((err) => {
      console.error(`Failed to send MPR job to worker:`, err);
      // Update job status to FAILED
      prisma.mprJob
        .update({
          where: { id: mprJob.id },
          data: {
            status: "FAILED",
            errorMessage: `Failed to reach MPR worker: ${err.message}`,
          },
        })
        .catch(console.error);
    });

    return NextResponse.json(
      {
        jobId: mprJob.id,
        status: "QUEUED",
        message: "MPR processing queued",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error triggering MPR:", error);
    return NextResponse.json(
      { error: "Failed to trigger MPR processing" },
      { status: 500 }
    );
  }
}
