import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";

/**
 * PATCH /api/users/[id]/authenticate-signature - Authenticate signature (Consultant only, for their own signature)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Users can only authenticate their own signature
    if (user.id !== id) {
      return NextResponse.json(
        { error: "You can only authenticate your own signature" },
        { status: 403 }
      );
    }

    // Check if user exists and has a signature
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        signatureUrl: true,
        signatureAuthenticated: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!targetUser.signatureUrl) {
      return NextResponse.json(
        { error: "No signature uploaded for this user" },
        { status: 400 }
      );
    }

    // Update authentication status
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        signatureAuthenticated: true,
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
    console.error("Error authenticating signature:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

