import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getMinioClient } from "@/lib/minio/client";
import { generatePresignedUrl } from "@/lib/minio/generatePresignedUrl";

/**
 * GET /api/backups/[id] - Download a backup (Admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const backup = await prisma.backup.findUnique({
      where: { id },
    });

    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    // Generate presigned URL for download (valid for 1 hour)
    const url = await generatePresignedUrl(backup.storageKey, 3600);

    return NextResponse.json({
      url,
      fileName: backup.fileName,
      fileSize: backup.fileSize.toString(),
    });
  } catch (error) {
    console.error("Error generating backup download URL:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/backups/[id] - Delete a backup (Admin only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const backup = await prisma.backup.findUnique({
      where: { id },
    });

    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    // Delete from MinIO
    try {
      const client = getMinioClient();
      const bucket = process.env.MINIO_BUCKET;
      if (bucket) {
        await client.removeObject(bucket, backup.storageKey);
      }
    } catch (error) {
      console.error("Error deleting backup from MinIO:", error);
      // Continue to delete database record even if MinIO deletion fails
    }

    // Delete from database
    await prisma.backup.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Backup deleted successfully" });
  } catch (error) {
    console.error("Error deleting backup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

