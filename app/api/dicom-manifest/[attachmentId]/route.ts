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
            Modality: info.modality || study.series[0]?.Modality || "CT",
            instances: [],
          };

          // Build instance metadata that OHIF's dicomjson data source requires
          const sopClassUID = info.sopClassUID || "1.2.840.10008.5.1.4.1.1.2"; // CT Image Storage
          const origin = info.origin || [0, 0, 0];
          const planeAxis = info.planeAxis ?? (plane === "sagittal" ? 0 : 1);
          const spacingStep = info.spacingBetweenSlices || info.sliceThickness || 1;

          for (let i = 0; i < info.sliceCount; i++) {
            const sopInstanceUID = `${info.seriesUID}.${i + 1}`;

            // Compute ImagePositionPatient for this slice
            const position = [...origin];
            position[planeAxis] = origin[planeAxis] + i * spacingStep;

            derivedSeries.instances.push({
              url: `${info.storagePrefix}/${String(i).padStart(6, "0")}.dcm`,
              metadata: {
                // Required identification
                SOPClassUID: sopClassUID,
                SOPInstanceUID: sopInstanceUID,
                InstanceNumber: i + 1,
                // Series-level (OHIF reads from instances too)
                SeriesInstanceUID: info.seriesUID,
                SeriesDescription: derivedSeries.SeriesDescription,
                SeriesNumber: derivedSeries.SeriesNumber,
                Modality: derivedSeries.Modality,
                // Image dimensions
                Rows: info.rows || 512,
                Columns: info.columns || 512,
                BitsAllocated: info.bitsAllocated || 16,
                BitsStored: 16,
                HighBit: 15,
                PixelRepresentation: 1,
                SamplesPerPixel: 1,
                PhotometricInterpretation: "MONOCHROME2",
                NumberOfFrames: 1,
                // Spatial information — per instance
                ImagePositionPatient: position.map(String),
                ImageOrientationPatient: info.imageOrientation || (plane === "sagittal" ? ["0","1","0","0","0","-1"] : ["1","0","0","0","0","-1"]),
                PixelSpacing: info.pixelSpacing || ["1", "1"],
                SliceThickness: info.sliceThickness || 1,
                SpacingBetweenSlices: spacingStep,
                // Rescale — identity (pixel data is already in HU)
                RescaleIntercept: info.rescaleIntercept ?? 0,
                RescaleSlope: info.rescaleSlope ?? 1,
                RescaleType: "HU",
                // Window level from source series
                ...(info.windowCenter != null && { WindowCenter: info.windowCenter }),
                ...(info.windowWidth != null && { WindowWidth: info.windowWidth }),
                // Image type
                ImageType: ["DERIVED", "SECONDARY", "MPR"],
                // Study reference (inherit from parent study)
                StudyInstanceUID: study.StudyInstanceUID,
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
