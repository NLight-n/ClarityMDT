import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";

const verifyOtpSchema = z.object({
  whatsappPhone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  otp: z.string().regex(/^\d{6}$/),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { whatsappPhone, otp } = verifyOtpSchema.parse(body);

    const verification = await (prisma as any).whatsappVerification.findUnique({
      where: { userId: user.id },
    });

    if (!verification || verification.whatsappPhone !== whatsappPhone) {
      return NextResponse.json(
        { error: "No OTP request found for this phone number." },
        { status: 400 }
      );
    }

    if (verification.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "OTP has expired. Please request a new OTP." },
        { status: 400 }
      );
    }

    if (verification.code !== otp) {
      return NextResponse.json(
        { error: "Invalid OTP. Please try again." },
        { status: 400 }
      );
    }

    const token = randomUUID();

    await (prisma as any).whatsappVerification.update({
      where: { userId: user.id },
      data: {
        verifiedAt: new Date(),
        token,
      },
    });

    return NextResponse.json({
      success: true,
      verificationToken: token,
      message: "WhatsApp OTP verified successfully.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error verifying WhatsApp OTP:", error);
    return NextResponse.json(
      { error: "Failed to verify WhatsApp OTP" },
      { status: 500 }
    );
  }
}
