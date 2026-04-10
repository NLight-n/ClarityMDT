import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { deleteFolder, deleteFile, getDicomFolderPrefix } from "@/lib/minio";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isCoordinator(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { caseIds } = await request.json();

    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json(
        { error: "caseIds must be a non-empty array" },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    let totalBytesFreed = 0;
    const errors: string[] = [];

    for (const caseId of caseIds) {
      try {
        // 1. Delete legacy DicomFile records (ZIP-based)
        const dicomFiles = await prisma.dicomFile.findMany({
          where: { caseId },
        });

        for (const df of dicomFiles) {
          try {
            await deleteFile(df.storageKey);
            totalBytesFreed += df.fileSize || 0;
          } catch (e) {
            console.error(`Failed to delete MinIO object ${df.storageKey}:`, e);
          }
        }

        if (dicomFiles.length > 0) {
          await prisma.dicomFile.deleteMany({ where: { caseId } });
          deletedCount += dicomFiles.length;
        }

        // 2. Delete modern DICOM bundle attachments
        const dicomAttachments = await prisma.caseAttachment.findMany({
          where: { caseId, isDicomBundle: true },
        });

        for (const da of dicomAttachments) {
          try {
            const folderPrefix = getDicomFolderPrefix(da.storageKey);
            if (folderPrefix) {
              await deleteFolder(folderPrefix);
            } else {
              await deleteFile(da.storageKey);
            }
            // Use realSize if available for more accurate freed reporting
            const realSize = (da as any).realSize || da.fileSize || 0;
            totalBytesFreed += realSize;
          } catch (e) {
            console.error(`Failed to prune DICOM bundle ${da.storageKey}:`, e);
          }
        }


        if (dicomAttachments.length > 0) {
          await prisma.caseAttachment.deleteMany({
            where: { caseId, isDicomBundle: true },
          });
          deletedCount += dicomAttachments.length;
        }
      } catch (caseError) {
        const msg = `Failed to prune case ${caseId}: ${caseError}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      totalBytesFreed,
      casesProcessed: caseIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error pruning DICOM data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
