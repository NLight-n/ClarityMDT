import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase, canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { deleteFile, deleteFolder, getDicomFolderPrefix } from "@/lib/minio";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";

/**
 * DELETE /api/dicom/[id] - Delete a DICOM file
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await getCurrentUserFromRequest(request);

        if (!currentUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // Get the DICOM file record
        const dicomFile = await prisma.dicomFile.findUnique({
            where: { id },
            select: {
                id: true,
                fileName: true,
                storageKey: true,
                caseId: true,
                case: {
                    select: {
                        id: true,
                        patientName: true,
                        mrn: true,
                    },
                },
            },
        });

        if (!dicomFile) {
            return NextResponse.json(
                { error: "DICOM file not found" },
                { status: 404 }
            );
        }

        // Check if user can edit the case (required to delete DICOM files)
        const canEdit = await canEditCase(currentUser, dicomFile.caseId);
        if (!canEdit) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Delete from MinIO
        try {
            const folderPrefix = getDicomFolderPrefix(dicomFile.storageKey);
            if (folderPrefix) {
                // Delete the entire folder (manifest + raw files)
                await deleteFolder(folderPrefix);
            } else {
                // Fallback for legacy zip files
                await deleteFile(dicomFile.storageKey);
            }
        } catch (minioError) {
            console.error("Error deleting DICOM file from MinIO:", minioError);
            // Continue to delete database record even if MinIO delete fails
        }

        // Delete from database
        await prisma.dicomFile.delete({
            where: { id },
        });

        // Log audit entry
        await createAuditLog({
            action: AuditAction.DICOM_DELETE,
            userId: currentUser.id,
            caseId: dicomFile.caseId,
            details: {
                fileName: dicomFile.fileName,
                patientName: dicomFile.case.patientName,
                mrn: dicomFile.case.mrn,
            },
            ipAddress: getIpAddress(request.headers),
        });

        return NextResponse.json({ message: "DICOM file deleted" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting DICOM file:", error);
        return NextResponse.json(
            { error: "Failed to delete DICOM file" },
            { status: 500 }
        );
    }
}
