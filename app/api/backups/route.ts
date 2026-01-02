import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { createDatabaseBackup } from "@/lib/backup/database";
import { createMinIOBackup } from "@/lib/backup/minio";
import { uploadFile, generateBackupKey } from "@/lib/minio/upload";

/**
 * GET /api/backups - List all backups (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const backups = await prisma.backup.findMany({
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedBackups = backups.map((backup) => ({
      id: backup.id,
      type: backup.type,
      fileName: backup.fileName,
      fileSize: backup.fileSize.toString(),
      createdAt: backup.createdAt,
      createdBy: {
        id: backup.createdBy.id,
        name: backup.createdBy.name,
        loginId: backup.createdBy.loginId,
      },
    }));

    return NextResponse.json(formattedBackups);
  } catch (error) {
    console.error("Error fetching backups:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/backups - Create a new backup (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type } = body; // "database" or "minio"

    if (!type || (type !== "database" && type !== "minio")) {
      return NextResponse.json(
        { error: "Invalid backup type. Must be 'database' or 'minio'" },
        { status: 400 }
      );
    }

    // Create backup based on type
    let backupBuffer: Buffer;
    let fileName: string;
    let contentType: string;

    if (type === "database") {
      backupBuffer = await createDatabaseBackup();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      fileName = `database-backup-${timestamp}.sql`;
      contentType = "application/sql";
    } else {
      // minio
      backupBuffer = await createMinIOBackup();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      fileName = `minio-backup-${timestamp}.tar.gz`;
      contentType = "application/gzip";
    }

    // Generate storage key
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const storageKey = generateBackupKey(type, timestamp);

    // Upload backup to MinIO
    await uploadFile(backupBuffer, storageKey, {
      contentType,
      metadata: {
        "backup-type": type,
        "created-by": user.id,
        "created-at": new Date().toISOString(),
      },
    });

    // Save backup record to database
    const backup = await prisma.backup.create({
      data: {
        type: type,
        fileName: fileName,
        storageKey: storageKey,
        fileSize: BigInt(backupBuffer.length),
        createdById: user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: backup.id,
      type: backup.type,
      fileName: backup.fileName,
      fileSize: backup.fileSize.toString(),
      createdAt: backup.createdAt,
      createdBy: backup.createdBy,
    });
  } catch (error: any) {
    console.error("Error creating backup:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

