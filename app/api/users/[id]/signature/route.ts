import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { uploadFile } from "@/lib/minio/upload";
import { randomUUID } from "crypto";

/**
 * POST /api/users/[id]/signature - Upload signature image for a user (Admin only)
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

    // Only Admin can upload signatures
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get the uploaded file from FormData
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type (only images)
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PNG and JPEG images are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 2MB limit" },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate storage key for signature
    const fileExtension = file.name.split(".").pop() || "png";
    const storageKey = `signatures/${id}/${randomUUID()}.${fileExtension}`;

    // Upload to MinIO
    await uploadFile(buffer, storageKey, {
      contentType: file.type,
    });

    // Update user with signature URL
    // Store the storage key (not full URL) - we'll generate presigned URLs when needed
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        signatureUrl: storageKey,
        signatureAuthenticated: false, // Reset authentication when signature is changed
      },
      select: {
        id: true,
        name: true,
        signatureUrl: true,
        signatureAuthenticated: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error uploading signature:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

