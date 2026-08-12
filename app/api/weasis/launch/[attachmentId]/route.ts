import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { canViewCase } from "@/lib/permissions/accessControl";
import { prisma } from "@/lib/prisma";
import { generateWeasisToken } from "@/lib/weasis/tokens";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";

function getPublicOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  if (forwardedProto && forwardedHost && ["http", "https"].includes(forwardedProto)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const currentUser = await getCurrentUserFromRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { attachmentId } = await params;
    if (!attachmentId) {
      return NextResponse.json({ error: "Attachment ID is required" }, { status: 400 });
    }

    // Fetch attachment from database
    const attachment = await prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        case: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    if (!attachment.isDicomBundle) {
      return NextResponse.json({ error: "Attachment is not a DICOM bundle" }, { status: 400 });
    }

    // Check permissions
    const canView = await canViewCase(currentUser, attachment.case.id);
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate short-lived (5 minute) attachment-scoped token
    const { token } = generateWeasisToken({
      attachmentId: attachment.id,
      userId: currentUser.id,
      caseId: attachment.case.id,
      ttlMs: 5 * 60 * 1000,
    });

    const publicOrigin = getPublicOrigin(request);
    const manifestUrl = `${publicOrigin}/api/weasis/manifest/${token}`;
    
    // Official Weasis URI protocol scheme for XML Manifest (-w flag)
    const command = `$dicom:get -w "${manifestUrl}"`;
    const launchUrl = `weasis://?${encodeURIComponent(command)}`;

    // Audit log Weasis launch
    await createAuditLog({
      action: AuditAction.WEASIS_LAUNCH,
      userId: currentUser.id,
      caseId: attachment.case.id,
      details: {
        attachmentId: attachment.id,
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json({
      success: true,
      launchUrl,
      manifestUrl,
    });
  } catch (error) {
    console.error("Error generating Weasis launch URL:", error);
    return NextResponse.json(
      { error: "Failed to generate Weasis launch URL" },
      { status: 500 }
    );
  }
}
