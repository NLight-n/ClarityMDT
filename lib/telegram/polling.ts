/**
 * Telegram bot polling implementation
 * Use this for local development or when webhook is not available
 * 
 * ARCHITECTURE:
 * - There is ONLY ONE global polling interval that fetches ALL Telegram updates
 * - Multiple users can have active verification sessions simultaneously
 * - The global polling processes all incoming messages and matches them against
 *   all active verification codes in the database
 * - When a user starts verification, they are added to activeUserPollings Map
 * - When the last user finishes/cancels, the global polling stops
 * - This ensures efficient resource usage and prevents duplicate polling
 */

import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "./sendMessage";
import { getTelegramSettings } from "./getSettings";

// SINGLE global polling interval - shared by all users
let globalPollingInterval: NodeJS.Timeout | null = null;
let lastUpdateId = 0;
let abortController: AbortController | null = null;

// Track which users have active verification sessions (but they all share the same global polling)
let activeUserPollings = new Map<string, { timeout: NodeJS.Timeout; code: string; startTime: Date }>();

/**
 * Start global polling for Telegram updates (for all users)
 * Call this when your server starts (e.g., in a background job or API route)
 */
export async function startTelegramPolling() {
  const settings = await getTelegramSettings();
  
  if (!settings || !settings.botToken) {
    console.error("Telegram bot token not configured or Telegram is disabled. Telegram polling disabled.");
    return;
  }
  
  const botToken = settings.botToken;

  // Stop any existing polling
  if (globalPollingInterval) {
    stopTelegramPolling();
  }

  console.log("Starting Telegram bot polling...");

  // Poll every 2 seconds
  globalPollingInterval = setInterval(async () => {
    // Double-check polling is still active before processing
    if (!globalPollingInterval) {
      return;
    }

    try {
      await processTelegramUpdates(botToken);
    } catch (error) {
      // Only log error if polling is still active
      if (globalPollingInterval) {
        console.error("Error in Telegram polling:", error);
      }
    }
  }, 2000);
}

/**
 * Stop global polling for Telegram updates
 */
export function stopTelegramPolling() {
  if (globalPollingInterval) {
    const intervalId = globalPollingInterval;
    globalPollingInterval = null; // Set to null FIRST to prevent new executions
    clearInterval(intervalId);
    
    // Abort any in-flight fetch requests
    if (abortController) {
      console.log("Aborting in-flight Telegram fetch request...");
      abortController.abort();
      abortController = null;
    }
    
    console.log("Stopped Telegram bot polling");
  } else {
    console.log("Global polling was not active");
  }
}

/**
 * Start polling for a specific user's verification code
 * 
 * NOTE: This does NOT create a separate polling interval per user.
 * Instead, it adds the user to the activeUserPollings Map and ensures
 * the SINGLE global polling is running. All users share the same global
 * polling mechanism for efficiency.
 * 
 * Polling will automatically stop after 10 minutes or when Telegram ID is linked
 */
export async function startUserTelegramPolling(userId: string, code: string) {
  const settings = await getTelegramSettings();
  
  if (!settings || !settings.botToken) {
    console.error("Telegram bot token not configured or Telegram is disabled. Cannot start user polling.");
    return;
  }

  // Stop any existing polling session for this user (if they had a previous one)
  if (activeUserPollings.has(userId)) {
    const existing = activeUserPollings.get(userId);
    if (existing) {
      clearTimeout(existing.timeout);
    }
    activeUserPollings.delete(userId);
  }

  // Start the SINGLE global polling if not already running
  // This global polling will handle ALL users' verification codes
  if (!globalPollingInterval) {
    startTelegramPolling();
  }

  const startTime = new Date();
  const expiresAt = new Date(startTime.getTime() + 10 * 60 * 1000); // 10 minutes

  // Set timeout to stop polling for this user after 10 minutes
  const timeout = setTimeout(() => {
    activeUserPollings.delete(userId);
    console.log(`Stopped polling for user ${userId} (timeout)`);
    
    // If no more active pollings, stop global polling
    if (activeUserPollings.size === 0 && globalPollingInterval) {
      stopTelegramPolling();
    }
  }, 10 * 60 * 1000);

  activeUserPollings.set(userId, { timeout, code, startTime });
  console.log(`Started polling for user ${userId} with code ${code}`);
}

/**
 * Stop polling for a specific user (called when Telegram ID is successfully linked or user cancels)
 */
export function stopUserTelegramPolling(userId: string) {
  if (activeUserPollings.has(userId)) {
    const existing = activeUserPollings.get(userId);
    if (existing) {
      clearTimeout(existing.timeout);
    }
    activeUserPollings.delete(userId);
    console.log(`Stopped polling for user ${userId}. Remaining active users: ${activeUserPollings.size}`);
    
    // If no more active pollings, stop global polling
    if (activeUserPollings.size === 0 && globalPollingInterval) {
      console.log("No more active users, stopping global polling...");
      stopTelegramPolling();
    }
  } else {
    console.log(`User ${userId} was not in active pollings (may have already been stopped)`);
  }
}

/**
 * Process Telegram updates
 * 
 * This function is called by the SINGLE global polling interval.
 * It processes ALL incoming Telegram messages and matches them against
 * ALL active verification codes from ALL users.
 */
async function processTelegramUpdates(botToken: string) {
  // Check if polling is still active before processing
  // This prevents processing after polling has been stopped
  if (!globalPollingInterval) {
    return;
  }

  // If no active users, stop processing (shouldn't happen, but safety check)
  if (activeUserPollings.size === 0) {
    return;
  }

  try {
    // Double-check polling is still active before making request
    if (!globalPollingInterval) {
      return;
    }
    
    // Create new AbortController for this request
    abortController = new AbortController();
    const signal = abortController.signal;
    
    // Get updates from Telegram (fetches ALL messages, not per-user)
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=1`,
      {
        method: "GET",
        signal: signal,
      }
    );

    // Check again if polling was stopped during the fetch
    if (!globalPollingInterval) {
      return;
    }

    if (!response.ok) {
      // Only log error if polling is still active
      if (globalPollingInterval) {
        console.error("Failed to fetch Telegram updates");
      }
      return;
    }

    const data = await response.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return;
    }

    // Process each update (these could be from ANY user trying to link)
    for (const update of data.result) {
      // Check again if polling was stopped during processing
      if (!globalPollingInterval) {
        return;
      }

      lastUpdateId = Math.max(lastUpdateId, update.update_id);

      // Handle message updates - this will check against ALL active verification codes
      if (update.message && update.message.text) {
        await handleTelegramMessage(update.message);
      }
    }
  } catch (error: any) {
    // Silently ignore abort errors (polling was stopped)
    if (error?.name === "AbortError") {
      return;
    }
    
    // Only log error if polling is still active
    if (globalPollingInterval) {
      // Don't log timeout errors if they occur after polling was stopped
      if (error?.code === "UND_ERR_CONNECT_TIMEOUT" && !globalPollingInterval) {
        return;
      }
      console.error("Error processing Telegram updates:", error);
    }
  } finally {
    // Clear abort controller after request completes
    abortController = null;
  }
}

/**
 * Handle incoming Telegram message
 * 
 * This function processes messages from the SINGLE global polling.
 * It checks the message against ALL active verification codes in the database
 * to determine which user (if any) this message belongs to.
 */
async function handleTelegramMessage(message: any) {
  const telegramId = String(message.from.id);
  const text = message.text.trim().toUpperCase();

  // Check if message is "/start CODE" format (from deep link)
  let code: string | null = null;
  const startCodeMatch = text.match(/^\/START\s+([A-F0-9]{8})$/);
  if (startCodeMatch) {
    code = startCodeMatch[1];
  } else {
    // Check if message contains just a verification code (8 characters, alphanumeric)
    const codeMatch = text.match(/^([A-F0-9]{8})$/);
    if (codeMatch) {
      code = codeMatch[1];
    }
  }

  if (code) {
    // Find verification code in database (could be from ANY user)
    const verification = await prisma.telegramVerification.findUnique({
      where: { code: code },
      include: { user: true },
    });

    if (!verification) {
      try {
        await sendTelegramMessage({
          chatId: telegramId,
          text: "❌ Invalid verification code. Please check the code and try again.",
        });
      } catch (error) {
        console.error("Error sending Telegram message:", error);
      }
      return;
    }

    // Check if this user has an active polling session
    if (!activeUserPollings.has(verification.userId)) {
      try {
        await sendTelegramMessage({
          chatId: telegramId,
          text: "❌ This verification code is no longer active. Please generate a new code from the MDT App.",
        });
      } catch (error) {
        console.error("Error sending Telegram message:", error);
      }
      // Clean up expired verification
      await prisma.telegramVerification.delete({
        where: { id: verification.id },
      });
      return;
    }

    // Check if code has expired
    if (new Date() > verification.expiresAt) {
      await prisma.telegramVerification.delete({
        where: { id: verification.id },
      });

      await sendTelegramMessage({
        chatId: telegramId,
        text: "❌ Verification code has expired. Please generate a new code from the MDT App.",
      });
      return;
    }

    // Check if this Telegram ID is already linked to another user
    const existingUser = await prisma.user.findFirst({
      where: {
        telegramId: telegramId,
        id: { not: verification.userId },
      },
    });

    if (existingUser) {
      try {
        await sendTelegramMessage({
          chatId: telegramId,
          text: "❌ This Telegram account is already linked to another user.",
        });
      } catch (error) {
        console.error("Error sending Telegram message:", error);
      }
      return;
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

    // Stop polling for this user since verification is complete
    stopUserTelegramPolling(verification.userId);

    // Send success message
    try {
      await sendTelegramMessage({
        chatId: telegramId,
        text: `✅ Successfully linked! Your Telegram account is now connected to ${verification.user.name}.\n\nYou will now receive notifications from the MDT App.`,
      });
    } catch (error) {
      console.error("Error sending Telegram message:", error);
    }
    return;
  }

  // If user sends /start without code or /help, provide instructions
  if (text === "/START" || text === "/HELP" || (text.startsWith("/") && !code)) {
    try {
      await sendTelegramMessage({
        chatId: telegramId,
        text: "👋 Hello! To link your Telegram account to MDT App:\n\n1. Go to your profile in the MDT App\n2. Click 'Link Telegram Account'\n3. Click the button to open Telegram (or copy the code and send it here)\n\nYour code will be valid for 10 minutes.",
      });
    } catch (error) {
      console.error("Error sending Telegram message:", error);
    }
    return;
  }

  // If message doesn't match a code, provide instructions
  try {
    await sendTelegramMessage({
      chatId: telegramId,
      text: "📝 Please send your 8-character verification code to link your account.\n\nTo get a code:\n1. Open the MDT App\n2. Go to your Profile\n3. Click 'Link Telegram Account'",
    });
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
}

