import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { getMinioClient, getDefaultBucket, ensureBucket } from "@/lib/minio";

// Helper to accumulate stream data
function streamToObjects(stream: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const items: any[] = [];
    stream.on("data", (obj: any) => items.push(obj));
    stream.on("error", (err: any) => reject(err));
    stream.on("end", () => resolve(items));
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isCoordinator(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = getMinioClient();
    const bucket = getDefaultBucket();
    await ensureBucket(bucket);

    // 1. Get all documented storage keys from database
    // Legacy ZIPs in DicomFile table
    const dbZips = await prisma.dicomFile.findMany({
      select: { storageKey: true },
    });
    // Modern folder DICOMs in CaseAttachment table
    const dbFolders = await prisma.caseAttachment.findMany({
      where: { isDicomBundle: true },
      select: { storageKey: true },
    });

    // Build a set of valid storage key prefixes and a map of valid timestamps per case
    const validPrefixes = new Set<string>();
    const caseValidTimestamps = new Map<string, Set<string>>();

    dbZips.forEach((z) => validPrefixes.add(z.storageKey));

    dbFolders.forEach((f) => {
      // The manifest key itself is valid
      validPrefixes.add(f.storageKey);

      const parts = f.storageKey.split("/");
      const caseId = parts[1];
      const manifestFileName = parts[parts.length - 1];
      const dashIndex = manifestFileName.indexOf("-");
      if (dashIndex > 0) {
        const timestamp = manifestFileName.substring(0, dashIndex);
        // Build prefix: cases/{caseId}/attachments/{timestamp}-
        const folderPrefix =
          parts.slice(0, -1).join("/") + "/" + timestamp + "-";
        validPrefixes.add(folderPrefix);

        // Also track this timestamp for this case to allow small skews
        if (!caseValidTimestamps.has(caseId)) {
          caseValidTimestamps.set(caseId, new Set());
        }
        caseValidTimestamps.get(caseId)!.add(timestamp);
      }
    });


    // Also collect ALL non-DICOM attachment keys so we don't accidentally delete them
    const regularAttachments = await prisma.caseAttachment.findMany({
      where: { isDicomBundle: false },
      select: { storageKey: true },
    });
    regularAttachments.forEach((a) => validPrefixes.add(a.storageKey));

    // 2. Scan ALL objects in MinIO under cases/ prefix
    // DICOM files are stored at: cases/{caseId}/attachments/{timestamp}-{fileName}
    const minioStream = client.listObjectsV2(bucket, "cases/", true);
    const minioObjects = await streamToObjects(minioStream);

    let deletedBytes = 0;
    let deletedPathsCount = 0;

    for (const obj of minioObjects) {
      const key = obj.name;
      if (!key) continue;

      // Only consider files in attachments/ subdirectories that look like DICOM data
      // Skip files that are under radiologyInline/, pathologyInline/, clinicalInline/
      if (
        key.includes("/radiologyInline/") ||
        key.includes("/pathologyInline/") ||
        key.includes("/clinicalInline/")
      ) {
        continue;
      }

      // Check if this key is protected by any valid prefix
      let isValid = false;
      for (const valid of validPrefixes) {
        // Exact match or the key starts with the valid prefix
        if (key === valid || key.startsWith(valid)) {
          isValid = true;
          break;
        }
      }

      // FAILS PREVIOUS CHECKS? Try fuzzy timestamp matching for DICOM files
      if (!isValid && key.includes("/attachments/")) {
        const parts = key.split("/");
        const caseId = parts[1];
        const fileName = parts[parts.length - 1];
        const dashIndex = fileName.indexOf("-");
        
        if (dashIndex > 0) {
          const timestamp = fileName.substring(0, dashIndex);
          const validTimestamps = caseValidTimestamps.get(caseId);
          if (validTimestamps) {
            const tsNum = parseInt(timestamp, 10);
            for (const validTs of Array.from(validTimestamps)) {
              const validTsNum = parseInt(validTs, 10);
              // Allow 15 seconds of skew for large folder uploads
              if (!isNaN(tsNum) && !isNaN(validTsNum) && Math.abs(tsNum - validTsNum) < 15000) {
                isValid = true;
                break;
              }
            }
          }
        }
      }


      if (!isValid) {
        // This is an orphaned file
        // But only delete if it's in an attachments/ folder (safety check)
        if (key.includes("/attachments/")) {
          try {
            await client.removeObject(bucket, key);
            deletedBytes += obj.size || 0;
            deletedPathsCount++;
            console.log(`Orphan cleanup: Deleted ${key}`);
          } catch (e) {
            console.error(`Failed to delete orphan ${key}:`, e);
          }
        }
      }
    }

    // 3. Also scan legacy dicom/ prefix (for old zip-based uploads)
    const legacyStream = client.listObjectsV2(bucket, "dicom/", true);
    const legacyObjects = await streamToObjects(legacyStream);

    for (const obj of legacyObjects) {
      const key = obj.name;
      if (!key) continue;

      let isValid = false;
      for (const valid of validPrefixes) {
        if (key === valid || key.startsWith(valid)) {
          isValid = true;
          break;
        }
      }

      if (!isValid) {
        try {
          await client.removeObject(bucket, key);
          deletedBytes += obj.size || 0;
          deletedPathsCount++;
          console.log(`Orphan cleanup (legacy): Deleted ${key}`);
        } catch (e) {
          console.error(`Failed to delete orphan ${key}:`, e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      deletedBytes,
      deletedCount: deletedPathsCount,
    });
  } catch (error) {
    console.error("Error hunting DICOM orphans:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
