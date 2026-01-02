import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { restoreDatabase } from "@/lib/restore/database";
import { restoreMinIO } from "@/lib/restore/minio";
import { getMinioClient, getDefaultBucket } from "@/lib/minio/client";

/**
 * POST /api/backups/restore - Restore from a backup (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const backupId = formData.get("backupId") as string | null;
    const type = formData.get("type") as string | null;
    const file = formData.get("file") as File | null;

    if (!type || (type !== "database" && type !== "minio")) {
      return NextResponse.json(
        { error: "Invalid backup type. Must be 'database' or 'minio'" },
        { status: 400 }
      );
    }

    let backupBuffer: Buffer;

    if (backupId) {
      // Restore from existing backup in database
      const backup = await prisma.backup.findUnique({
        where: { id: backupId },
      });

      if (!backup) {
        return NextResponse.json({ error: "Backup not found" }, { status: 404 });
      }

      if (backup.type !== type) {
        return NextResponse.json(
          { error: `Backup type mismatch. Expected ${type}, got ${backup.type}` },
          { status: 400 }
        );
      }

      // Download backup from MinIO
      const client = getMinioClient();
      const bucket = getDefaultBucket();
      const dataStream = await client.getObject(bucket, backup.storageKey);

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of dataStream) {
        chunks.push(Buffer.from(chunk));
      }
      backupBuffer = Buffer.concat(chunks);
    } else if (file) {
      // Restore from uploaded file
      const arrayBuffer = await file.arrayBuffer();
      backupBuffer = Buffer.from(arrayBuffer);
    } else {
      return NextResponse.json(
        { error: "Either backupId or file must be provided" },
        { status: 400 }
      );
    }

    // Perform restore based on type
    if (type === "database") {
      await restoreDatabase(backupBuffer);
    } else {
      // minio
      await restoreMinIO(backupBuffer);
    }

    return NextResponse.json({
      message: `${type === "database" ? "Database" : "MinIO"} restored successfully`,
    });
  } catch (error: any) {
    console.error("Error restoring backup:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

