import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { fetchTemplatesFromMeta } from "@/lib/whatsapp/templateApi";
import { WhatsappTemplateStatus } from "@prisma/client";

/**
 * POST /api/admin/whatsapp-templates/sync - Sync template statuses from Meta API
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all templates from Meta
    const metaTemplates = await fetchTemplatesFromMeta();

    // Get all local templates
    const localTemplates = await prisma.whatsappTemplate.findMany();

    let synced = 0;

    for (const local of localTemplates) {
      // Find matching Meta template by name
      const metaTemplate = metaTemplates.find(
        (mt) => mt.name === local.name
      );

      if (metaTemplate) {
        // Map Meta status to our enum
        let newStatus: WhatsappTemplateStatus = WhatsappTemplateStatus.PENDING;
        if (metaTemplate.status === "APPROVED") {
          newStatus = WhatsappTemplateStatus.APPROVED;
        } else if (metaTemplate.status === "REJECTED") {
          newStatus = WhatsappTemplateStatus.REJECTED;
        }

        // Update local record if status or meta ID changed
        if (local.status !== newStatus || local.metaTemplateId !== metaTemplate.id) {
          await prisma.whatsappTemplate.update({
            where: { id: local.id },
            data: {
              status: newStatus,
              metaTemplateId: metaTemplate.id,
            },
          });
          synced++;
        }
      }
    }

    // Return updated templates
    const updatedTemplates = await prisma.whatsappTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      synced,
      templates: updatedTemplates,
    });
  } catch (error: any) {
    console.error("Error syncing WhatsApp templates:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync templates" },
      { status: 500 }
    );
  }
}
