import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";

/**
 * POST /api/telegram/webhook - Telegram bot webhook endpoint
 * Receives updates from Telegram and links user's Telegram ID using verification codes
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret if configured
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret) {
      const secret = request.headers.get("x-telegram-webhook-secret");
      if (secret !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const update = await request.json();

    // Handle message updates
    if (update.message && update.message.text) {
      const message = update.message;
      const telegramId = String(message.from.id);
      const text = message.text.trim().toUpperCase();

      // Check if message contains a verification code (8 characters, alphanumeric)
      const codeMatch = text.match(/^([A-F0-9]{8})$/);
      
      if (codeMatch) {
        const code = codeMatch[1];
        
        // Find verification code in database
        const verification = await prisma.telegramVerification.findUnique({
          where: { code: code },
          include: { user: true },
        });

        if (!verification) {
          // Code not found - send error message
          await sendTelegramMessage({
            chatId: telegramId,
            text: "❌ Invalid verification code. Please check the code and try again.",
          });
          return NextResponse.json({ ok: true });
        }

        // Check if code has expired
        if (new Date() > verification.expiresAt) {
          // Delete expired verification
          await prisma.telegramVerification.delete({
            where: { id: verification.id },
          });
          
          await sendTelegramMessage({
            chatId: telegramId,
            text: "❌ Verification code has expired. Please generate a new code from the MDT App.",
          });
          return NextResponse.json({ ok: true });
        }

        // Check if this Telegram ID is already linked to another user
        const existingUser = await prisma.user.findFirst({
          where: {
            telegramId: telegramId,
            id: { not: verification.userId },
          },
        });

        if (existingUser) {
          await sendTelegramMessage({
            chatId: telegramId,
            text: "❌ This Telegram account is already linked to another user.",
          });
          return NextResponse.json({ ok: true });
        }

        // Link Telegram ID to user
        await prisma.user.update({
          where: { id: verification.userId },
          data: { telegramId: telegramId },
        });

        // Delete used verification code
        await prisma.telegramVerification.delete({
          where: { id: verification.id },
        });

        // Send success message
        await sendTelegramMessage({
          chatId: telegramId,
          text: `✅ Successfully linked! Your Telegram account is now connected to ${verification.user.name}.\n\nYou will now receive notifications from the MDT App.`,
        });
        
        return NextResponse.json({ ok: true });
      }

      // If user sends /start or /help, provide instructions
      if (text === "/START" || text === "/HELP" || text.startsWith("/")) {
        await sendTelegramMessage({
          chatId: telegramId,
          text: "👋 Hello! To link your Telegram account to MDT App:\n\n1. Go to your profile in the MDT App\n2. Click 'Link Telegram Account'\n3. Copy the verification code shown\n4. Send that code to this bot\n\nYour code will be valid for 10 minutes.",
        });
        return NextResponse.json({ ok: true });
      }

      // If message doesn't match a code, provide instructions
      await sendTelegramMessage({
        chatId: telegramId,
        text: "📝 Please send your 8-character verification code to link your account.\n\nTo get a code:\n1. Open the MDT App\n2. Go to your Profile\n3. Click 'Link Telegram Account'",
      });
      return NextResponse.json({ ok: true });
    }

    // Return success to Telegram
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error processing Telegram webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

