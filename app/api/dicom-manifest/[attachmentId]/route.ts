import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getFileStream, generateInternalPresignedUrls } from "@/lib/minio";

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
          select: {
            id: true,
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // @ts-ignore
    if (!attachment.isDicomBundle) {
      return NextResponse.json({ error: "Attachment is not a DICOM bundle" }, { status: 400 });
    }

    // Check permissions
    const canView = await canViewCase(currentUser, attachment.case.id);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Fetch manifest JSON from MinIO
    const stream = await getFileStream(attachment.storageKey);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const manifestBuffer = Buffer.concat(chunks);
    const manifestStr = manifestBuffer.toString("utf8");
    const manifest = JSON.parse(manifestStr);

    // 2. Inject completed MPR derived series into the manifest
    const completedMprJobs = await prisma.mprJob.findMany({
      where: { attachmentId, status: "COMPLETED" },
      select: {
        seriesDescription: true,
        derivedSeriesKeys: true,
      },
    });

    if (completedMprJobs.length > 0 && manifest.studies?.[0]) {
      const study = manifest.studies[0];
      if (!study.series) study.series = [];

      for (const job of completedMprJobs) {
        const derivedKeys = job.derivedSeriesKeys as Record<string, any> | null;
        if (!derivedKeys) continue;

        for (const [plane, info] of Object.entries(derivedKeys)) {
          if (!info || !info.seriesUID || !info.storagePrefix || !info.sliceCount) continue;

          const derivedSeries: any = {
            SeriesInstanceUID: info.seriesUID,
            SeriesDescription: `MPR ${plane.charAt(0).toUpperCase() + plane.slice(1)} - ${job.seriesDescription || ""}`.trim(),
            SeriesNumber: 9000 + (plane === "sagittal" ? 1 : 2),
            Modality: study.series[0]?.Modality || "CT",
            instances: [],
          };

          for (let i = 0; i < info.sliceCount; i++) {
            derivedSeries.instances.push({
              url: `${info.storagePrefix}/${String(i).padStart(6, "0")}.dcm`,
              metadata: {
                SOPInstanceUID: `${info.seriesUID}.${i + 1}`,
                InstanceNumber: i + 1,
              },
            });
          }

          study.series.push(derivedSeries);
        }
      }
    }

    // 3. Extract all storage keys to sign them in bulk (includes both original + derived)
    const storageKeys = new Set<string>();
    
    if (manifest.studies && Array.isArray(manifest.studies)) {
      for (const study of manifest.studies) {
        if (study.series && Array.isArray(study.series)) {
          for (const series of study.series) {
            if (series.instances && Array.isArray(series.instances)) {
              for (const instance of series.instances) {
                if (instance.url) {
                  storageKeys.add(instance.url);
                }
              }
            }
          }
        }
      }
    }

    // 4. Generate internal presigned GET URLs (valid for 12 hours).
    // Use internal URLs because these are fetched server-side by the DICOM proxy,
    // which can reach MinIO via the Docker internal network hostname.
    let urlMap: Record<string, string> = {};
    if (storageKeys.size > 0) {
      urlMap = await generateInternalPresignedUrls(Array.from(storageKeys), 43200); 
    }

    // 4. Update the manifest with the generated secure URLs
    if (manifest.studies && Array.isArray(manifest.studies)) {
      for (const study of manifest.studies) {
        if (study.series && Array.isArray(study.series)) {
          for (const series of study.series) {
            if (series.instances && Array.isArray(series.instances)) {
              for (const instance of series.instances) {
                if (instance.url && urlMap[instance.url]) {
                  const proxyUrl = `/api/dicom-proxy?url=${encodeURIComponent(urlMap[instance.url])}`;
                  instance.url = `wadouri:${proxyUrl}`;
                }
              }
            }
          }
        }
      }
    }

    // Return the dynamically secured JSON
    return NextResponse.json(manifest);
  } catch (error) {
    console.error("Error serving dynamic DICOM manifest:", error);
    return NextResponse.json(
      { error: "Failed to generate secured DICOM manifest" },
      { status: 500 }
    );
  }
}
