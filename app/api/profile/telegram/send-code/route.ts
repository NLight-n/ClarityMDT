import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { randomBytes } from "crypto";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";

/**
 * POST /api/profile/telegram/send-code - Send verification code to a Telegram user ID
 * User provides their Telegram ID, and we send them a verification code
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user already has Telegram linked
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { telegramId: true },
    });

    if (userData?.telegramId) {
      return NextResponse.json(
        { error: "Telegram account is already linked" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { telegramIdentifier } = body; // Can be username or numeric ID

    // Validate input format
    if (!telegramIdentifier || typeof telegramIdentifier !== "string") {
      return NextResponse.json(
        { error: "Telegram username or ID is required" },
        { status: 400 }
      );
    }

    // Normalize the identifier (remove @ if present, trim whitespace)
    let normalizedIdentifier = telegramIdentifier.trim().replace(/^@/, "");
    
    // Determine if it's a username or numeric ID
    const isNumericId = /^\d+$/.test(normalizedIdentifier);
    let chatId: string;
    let actualTelegramId: string | null = null;

    // If it's a username, we'll need to get the chat ID from the message response
    // If it's numeric, use it directly
    if (isNumericId) {
      chatId = normalizedIdentifier;
      actualTelegramId = normalizedIdentifier;
    } else {
      // It's a username - validate format (alphanumeric and underscores, 5-32 chars)
      if (!/^[a-zA-Z0-9_]{5,32}$/.test(normalizedIdentifier)) {
        return NextResponse.json(
          { error: "Invalid Telegram username format. Username must be 5-32 characters and contain only letters, numbers, and underscores." },
          { status: 400 }
        );
      }
      chatId = normalizedIdentifier; // Use username for sending message
    }

    // Check if this Telegram ID is already linked to another user (only if we have numeric ID)
    if (actualTelegramId) {
      const existingUser = await prisma.user.findFirst({
        where: {
          telegramId: actualTelegramId,
          id: { not: user.id },
        },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: "This Telegram account is already linked to another user" },
          { status: 400 }
        );
      }
    }

    // Generate a random 8-character code
    const code = randomBytes(4).toString("hex").toUpperCase();

    // Delete any existing verification code for this user
    await prisma.telegramVerification.deleteMany({
      where: { userId: user.id },
    });

    // Create new verification code (expires in 10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Get Telegram settings from database
    const { getTelegramSettings } = await import("@/lib/telegram/getSettings");
    const telegramSettings = await getTelegramSettings();
    
    if (!telegramSettings || !telegramSettings.botToken) {
      return NextResponse.json(
        { error: "Telegram is not configured or disabled. Please contact an administrator." },
        { status: 400 }
      );
    }

    const botToken = telegramSettings.botToken;

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🔐 Verification Code for MDT App\n\nYour verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nEnter this code in the MDT App to link your Telegram account.`,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw error;
      }

      const result = await response.json();
      
      // Extract numeric chat ID from response (if username was used)
      if (!actualTelegramId && result.ok && result.result?.chat?.id) {
        actualTelegramId = String(result.result.chat.id);
        
        // Check if this Telegram ID is already linked to another user
        const existingUser = await prisma.user.findFirst({
          where: {
            telegramId: actualTelegramId,
            id: { not: user.id },
          },
        });

        if (existingUser) {
          return NextResponse.json(
            { error: "This Telegram account is already linked to another user" },
            { status: 400 }
          );
        }
      }

      // Now create verification record with the numeric ID
      await prisma.telegramVerification.create({
        data: {
          userId: user.id,
          code: code,
          expiresAt: expiresAt,
          telegramId: actualTelegramId, // Will be set if numeric ID provided or extracted from username
        },
      });
    } catch (error: any) {
      console.error("Error sending Telegram message:", error);
      
      // Check if it's a "chat not found" error
      if (error.error_code === 400 && error.description?.includes("chat not found")) {
        const botUsername = telegramSettings.botName || "the bot";
        
        return NextResponse.json(
          { 
            error: `Cannot send message. You need to start a conversation with the bot first.\n\nSteps:\n1. Open Telegram\n2. Search for @${botUsername}\n3. Click "Start" or send /start\n4. Then try sending the verification code again` 
          },
          { status: 400 }
        );
      }
      
      // Generic error
      const botUsername = telegramSettings.botName || "the bot";
      
      return NextResponse.json(
        { 
          error: `Failed to send verification code. Please ensure:\n1. You have started a conversation with the bot (@${botUsername})\n2. Your Telegram ID is correct\n3. The bot is active\n\nError: ${error.description || error.message || "Unknown error"}` 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Verification code sent successfully to your Telegram account",
      expiresIn: 10, // minutes
    });
  } catch (error) {
    console.error("Error sending verification code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

