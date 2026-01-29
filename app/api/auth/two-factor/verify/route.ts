import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { verifyTwoFactorCode } from "@/lib/auth/twoFactor";
import { checkRateLimit, resetRateLimit, LOGIN_RATE_LIMIT } from "@/lib/security/rateLimit";
import { createAuditLog, AuditAction } from "@/lib/audit/logger";

/**
 * POST /api/auth/two-factor/verify - Verify 2FA code during login
 * 
 * This endpoint verifies the 2FA code and returns a temporary token
 * that can be used to complete the login process.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { loginId, password, code } = body;

        if (!loginId || !password || !code) {
            return NextResponse.json(
                { error: "Login ID, password, and verification code are required" },
                { status: 400 }
            );
        }

        // Rate limiting check
        const rateLimitResult = checkRateLimit(`2fa-verify:${loginId}`, LOGIN_RATE_LIMIT);
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
                name: true,
                loginId: true,
                passwordHash: true,
                role: true,
                departmentId: true,
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

        // Validate password again (security measure)
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return NextResponse.json(
                { error: "Invalid credentials" },
                { status: 401 }
            );
        }

        // Verify 2FA code
        const isCodeValid = await verifyTwoFactorCode(user.id, code);
        if (!isCodeValid) {
            return NextResponse.json(
                { error: "Invalid or expired verification code" },
                { status: 401 }
            );
        }

        // Reset rate limit on successful verification
        resetRateLimit(`2fa-verify:${loginId}`);
        resetRateLimit(`2fa:${loginId}`);
        resetRateLimit(`login:${loginId}`);

        // Create audit log for successful 2FA login
        await createAuditLog({
            action: AuditAction.LOGIN,
            userId: user.id,
            details: {
                loginId: user.loginId,
                role: user.role,
                twoFactorUsed: true,
            },
        }).catch((error) => {
            console.error("Error creating 2FA login audit log:", error);
        });

        // Return success - the frontend will use this to complete login via NextAuth
        return NextResponse.json({
            success: true,
            verified: true,
            message: "Two-factor authentication successful",
            // Include user info for session (will be used by NextAuth)
            user: {
                id: user.id,
                loginId: user.loginId,
            },
        });
    } catch (error: any) {
        console.error("Error verifying 2FA code:", error);
        return NextResponse.json(
            { error: error.message || "Verification failed" },
            { status: 500 }
        );
    }
}
