import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getFileStream } from "@/lib/minio";

/**
 * GET /api/mpr/series/[attachmentId]
 * 
 * Lists all series in a DICOM bundle with their MPR processing status.
 * Used by the OHIF overlay to show which series can be processed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { attachmentId } = await params;

    // Get attachment from database
    const attachment = await prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        case: {
          select: { id: true },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // @ts-ignore
    if (!attachment.isDicomBundle) {
      return NextResponse.json({ error: "Not a DICOM bundle" }, { status: 400 });
    }

    // Check permissions
    const canView = await canViewCase(currentUser, attachment.case.id);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch manifest from MinIO
    const stream = await getFileStream(attachment.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const manifest = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    // Parse series from manifest
    const seriesList: any[] = [];
    
    if (manifest.studies && Array.isArray(manifest.studies)) {
      for (const study of manifest.studies) {
        if (study.series && Array.isArray(study.series)) {
          for (const series of study.series) {
            seriesList.push({
              seriesInstanceUID: series.SeriesInstanceUID || "",
              seriesDescription: series.SeriesDescription || "Unknown Series",
              modality: series.Modality || "UNKNOWN",
              seriesNumber: series.SeriesNumber || 0,
              instanceCount: Array.isArray(series.instances) ? series.instances.length : 0,
            });
          }
        }
      }
    }

    // Get MPR job status for all series in this attachment
    const mprJobs = await prisma.mprJob.findMany({
      where: { attachmentId },
      select: {
        id: true,
        seriesInstanceUID: true,
        status: true,
        progress: true,
        planes: true,
        errorMessage: true,
      },
    });

    // Create lookup map
    const mprJobMap = new Map(
      mprJobs.map((job) => [job.seriesInstanceUID, job])
    );

    // Combine series with MPR status
    const enrichedSeries = seriesList.map((series) => {
      const job = mprJobMap.get(series.seriesInstanceUID);
      return {
        ...series,
        mprStatus: job
          ? {
              jobId: job.id,
              status: job.status,
              progress: job.progress,
              planes: job.planes,
              errorMessage: job.errorMessage,
            }
          : null,
      };
    });

    return NextResponse.json({
      studyDescription: manifest.studies?.[0]?.StudyDescription || "Unknown Study",
      patientName: manifest.studies?.[0]?.PatientName || "Unknown",
      caseId: attachment.case.id,
      series: enrichedSeries,
    });
  } catch (error) {
    console.error("Error fetching series list:", error);
    return NextResponse.json(
      { error: "Failed to fetch series list" },
      { status: 500 }
    );
  }
}
