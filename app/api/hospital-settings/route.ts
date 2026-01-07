import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { createAuditLog, AuditAction, getIpAddress } from "@/lib/audit/logger";

/**
 * GET /api/hospital-settings - Get hospital settings
 * Public endpoint - no authentication required
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get the first (and should be only) hospital settings record
    // If none exists, return default empty settings
    const settings = await prisma.hospitalSettings.findFirst();

    if (!settings) {
      return NextResponse.json({
        name: null,
        logoUrl: null,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    return NextResponse.json({
      name: settings.name,
      logoUrl: settings.logoUrl,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Error fetching hospital settings:", error);
    // Always return valid JSON, even on error
    return NextResponse.json(
      {
        name: null,
        logoUrl: null,
        error: "Failed to fetch hospital settings",
      },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

/**
 * PATCH /api/hospital-settings - Update hospital settings (Admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can update hospital settings
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: "Only admins can update hospital settings" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, logoUrl } = body;

    // Validate that at least one field is provided
    if (name === undefined && logoUrl === undefined) {
      return NextResponse.json(
        { error: "At least one field (name or logoUrl) must be provided" },
        { status: 400 }
      );
    }

    // Update or create hospital settings
    // There should only be one record, so we use upsert
    const previousSettings = await prisma.hospitalSettings.findFirst();
    
    let settings;
    if (previousSettings) {
      settings = await prisma.hospitalSettings.update({
        where: { id: previousSettings.id },
        data: {
          ...(name !== undefined && { name: name || null }),
          ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
        },
      });
    } else {
      settings = await prisma.hospitalSettings.create({
        data: {
          name: name || null,
          logoUrl: logoUrl || null,
        },
      });
    }

    // Log audit entry
    await createAuditLog({
      action: AuditAction.HOSPITAL_SETTINGS_UPDATE,
      userId: user.id,
      details: {
        previousName: previousSettings?.name || null,
        newName: settings.name,
        previousLogoUrl: previousSettings?.logoUrl || null,
        newLogoUrl: settings.logoUrl,
        changes: {
          name: name !== undefined,
          logoUrl: logoUrl !== undefined,
        },
      },
      ipAddress: getIpAddress(request.headers),
    });

    return NextResponse.json({
      name: settings.name,
      logoUrl: settings.logoUrl,
    });
  } catch (error) {
    console.error("Error updating hospital settings:", error);
    return NextResponse.json(
      { error: "Failed to update hospital settings" },
      { status: 500 }
    );
  }
}

