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

    // Flatten into individual entries
    const storageItems: any[] = [];
    // 1. Legacy ZIP files
    for (const record of dicomFiles) {
      if (!record.case) continue;
      storageItems.push({
        id: record.id,
        type: "zip",
        fileName: record.fileName,
        fileSize: record.fileSize || 0,
        storageKey: record.storageKey,
        caseId: record.case.id,
        patientName: record.case.patientName,
        mrn: record.case.mrn,
        status: record.case.status,
        department: record.case.presentingDepartment.name,
      });
    }

    // 2. Modern Folder DICOM records
    for (const record of dicomAttachments) {
      if (!record.case) continue;
      
      // Compute real size by reading manifest
      const realSize = await getDicomBundleRealSize(record.storageKey);

      storageItems.push({
        id: record.id,
        type: "folder",
        fileName: record.fileName,
        fileSize: realSize,
        storageKey: record.storageKey,
        caseId: record.case.id,
        patientName: record.case.patientName,
        mrn: record.case.mrn,
        status: record.case.status,
        department: record.case.presentingDepartment.name,
      });
    }

    // Decrypt PHI fields
    const decryptedItems = decryptCaseDataArray(storageItems);

    // Sort by Size (Descending)
    decryptedItems.sort((a: any, b: any) => b.fileSize - a.fileSize);

    return NextResponse.json(decryptedItems);
  } catch (error) {
    console.error("Error fetching DICOM storage data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
