import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { encrypt } from "@/lib/encryption/crypto";

/**
 * GET /api/admin/whatsapp-settings - Get WhatsApp settings (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.whatsappSettings.findUnique({
      where: { id: "single" },
    });

    if (!settings) {
      return NextResponse.json({
        enabled: false,
        phoneNumberId: null,
        businessAccountId: null,
        accessToken: null,
      });
    }

    return NextResponse.json({
      enabled: settings.enabled,
      phoneNumberId: settings.phoneNumberId,
      businessAccountId: settings.businessAccountId,
      accessToken: settings.accessToken ? "***masked***" : null,
    });
  } catch (error) {
    console.error("Error fetching WhatsApp settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/whatsapp-settings - Update WhatsApp settings (Admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, phoneNumberId, businessAccountId, accessToken } = body;

    const encryptionKey = process.env.NEXTAUTH_SECRET;
    if (!encryptionKey) {
      return NextResponse.json(
        { error: "NEXTAUTH_SECRET not configured" },
        { status: 500 }
      );
    }

    const updateData: any = {};

    if (enabled !== undefined) {
      updateData.enabled = enabled;
    }

    if (phoneNumberId !== undefined) {
      updateData.phoneNumberId = phoneNumberId?.trim() || null;
    }

    if (businessAccountId !== undefined) {
      updateData.businessAccountId = businessAccountId?.trim() || null;
    }

    if (accessToken !== undefined) {
      if (accessToken && accessToken !== "***masked***") {
        updateData.accessToken = encrypt(accessToken, encryptionKey);
      } else if (accessToken === null || accessToken === "") {
        updateData.accessToken = null;
      }
    }

    const updatedSettings = await prisma.whatsappSettings.upsert({
      where: { id: "single" },
      update: updateData,
      create: {
        id: "single",
        enabled: enabled ?? false,
        phoneNumberId: phoneNumberId?.trim() || null,
        businessAccountId: businessAccountId?.trim() || null,
        accessToken: updateData.accessToken || null,
      },
    });

    return NextResponse.json({
      enabled: updatedSettings.enabled,
      phoneNumberId: updatedSettings.phoneNumberId,
      businessAccountId: updatedSettings.businessAccountId,
      accessToken: updatedSettings.accessToken ? "***masked***" : null,
    });
  } catch (error) {
    console.error("Error updating WhatsApp settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
