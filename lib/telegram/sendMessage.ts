/**
 * Utility functions for sending Telegram notifications
 */

import { getTelegramSettings } from "./getSettings";

interface SendMessageOptions {
  chatId: string;
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
}

/**
 * Send a message to a Telegram user
 * @param options - Message options including chatId and text
 * @returns Promise that resolves to true if successful, throws error otherwise
 */
export async function sendTelegramMessage(
  options: SendMessageOptions
): Promise<boolean> {
  const settings = await getTelegramSettings();
  
  if (!settings || !settings.botToken) {
    console.error("Telegram bot token not configured or Telegram is disabled");
    throw new Error("Telegram bot token not configured or Telegram is disabled");
  }
  
  const botToken = settings.botToken;

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: options.chatId,
        text: options.text,
        parse_mode: options.parseMode,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("Error sending Telegram message:", error);
    // Throw the error so the caller can handle it appropriately
    throw error;
  }

  return true;
}

/**
 * Send a notification to a user by their Telegram ID
 * @param telegramId - User's Telegram ID
 * @param message - Message text to send
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function sendNotificationToUser(
  telegramId: string,
  message: string
): Promise<boolean> {
  try {
    return await sendTelegramMessage({
      chatId: telegramId,
      text: message,
    });
  } catch (error) {
    // Silently fail for notifications - they're non-critical
    console.error(`Failed to send Telegram notification to ${telegramId}:`, error);
    return false;
  }
}

/**
 * Send notifications to multiple users
 * @param telegramIds - Array of Telegram IDs
 * @param message - Message text to send
 * @returns Promise that resolves to number of successful sends
 */
export async function sendBulkNotifications(
  telegramIds: string[],
  message: string
): Promise<number> {
  const results = await Promise.allSettled(
    telegramIds.map((id) => sendNotificationToUser(id, message))
  );
  return results.filter((result) => result.status === "fulfilled" && result.value === true).length;
}

