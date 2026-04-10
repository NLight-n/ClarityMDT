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

    // 2. Extract all storage keys to sign them in bulk
    const storageKeys = new Set<string>();
    
    if (manifest.studies && Array.isArray(manifest.studies)) {
      for (const study of manifest.studies) {
        if (study.series && Array.isArray(study.series)) {
          for (const series of study.series) {
            if (series.instances && Array.isArray(series.instances)) {
              for (const instance of series.instances) {
                // If the url was recorded as just the storage key
                if (instance.url) {
                  storageKeys.add(instance.url);
                }
              }
            }
          }
        }
      }
    }

    // 3. Generate internal presigned GET URLs (valid for 12 hours).
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
