/**
 * Utility functions for sending WhatsApp notifications via Meta Cloud API
 */

import { getWhatsappSettings } from "./getSettings";
import { prisma } from "@/lib/prisma";
import { NotificationType, WhatsappTemplateStatus } from "@prisma/client";

const META_API_VERSION = "v21.0";

/**
 * Convert E.164 phone number to digits-only format for Meta API
 * e.g. "+919876543210" -> "919876543210"
 */
function toMetaPhoneFormat(phone: string): string {
  return phone.replace(/^\+/, "");
}

interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters?: Array<{
    type: "text";
    text: string;
  }>;
  sub_type?: string;
  index?: number;
}

/**
 * Send a WhatsApp template message to a phone number
 */
export async function sendWhatsappTemplateMessage(
  phone: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[]
): Promise<boolean> {
  const settings = await getWhatsappSettings();

  if (!settings || !settings.accessToken || !settings.phoneNumberId) {
    console.error("WhatsApp not configured or disabled");
    throw new Error("WhatsApp not configured or disabled");
  }

  const recipientPhone = toMetaPhoneFormat(phone);

  const body: any = {
    messaging_product: "whatsapp",
    to: recipientPhone,
    type: "template",
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
    },
  };

  if (components && components.length > 0) {
    body.template.components = components;
  }

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${settings.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("Error sending WhatsApp message:", error);
    throw error;
  }

  return true;
}

/**
 * Send a notification to a user by their WhatsApp phone number
 * Looks up the approved template for the given notification type and sends it
 * @param whatsappPhone - User's WhatsApp phone in E.164 format
 * @param notificationType - The notification type to look up template for
 * @param params - Template body parameters ({{1}}, {{2}}, etc.)
 * @returns true if sent, false if no template found or send failed
 */
export async function sendWhatsappNotificationToUser(
  whatsappPhone: string,
  notificationType: NotificationType,
  params: string[]
): Promise<boolean> {
  try {
    // Find an approved template for this notification type
    const template = await prisma.whatsappTemplate.findFirst({
      where: {
        notificationType: notificationType,
        status: WhatsappTemplateStatus.APPROVED,
      },
    });

    if (!template) {
      // No approved template for this type — skip silently
      return false;
    }

    const components: TemplateComponent[] = [];
    if (params.length > 0) {
      components.push({
        type: "body",
        parameters: params.map((text) => ({ type: "text" as const, text })),
      });
    }

    return await sendWhatsappTemplateMessage(
      whatsappPhone,
      template.name,
      template.language,
      components.length > 0 ? components : undefined
    );
  } catch (error) {
    console.error(
      `Failed to send WhatsApp notification to ${whatsappPhone}:`,
      error
    );
    return false;
  }
}

/**
 * Send WhatsApp notifications to multiple phone numbers
 * @param phones - Array of phone numbers in E.164 format
 * @param notificationType - The notification type
 * @param params - Template body parameters
 * @returns Number of successful sends
 */
export async function sendBulkWhatsappNotifications(
  phones: string[],
  notificationType: NotificationType,
  params: string[]
): Promise<number> {
  const results = await Promise.allSettled(
    phones.map((phone) =>
      sendWhatsappNotificationToUser(phone, notificationType, params)
    )
  );
  return results.filter(
    (result) => result.status === "fulfilled" && result.value === true
  ).length;
}
