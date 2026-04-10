import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { createTemplateInMeta } from "@/lib/whatsapp/templateApi";
import { WhatsappTemplateStatus } from "@prisma/client";

/**
 * GET /api/admin/whatsapp-templates - List all WhatsApp templates
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templates = await prisma.whatsappTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("Error fetching WhatsApp templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/whatsapp-templates - Create a new template (saves locally + submits to Meta)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, category, language, headerText, bodyText, footerText, notificationType } = body;

    // Validate required fields
    if (!name || !category || !bodyText) {
      return NextResponse.json(
        { error: "Name, category, and body text are required" },
        { status: 400 }
      );
    }

    // Validate template name format (lowercase alphanumeric + underscores only)
    if (!/^[a-z0-9_]+$/.test(name)) {
      return NextResponse.json(
        { error: "Template name must contain only lowercase letters, numbers, and underscores" },
        { status: 400 }
      );
    }

    // Check for duplicate name locally
    const existing = await prisma.whatsappTemplate.findUnique({
      where: { name },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A template with this name already exists" },
        { status: 409 }
      );
    }

    // Try to submit to Meta API
    let metaTemplateId: string | null = null;
    let status: WhatsappTemplateStatus = WhatsappTemplateStatus.PENDING;

    try {
      const metaResult = await createTemplateInMeta({
        name,
        category,
        language: language || "en_US",
        headerText,
        bodyText,
        footerText,
      });
      metaTemplateId = metaResult.id;
      // Map Meta status to our enum
      if (metaResult.status === "APPROVED") {
        status = WhatsappTemplateStatus.APPROVED;
      } else if (metaResult.status === "REJECTED") {
        status = WhatsappTemplateStatus.REJECTED;
      }
    } catch (metaError: any) {
      console.error("Meta API error:", metaError);
      // Save locally even if Meta fails, mark as PENDING
      // Admin can retry sync later
    }

    // Save locally
    const template = await prisma.whatsappTemplate.create({
      data: {
        name,
        category,
        language: language || "en_US",
        headerText: headerText || null,
        bodyText,
        footerText: footerText || null,
        status,
        metaTemplateId,
        notificationType: notificationType || null,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("Error creating WhatsApp template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
