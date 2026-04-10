import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { uploadFile, generateDicomStorageKey } from "@/lib/minio";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";

const MAX_DICOM_SIZE = 500 * 1024 * 1024; // 500MB - DICOM files can be large

/**
 * POST /api/dicom/upload/[caseId] - Upload a DICOM zip file for a case
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ caseId: string }> }
) {
    try {
        const currentUser = await getCurrentUserFromRequest(request);

        if (!currentUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { caseId } = await params;

        // Check if user can edit the case (required to upload DICOM files)
        const canEdit = await canEditCase(currentUser, caseId);
        if (!canEdit) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Verify case exists
        const caseRecord = await prisma.case.findUnique({
            where: { id: caseId },
            select: { id: true, patientName: true, mrn: true },
        });

        if (!caseRecord) {
            return NextResponse.json({ error: "Case not found" }, { status: 404 });
        }

        // Get the form data
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        // Validate file size
        if (file.size > MAX_DICOM_SIZE) {
            return NextResponse.json(
                { error: `File size exceeds maximum allowed size of ${MAX_DICOM_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        // Validate file type - must be a zip file
        const isZip =
            file.type === "application/zip" ||
            file.type === "application/x-zip-compressed" ||
            file.type === "application/x-zip" ||
            file.name.toLowerCase().endsWith(".zip");

        if (!isZip) {
            return NextResponse.json(
                { error: "Only ZIP files are allowed for DICOM uploads" },
                { status: 400 }
            );
        }

        // Ensure filename ends with .zip
        let fileName = file.name;
        if (!fileName.toLowerCase().endsWith(".zip")) {
            fileName = fileName + ".zip";
        }

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);

        // Generate storage key
        const storageKey = generateDicomStorageKey(caseId, fileName);

        // Upload to MinIO
        await uploadFile(fileBuffer, storageKey, {
            contentType: "application/zip",
            metadata: {
                originalFileName: fileName,
                uploadedBy: currentUser.id,
                caseId: caseId,
                fileType: "dicom",
            },
        });

        // Save DicomFile record
        const dicomFile = await prisma.dicomFile.create({
            data: {
                caseId: caseId,
                fileName: fileName,
                fileSize: file.size,
                storageKey: storageKey,
            },
            select: {
                id: true,
                caseId: true,
                fileName: true,
                fileSize: true,
                storageKey: true,
                createdAt: true,
            },
        });

        // Log audit entry
        await createAuditLog({
            action: AuditAction.DICOM_UPLOAD,
            userId: currentUser.id,
            caseId: caseId,
            details: {
                fileName: fileName,
                fileSize: file.size,
                patientName: caseRecord.patientName,
                mrn: caseRecord.mrn,
            },
            ipAddress: getIpAddress(request.headers),
        });

        return NextResponse.json(dicomFile, { status: 201 });
    } catch (error) {
        console.error("Error uploading DICOM file:", error);
        return NextResponse.json(
            { error: "Failed to upload DICOM file" },
            { status: 500 }
        );
    }
}
