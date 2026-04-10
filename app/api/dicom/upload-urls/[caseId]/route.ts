import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canEditCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { generatePresignedPutUrl } from "@/lib/minio";
import { generateCaseAttachmentKey } from "@/lib/minio";

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

    const body = await request.json();
    const { fileNames } = body as { fileNames: string[] };

    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return NextResponse.json({ error: "No file names provided" }, { status: 400 });
    }

    // Generate a single timestamp for the entire batch to ensure they share a prefix
    const batchTimestamp = Date.now();

    // Generate keys and presigned URLs for each specified file
    const uploadInstructions = await Promise.all(
      fileNames.map(async (fileName) => {
        const storageKey = generateCaseAttachmentKey(caseId, fileName, batchTimestamp);
        const presignedUrl = await generatePresignedPutUrl(storageKey, 3600); // 1 hour
        return {
          fileName,
          storageKey,
          presignedUrl,
        };
      })
    );

    return NextResponse.json({ 
      uploadInstructions,
      timestamp: batchTimestamp 
    }, { status: 200 });

  } catch (error) {
    console.error("Error generating presigned URLs:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URLs" },
      { status: 500 }
    );
  }
}
