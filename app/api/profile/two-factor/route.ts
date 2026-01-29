import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { setTwoFactorEnabled, getTwoFactorStatus } from "@/lib/auth/twoFactor";

/**
 * GET /api/profile/two-factor - Get 2FA status
 */
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUserFromRequest(request);

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const status = await getTwoFactorStatus(user.id);

        return NextResponse.json(status);
    } catch (error) {
        console.error("Error getting 2FA status:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/profile/two-factor - Enable or disable 2FA
 */
export async function PATCH(request: NextRequest) {
    try {
        const user = await getCurrentUserFromRequest(request);

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { enabled } = body;

        if (typeof enabled !== "boolean") {
            return NextResponse.json(
                { error: "Invalid request: enabled must be a boolean" },
                { status: 400 }
            );
        }

        const result = await setTwoFactorEnabled(user.id, enabled);

        return NextResponse.json({
            success: true,
            twoFactorEnabled: result.twoFactorEnabled,
            message: enabled
                ? "Two-factor authentication enabled successfully"
                : "Two-factor authentication disabled successfully",
        });
    } catch (error: any) {
        console.error("Error updating 2FA status:", error);

        if (error.message === "Cannot enable 2FA without a linked Telegram account") {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
