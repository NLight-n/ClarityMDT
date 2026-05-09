/**
 * Utility functions for sending WhatsApp notifications
 * Supports both Meta Cloud API (direct) and Zestwings aggregator API
 */

import { getWhatsappSettings, WhatsappSettingsResult } from "./getSettings";
import { prisma } from "@/lib/prisma";
import { NotificationType, WhatsappTemplateStatus } from "@prisma/client";

const META_API_VERSION = "v21.0";

/**
 * Convert E.164 phone number to digits-only format
 * e.g. "+919876543210" -> "919876543210"
 */
function toDigitsOnly(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
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

// ─────────────────────────────────────────────────────────
// Meta Cloud API (direct)
// ─────────────────────────────────────────────────────────

async function sendViaMetaApi(
  settings: WhatsappSettingsResult,
  recipientPhone: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[]
): Promise<boolean> {
  if (!settings.accessToken || !settings.phoneNumberId) {
    throw new Error("Meta WhatsApp not configured: missing accessToken or phoneNumberId");
  }

  const body: any = {
    messaging_product: "whatsapp",
    to: toDigitsOnly(recipientPhone),
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
    console.error("Error sending WhatsApp message via Meta:", error);
    throw error;
  }

  return true;
}

// ─────────────────────────────────────────────────────────
// Zestwings Aggregator API
// ─────────────────────────────────────────────────────────

async function sendViaZestwings(
  settings: WhatsappSettingsResult,
  recipientPhone: string,
  templateName: string,
  components?: TemplateComponent[],
  fileUrl?: string,
  visitId?: string,
  mrNo?: string
): Promise<boolean> {
  if (!settings.accountId || !settings.businessAccountId || !settings.wabaNumber) {
    throw new Error(
      "Zestwings WhatsApp not configured: missing accountId, businessAccountId (WABA ID), or wabaNumber"
    );
  }

  // Build multipart form data
  const formData = new FormData();
  formData.append("account_ID", settings.accountId);
  formData.append("whatsappaccount_ID", settings.businessAccountId);
  formData.append("waba_number", settings.wabaNumber);
  formData.append("mobile_no", toDigitsOnly(recipientPhone));
  formData.append("template_id", templateName);

  // Extract body_parameters and header_parameters from components
  if (components && components.length > 0) {
    const bodyComponent = components.find((c) => c.type === "body");
    if (bodyComponent?.parameters && bodyComponent.parameters.length > 0) {
      const bodyParams = bodyComponent.parameters.map((p) => p.text).join(",");
      formData.append("body_parameters", bodyParams);
    }

    const headerComponent = components.find((c) => c.type === "header");
    if (headerComponent?.parameters && headerComponent.parameters.length > 0) {
      const headerParams = headerComponent.parameters.map((p) => p.text).join(",");
      formData.append("header_parameters", headerParams);
    }
  }

  // Optional file attachment (public URL to a PDF)
  if (fileUrl) {
    formData.append("file", fileUrl);
  }

  // Optional reference fields
  if (visitId) {
    formData.append("visit_id", visitId);
  }
  if (mrNo) {
    formData.append("mr_no", mrNo);
  }

  const response = await fetch("https://waba.zestwings.com/api.waba", {
    method: "POST",
    body: formData,
    // Note: Don't set Content-Type header — fetch sets it automatically with boundary for FormData
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Error sending WhatsApp message via Zestwings:", errorText);
    throw new Error(`Zestwings API error: ${response.status} — ${errorText}`);
  }

  const result = await response.json();
  if (result.status !== "success") {
    console.error("Zestwings API returned non-success:", result);
    throw new Error(`Zestwings API error: ${JSON.stringify(result)}`);
  }

  console.log("Zestwings message sent. message_id:", result.message_id);
  return true;
}

// ─────────────────────────────────────────────────────────
// Public API (provider-agnostic)
// ─────────────────────────────────────────────────────────

/**
 * Send a WhatsApp template message to a phone number
 * Automatically routes through the configured provider (Meta or Zestwings)
 */
export async function sendWhatsappTemplateMessage(
  phone: string,
  templateName: string,
  languageCode: string,
  components?: TemplateComponent[]
): Promise<boolean> {
  const settings = await getWhatsappSettings();

  if (!settings) {
    console.error("WhatsApp not configured or disabled");
    throw new Error("WhatsApp not configured or disabled");
  }

  if (settings.provider === "ZESTWINGS") {
    return sendViaZestwings(settings, phone, templateName, components);
  }

  // Default: Meta
  return sendViaMetaApi(settings, phone, templateName, languageCode, components);
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

    const hospitalSettings = await prisma.hospitalSettings.findUnique({
      where: { id: "single" },
      select: { name: true },
    });
    const hospitalName = hospitalSettings?.name || "Hospital";

    const enhancedParams = [...params, hospitalName];

    const components: TemplateComponent[] = [];
    if (enhancedParams.length > 0) {
      components.push({
        type: "body",
        parameters: enhancedParams.map((text) => ({ type: "text" as const, text })),
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
