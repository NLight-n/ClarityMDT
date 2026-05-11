import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { getWhatsappSettings } from "@/lib/whatsapp/getSettings";
import { sendWhatsappTemplateMessage } from "@/lib/whatsapp/sendMessage";
import { WhatsappTemplateStatus } from "@prisma/client";

const sendOtpSchema = z.object({
  whatsappPhone: z.string().regex(/^\+[1-9]\d{6,14}$/),
});

const OTP_EXPIRY_MINUTES = 10;

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { whatsappPhone } = sendOtpSchema.parse(body);

    const settings = await getWhatsappSettings();
    if (!settings?.enabled) {
      return NextResponse.json(
        { error: "WhatsApp notifications are not enabled." },
        { status: 400 }
      );
    }

    // 1. Try to find a specific AUTHENTICATION template
    let template = await prisma.whatsappTemplate.findFirst({
      where: {
        category: "AUTHENTICATION",
        status: WhatsappTemplateStatus.APPROVED,
      },
    });

    // 2. Fall back to a generic approved template
    if (!template) {
      template = await prisma.whatsappTemplate.findFirst({
        where: {
          notificationType: null,
          status: WhatsappTemplateStatus.APPROVED,
        },
      });
    }

    if (!template) {
      return NextResponse.json(
        { error: "No approved WhatsApp OTP template available. Please contact admin." },
        { status: 400 }
      );
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Format for the 2-variable approved template:
    // {{1}} = Title (bold), {{2}} = OTP message
    const title = "WhatsApp Verification";
    const otpMessage = `Your verification code is: ${code}\n\nThis code will expire in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;

    await sendWhatsappTemplateMessage(
      whatsappPhone,
      template.name,
      template.language,
      [
        {
          type: "body",
          parameters: [
            { type: "text", text: title },
            { type: "text", text: otpMessage },
          ],
        },
      ]
    );

    await (prisma as any).whatsappVerification.upsert({
      where: { userId: user.id },
      update: {
        whatsappPhone,
        code,
        token: null,
        expiresAt,
        verifiedAt: null,
        consumedAt: null,
      },
      create: {
        userId: user.id,
        whatsappPhone,
        code,
        expiresAt,
      },
    });

    return NextResponse.json({
      success: true,
      message: "OTP sent to WhatsApp.",
      expiresAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error sending WhatsApp OTP:", error);
    return NextResponse.json(
      { error: "Failed to send WhatsApp OTP" },
      { status: 500 }
    );
  }
}
