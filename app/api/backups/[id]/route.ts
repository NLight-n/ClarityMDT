import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getMinioClient, getDefaultBucket } from "@/lib/minio";

/**
 * GET /api/backups/[id] - Stream a backup file for download (Admin only)
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

    // Stream the file directly from MinIO
    const client = getMinioClient();
    const bucket = getDefaultBucket();

    try {
      const fileStream = await client.getObject(bucket, backup.storageKey);
      const stat = await client.statObject(bucket, backup.storageKey);

      const headers = new Headers();
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename="${backup.fileName}"`);
      headers.set("Content-Length", stat.size.toString());
      headers.set("Cache-Control", "private, no-cache");

      return new NextResponse(fileStream as any, { headers });
    } catch (error: any) {
      console.error("Error streaming backup:", error);
      if (error.code === "NoSuchKey" || error.code === "NotFound") {
        return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
      }
      return NextResponse.json(
        { error: "Failed to stream backup" },
        { status: 500 }
      );
    }
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

