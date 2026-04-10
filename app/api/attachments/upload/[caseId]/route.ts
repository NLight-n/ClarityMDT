import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { uploadFile, generateCaseAttachmentKey } from "@/lib/minio";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";
import { z } from "zod";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  // PDF
  "application/pdf",
  // Word documents
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  // Excel documents
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  // PowerPoint documents
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  // JSON (for DICOM manifests)
  "application/json",
];

/**
 * POST /api/attachments/upload/[caseId] - Upload a file attachment for a case
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

    // Check if user can edit the case (required to upload attachments)
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
    const isDicomBundle = formData.get("isDicomBundle") === "true";
    const customTimestampStr = formData.get("timestamp") as string | null;
    const customTimestamp = customTimestampStr ? parseInt(customTimestampStr, 10) : undefined;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed. Allowed types: ${ALLOWED_FILE_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Generate storage key (using custom timestamp if provided)
    const storageKey = generateCaseAttachmentKey(caseId, file.name, customTimestamp);

    // Upload to MinIO
    await uploadFile(fileBuffer, storageKey, {
      contentType: file.type,
      metadata: {
        originalFileName: file.name,
        uploadedBy: currentUser.id,
        caseId: caseId,
      },
    });

    // Save CaseAttachment record
    const attachment = await prisma.caseAttachment.create({
      data: {
        caseId: caseId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storageKey: storageKey,
        isDicomBundle: isDicomBundle,
      },

      select: {
        id: true,
        caseId: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        storageKey: true,
        isDicomBundle: true,
        createdAt: true,
      },
    });

    // Log audit entry
    await createAuditLog({
      action: isDicomBundle ? AuditAction.DICOM_UPLOAD : AuditAction.ATTACHMENT_UPLOAD,
      userId: currentUser.id,
      caseId: caseId,
      details: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        isDicomBundle: isDicomBundle,
        patientName: caseRecord.patientName,
        mrn: caseRecord.mrn,
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Error uploading attachment:", error);
    return NextResponse.json(
      { error: "Failed to upload attachment" },
      { status: 500 }
    );
  }
}


