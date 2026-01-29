import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createAndSendTwoFactorCode } from "@/lib/auth/twoFactor";
import { checkRateLimit, LOGIN_RATE_LIMIT } from "@/lib/security/rateLimit";

/**
 * POST /api/auth/two-factor/send - Send 2FA code for login
 * 
 * This endpoint validates the user's credentials and sends a 2FA code
 * if the credentials are valid and 2FA is enabled.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { loginId, password } = body;

        if (!loginId || !password) {
            return NextResponse.json(
                { error: "Login ID and password are required" },
                { status: 400 }
            );
        }

        // Rate limiting check
        const rateLimitResult = checkRateLimit(`2fa:${loginId}`, LOGIN_RATE_LIMIT);
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                {
                    error: rateLimitResult.isLocked
                        ? `Too many attempts. Try again in ${Math.ceil((rateLimitResult.lockoutRemaining || 1800) / 60)} minutes.`
                        : "Too many requests. Please try again later."
                },
                { status: 429 }
            );
        }

        // Find the user
        const user = await prisma.user.findUnique({
            where: { loginId },
            select: {
                id: true,
                passwordHash: true,
                telegramId: true,
                twoFactorEnabled: true,
            },
        });

        if (!user) {
            return NextResponse.json(
                { error: "Invalid credentials" },
                { status: 401 }
            );
        }

        // Validate password
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return NextResponse.json(
                { error: "Invalid credentials" },
                { status: 401 }
            );
        }

        // Check if 2FA is enabled
        if (!user.twoFactorEnabled || !user.telegramId) {
            return NextResponse.json(
                {
                    requiresTwoFactor: false,
                    message: "2FA not enabled for this user"
                },
                { status: 200 }
            );
        }

        // Send 2FA code
        const result = await createAndSendTwoFactorCode(user.id);

        return NextResponse.json({
            requiresTwoFactor: true,
            codeSent: true,
            expiresAt: result.expiresAt.toISOString(),
            message: "Verification code sent to your Telegram",
        });
    } catch (error: any) {
        console.error("Error sending 2FA code:", error);
        return NextResponse.json(
            { error: error.message || "Failed to send verification code" },
            { status: 500 }
        );
    }
}
