import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { uploadFile } from "@/lib/minio/upload";
import {
  generateRadiologyInlineKey,
  generatePathologyInlineKey,
  generateClinicalInlineKey,
} from "@/lib/minio/upload";
import { generatePresignedUrl } from "@/lib/minio/generatePresignedUrl";

/**
 * POST /api/cases/[id]/upload-inline-image - Upload an inline image for radiology or pathology findings
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const imageType = formData.get("type") as string; // "radiology", "pathology", or "clinical"
    const imageId = formData.get("imageId") as string; // UUID for the image

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!imageType || (imageType !== "radiology" && imageType !== "pathology" && imageType !== "clinical")) {
      return NextResponse.json(
        { error: "Invalid image type. Must be 'radiology', 'pathology', or 'clinical'" },
        { status: 400 }
      );
    }

    if (!imageId) {
      return NextResponse.json(
        { error: "No imageId provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PNG, JPEG, and JPG are allowed" },
        { status: 400 }
      );
    }

    // Get file extension
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";

    // Generate storage key
    let storageKey: string;
    if (imageType === "radiology") {
      storageKey = generateRadiologyInlineKey(id, imageId, extension);
    } else if (imageType === "pathology") {
      storageKey = generatePathologyInlineKey(id, imageId, extension);
    } else {
      storageKey = generateClinicalInlineKey(id, imageId, extension);
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to MinIO
    await uploadFile(buffer, storageKey, {
      contentType: file.type,
    });

    // Generate presigned URL for displaying the image
    const imageUrl = await generatePresignedUrl(storageKey, 7 * 24 * 60 * 60); // 7 days

    return NextResponse.json({
      storageKey,
      imageUrl,
      imageId,
    });
  } catch (error) {
    console.error("Error uploading inline image:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


