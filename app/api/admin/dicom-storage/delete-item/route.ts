import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { deleteFolder, deleteFile, getDicomFolderPrefix } from "@/lib/minio";

/**
 * POST /api/admin/dicom-storage/delete-item
 * Deletes a single DICOM record (ZIP file or Folder bundle) and its storage
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isCoordinator(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, type } = await request.json();

    if (!id || !type) {
      return NextResponse.json(
        { error: "Item ID and type are required" },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    let bytesFreed = 0;

    if (type === "zip") {
      const record = await prisma.dicomFile.findUnique({
        where: { id },
      });

      if (!record) {
        return NextResponse.json({ error: "Record not found" }, { status: 404 });
      }

      try {
        await deleteFile(record.storageKey);
        bytesFreed = record.fileSize || 0;
      } catch (e) {
        console.error(`Failed to delete MinIO object ${record.storageKey}:`, e);
      }

      await prisma.dicomFile.delete({ where: { id } });
      deletedCount = 1;
    } else if (type === "folder") {
      const record = await prisma.caseAttachment.findUnique({
        where: { id },
      });

      if (!record || !record.isDicomBundle) {
        return NextResponse.json({ error: "DICOM bundle not found" }, { status: 404 });
      }

      try {
        const folderPrefix = getDicomFolderPrefix(record.storageKey);
        if (folderPrefix) {
          await deleteFolder(folderPrefix);
        } else {
          await deleteFile(record.storageKey);
        }
        // Use realSize if available or fileSize
        bytesFreed = record.fileSize || 0;
      } catch (e) {
        console.error(`Failed to delete MinIO bundle ${record.storageKey}:`, e);
      }

      await prisma.caseAttachment.delete({ where: { id } });
      deletedCount = 1;
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      bytesFreed,
    });
  } catch (error) {
    console.error("Error deleting DICOM item:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
