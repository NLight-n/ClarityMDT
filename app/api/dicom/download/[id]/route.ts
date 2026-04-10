import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { getMinioClient, getDefaultBucket } from "@/lib/minio";

/**
 * GET /api/dicom/download/[id] - Download a DICOM zip file
 */
export async function GET(
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
        });

        if (!dicomFile) {
            return NextResponse.json(
                { error: "DICOM file not found" },
                { status: 404 }
            );
        }

        // Check if user can view the case
        const canView = await canViewCase(currentUser, dicomFile.caseId);
        if (!canView) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Stream the file from MinIO
        const client = getMinioClient();
        const bucket = getDefaultBucket();

        const stream = await client.getObject(bucket, dicomFile.storageKey);

        // Collect stream into buffer
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const fileBuffer = Buffer.concat(chunks);

        // Return file as download
        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${dicomFile.fileName}"`,
                "Content-Length": fileBuffer.length.toString(),
            },
        });
    } catch (error) {
        console.error("Error downloading DICOM file:", error);
        return NextResponse.json(
            { error: "Failed to download DICOM file" },
            { status: 500 }
        );
    }
}
