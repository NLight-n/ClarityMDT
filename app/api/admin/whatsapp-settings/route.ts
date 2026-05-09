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
        provider: "META",
        phoneNumberId: null,
        businessAccountId: null,
        accessToken: null,
        accountId: null,
        wabaNumber: null,
      });
    }

    return NextResponse.json({
      enabled: settings.enabled,
      provider: settings.provider,
      phoneNumberId: settings.phoneNumberId,
      businessAccountId: settings.businessAccountId,
      accessToken: settings.accessToken ? "***masked***" : null,
      accountId: settings.accountId,
      wabaNumber: settings.wabaNumber,
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
    const {
      enabled,
      provider,
      phoneNumberId,
      businessAccountId,
      accessToken,
      accountId,
      wabaNumber,
    } = body;

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

    if (provider !== undefined) {
      updateData.provider = provider;
    }

    // Meta fields
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

    // Zestwings fields
    if (accountId !== undefined) {
      updateData.accountId = accountId?.trim() || null;
    }

    if (wabaNumber !== undefined) {
      updateData.wabaNumber = wabaNumber?.trim() || null;
    }

    const updatedSettings = await prisma.whatsappSettings.upsert({
      where: { id: "single" },
      update: updateData,
      create: {
        id: "single",
        enabled: enabled ?? false,
        provider: provider ?? "META",
        phoneNumberId: phoneNumberId?.trim() || null,
        businessAccountId: businessAccountId?.trim() || null,
        accessToken: updateData.accessToken || null,
        accountId: accountId?.trim() || null,
        wabaNumber: wabaNumber?.trim() || null,
      },
    });

    return NextResponse.json({
      enabled: updatedSettings.enabled,
      provider: updatedSettings.provider,
      phoneNumberId: updatedSettings.phoneNumberId,
      businessAccountId: updatedSettings.businessAccountId,
      accessToken: updatedSettings.accessToken ? "***masked***" : null,
      accountId: updatedSettings.accountId,
      wabaNumber: updatedSettings.wabaNumber,
    });
  } catch (error) {
    console.error("Error updating WhatsApp settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
