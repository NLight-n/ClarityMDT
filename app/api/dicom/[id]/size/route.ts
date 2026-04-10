import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { getMinioClient, getDefaultBucket, ensureBucket, getObjectsSizeByPrefix } from "@/lib/minio";

/**
 * GET /api/dicom/[id]/size - Get real DICOM folder size from MinIO
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check if it's a CaseAttachment (DICOM bundle)
    const attachment = await prisma.caseAttachment.findUnique({
      where: { id },
      select: { storageKey: true, caseId: true, isDicomBundle: true },
    });

    if (!attachment || !attachment.isDicomBundle) {
      return NextResponse.json({ error: "DICOM bundle not found" }, { status: 404 });
    }

    const canView = await canViewCase(currentUser, attachment.caseId);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let totalSize = 0;

    try {
      const { getDicomManifestRealSize } = await import("@/lib/minio");
      totalSize = await getDicomManifestRealSize(attachment.storageKey);
    } catch (e) {
      console.error("Error calculating DICOM folder size from manifest:", e);
    }


    return NextResponse.json({ size: totalSize });
  } catch (error) {
    console.error("Error getting DICOM size:", error);
    return NextResponse.json(
      { error: "Failed to calculate DICOM size" },
      { status: 500 }
    );
  }
}
