import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";
import { deleteTemplateFromMeta } from "@/lib/whatsapp/templateApi";

/**
 * PATCH /api/admin/whatsapp-templates/[id] - Update template notification type mapping
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { notificationType } = body;

    const template = await prisma.whatsappTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.whatsappTemplate.update({
      where: { id },
      data: {
        notificationType: notificationType || null,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating WhatsApp template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/whatsapp-templates/[id] - Delete a template (locally + from Meta)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const template = await prisma.whatsappTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Try to delete from Meta API
    try {
      await deleteTemplateFromMeta(template.name);
    } catch (metaError) {
      console.error("Error deleting template from Meta (continuing local delete):", metaError);
      // Continue with local delete even if Meta fails
    }

    // Delete locally
    await prisma.whatsappTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting WhatsApp template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
