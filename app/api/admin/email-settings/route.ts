import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { encrypt, decrypt } from "@/lib/encryption/crypto";

/**
 * GET /api/admin/email-settings - Get Email settings (Admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const settings = await prisma.emailSettings.findUnique({
      where: { id: "single" },
    });

    if (!settings) {
      // Return default settings if none exist
      return NextResponse.json({
        enabled: false,
        host: null,
        port: null,
        secure: false,
        username: null,
        password: null,
        fromEmail: null,
        fromName: null,
      });
    }

    // Return settings with masked password
    return NextResponse.json({
      enabled: settings.enabled,
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      username: settings.username,
      password: settings.password ? "***masked***" : null,
      fromEmail: settings.fromEmail,
      fromName: settings.fromName,
    });
  } catch (error) {
    console.error("Error fetching Email settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/email-settings - Update Email settings (Admin only)
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { enabled, host, port, secure, username, password, fromEmail, fromName } = body;

    // Get encryption key from env
    const encryptionKey = process.env.NEXTAUTH_SECRET;
    if (!encryptionKey) {
      return NextResponse.json(
        { error: "NEXTAUTH_SECRET not configured" },
        { status: 500 }
      );
    }

    // Prepare update data
    const updateData: any = {};

    if (enabled !== undefined) {
      updateData.enabled = enabled;
    }

    if (host !== undefined) {
      updateData.host = host?.trim() || null;
    }

    if (port !== undefined) {
      updateData.port = port ? parseInt(port) : null;
    }

    if (secure !== undefined) {
      updateData.secure = secure;
    }

    if (username !== undefined) {
      updateData.username = username?.trim() || null;
    }

    if (password !== undefined) {
      if (password && password !== "***masked***") {
        // Encrypt the password
        updateData.password = encrypt(password, encryptionKey);
      } else if (password === null || password === "") {
        updateData.password = null;
      }
      // If password is "***masked***", don't update it
    }

    if (fromEmail !== undefined) {
      updateData.fromEmail = fromEmail?.trim() || null;
    }

    if (fromName !== undefined) {
      updateData.fromName = fromName?.trim() || null;
    }

    // Update or create settings
    const updatedSettings = await prisma.emailSettings.upsert({
      where: { id: "single" },
      update: updateData,
      create: {
        id: "single",
        enabled: enabled ?? false,
        host: host?.trim() || null,
        port: port ? parseInt(port) : null,
        secure: secure ?? false,
        username: username?.trim() || null,
        password: updateData.password || null,
        fromEmail: fromEmail?.trim() || null,
        fromName: fromName?.trim() || null,
      },
    });

    // Return updated settings with masked password
    return NextResponse.json({
      enabled: updatedSettings.enabled,
      host: updatedSettings.host,
      port: updatedSettings.port,
      secure: updatedSettings.secure,
      username: updatedSettings.username,
      password: updatedSettings.password ? "***masked***" : null,
      fromEmail: updatedSettings.fromEmail,
      fromName: updatedSettings.fromName,
    });
  } catch (error) {
    console.error("Error updating Email settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

