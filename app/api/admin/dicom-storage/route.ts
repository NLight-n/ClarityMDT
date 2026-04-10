import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isCoordinator } from "@/lib/permissions/accessControl";
import { decryptCaseDataArray } from "@/lib/security/phiCaseWrapper";
import { getMinioClient, getDefaultBucket, ensureBucket, getObjectsSizeByPrefix, getDicomManifestRealSize } from "@/lib/minio";
import { CaseAttachment, DicomFile } from "@prisma/client";

// Helper to reliably compute the real size of a DICOM bundle by manifest
async function getDicomBundleRealSize(manifestKey: string): Promise<number> {
  try {
    return await getDicomManifestRealSize(manifestKey);
  } catch (e) {
    console.error(`Failed to compute real size for ${manifestKey}:`, e);
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    
    if (!user || !isCoordinator(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = getMinioClient();
    const bucket = getDefaultBucket();
    await ensureBucket(bucket);

    // 1. Fetch legacy ZIP DICOM records
    const dicomFiles = await prisma.dicomFile.findMany({
      include: {
        case: {
          select: {
            id: true,
            patientName: true,
            mrn: true,
            status: true,
            presentingDepartment: { select: { name: true } }
          }
        }
      }
    });

    // 2. Fetch Modern Folder DICOM records (manifest.json attachments)
    const dicomAttachments = await prisma.caseAttachment.findMany({
      where: { isDicomBundle: true },
      include: {
        case: {
          select: {
            id: true,
            patientName: true,
            mrn: true,
            status: true,
            presentingDepartment: { select: { name: true } }
          }
        }
      }
    });

    // Aggregate by Case ID
    const caseMap = new Map<string, any>();

    // Process legacy ZIP records - DB fileSize is reasonably accurate for these
    for (const record of dicomFiles) {
      if (!record.case) continue;
      const caseId = record.case.id;

      if (!caseMap.has(caseId)) {
        caseMap.set(caseId, {
          caseId,
          patientName: record.case.patientName,
          mrn: record.case.mrn,
          status: record.case.status,
          department: record.case.presentingDepartment.name,
          totalSizeBytes: 0,
          files: [],
        });
      }

      const caseEntry = caseMap.get(caseId);
      caseEntry.totalSizeBytes += record.fileSize || 0;
      caseEntry.files.push({
        id: record.id,
        type: "zip",
        fileName: record.fileName,
        fileSize: record.fileSize,
        storageKey: record.storageKey,
      });
    }

    // Process modern folder DICOM records - read manifest to compute real size
    for (const record of dicomAttachments) {
      if (!record.case) continue;
      const caseId = record.case.id;

      if (!caseMap.has(caseId)) {
        caseMap.set(caseId, {
          caseId,
          patientName: record.case.patientName,
          mrn: record.case.mrn,
          status: record.case.status,
          department: record.case.presentingDepartment.name,
          totalSizeBytes: 0,
          files: [],
        });
      }

      // Compute real size by reading manifest and statting all referenced files
      const realSize = await getDicomBundleRealSize(record.storageKey);

      const caseEntry = caseMap.get(caseId);
      caseEntry.totalSizeBytes += realSize;
      caseEntry.files.push({
        id: record.id,
        type: "folder",
        fileName: record.fileName,
        fileSize: realSize,
        storageKey: record.storageKey,
      });
    }

    // Convert map to array and decrypt PHI fields
    const aggregatedCases = Array.from(caseMap.values());
    const decryptedCases = decryptCaseDataArray(aggregatedCases as any[]);

    // Sort by Total Size (Descending)
    decryptedCases.sort((a: any, b: any) => b.totalSizeBytes - a.totalSizeBytes);

    return NextResponse.json(decryptedCases);
  } catch (error) {
    console.error("Error fetching DICOM storage data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
