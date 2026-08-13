import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFileStream } from "@/lib/minio";
import { verifyWeasisToken, markManifestTokenConsumed } from "@/lib/weasis/tokens";
import { convertToWeasisXml } from "@/lib/weasis/manifestConverter";
import { getPublicOrigin } from "@/lib/weasis/getPublicOrigin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const payload = verifyWeasisToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Get attachment from database
    const attachment = await prisma.caseAttachment.findUnique({
      where: { id: payload.attachmentId },
      select: {
        id: true,
        storageKey: true,
        isDicomBundle: true,
        caseId: true,
      },
    });

    if (!attachment || !attachment.isDicomBundle) {
      return NextResponse.json({ error: "DICOM bundle attachment not found" }, { status: 404 });
    }

    // 1. Fetch manifest JSON from MinIO
    const stream = await getFileStream(attachment.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const manifestBuffer = Buffer.concat(chunks);
    const manifestStr = manifestBuffer.toString("utf8");
    const manifest = JSON.parse(manifestStr);

    // 2. Inject completed MPR derived series into the manifest (same pattern as OHIF manifest route)
    const completedMprJobs = await prisma.mprJob.findMany({
      where: { attachmentId: attachment.id, status: "COMPLETED" },
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

          const sopClassUID = info.sopClassUID || "1.2.840.10008.5.1.4.1.1.2";

          for (let i = 0; i < info.sliceCount; i++) {
            const sopInstanceUID = `${info.seriesUID}.${i + 1}`;
            derivedSeries.instances.push({
              url: `${info.storagePrefix}/${String(i).padStart(6, "0")}.dcm`,
              metadata: {
                SOPClassUID: sopClassUID,
                SOPInstanceUID: sopInstanceUID,
                InstanceNumber: i + 1,
                SeriesInstanceUID: info.seriesUID,
                SeriesDescription: derivedSeries.SeriesDescription,
                SeriesNumber: derivedSeries.SeriesNumber,
                Modality: derivedSeries.Modality,
                StudyInstanceUID: study.StudyInstanceUID,
                PatientID: study.PatientID || study.series?.[0]?.instances?.[0]?.metadata?.PatientID || "ANONYMOUS",
                PatientName: study.PatientName || study.series?.[0]?.instances?.[0]?.metadata?.PatientName || "",
              },
            });
          }

          study.series.push(derivedSeries);
        }
      }
    }

    // 3. Convert manifest structure to Weasis XML format
    const publicOrigin = getPublicOrigin(request);
    const xml = convertToWeasisXml(manifest, token, publicOrigin);

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch (error) {
    console.error("Error generating Weasis XML manifest:", error);
    return NextResponse.json(
      { error: "Failed to generate Weasis manifest" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
