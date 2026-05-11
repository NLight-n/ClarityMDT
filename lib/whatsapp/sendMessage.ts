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

  // Zestwings' PHP API may return HTML warnings (e.g. <br /><b>Warning</b>...)
  // before the actual JSON payload. Read as text and extract the JSON portion.
  const responseText = await response.text();

  if (!response.ok) {
    console.error("Error sending WhatsApp message via Zestwings:", responseText);
    throw new Error(`Zestwings API error: ${response.status} — ${responseText}`);
  }

  // Find the first '{' to locate the start of the JSON object
  const jsonStart = responseText.indexOf("{");
  if (jsonStart === -1) {
    console.error("Zestwings API returned no JSON in response:", responseText);
    throw new Error("Zestwings API error: no JSON in response body");
  }

  const result = JSON.parse(responseText.substring(jsonStart));
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
 * Looks up the approved template for the given notification type and sends it.
 *
 * Lookup order:
 *   1. A template with an exact `notificationType` match
 *   2. A generic template (`notificationType` is null) — this covers the
 *      single approved generic template used for all notification types.
 *
 * The approved template body has two variables:
 *   {{1}} = Notification title (bold)
 *   {{2}} = Notification message
 *
 * @param whatsappPhone - User's WhatsApp phone in E.164 format
 * @param notificationType - The notification type to look up template for
 * @param params - Template body parameters [title, message]
 * @returns true if sent, false if no template found or send failed
 */
export async function sendWhatsappNotificationToUser(
  whatsappPhone: string,
  notificationType: NotificationType,
  params: string[]
): Promise<boolean> {
  try {
    // 1. Try to find an approved template for this specific notification type
    let template = await prisma.whatsappTemplate.findFirst({
      where: {
        notificationType: notificationType,
        status: WhatsappTemplateStatus.APPROVED,
      },
    });

    // 2. Fall back to a generic template (notificationType is null)
    if (!template) {
      template = await prisma.whatsappTemplate.findFirst({
        where: {
          notificationType: null,
          status: WhatsappTemplateStatus.APPROVED,
        },
      });
    }

    if (!template) {
      // No approved template found — skip silently
      return false;
    }

    // Build body components — params should be [title, message]
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
