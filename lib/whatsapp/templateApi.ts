/**
 * WhatsApp Business API template management
 * Handles creating, syncing, and deleting templates via Meta Graph API
 *
 * NOTE: These functions only work with the META provider.
 * When using Zestwings, templates are managed externally in Meta Business Manager
 * and registered locally in the app for notification-type mapping.
 */

import { getWhatsappSettings } from "./getSettings";

const META_API_VERSION = "v21.0";

interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER";
  format?: "TEXT";
  text: string;
  example?: {
    body_text?: string[][];
  };
}

export interface CreateTemplateParams {
  name: string;
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  language: string;
  headerText?: string;
  bodyText: string;
  footerText?: string;
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
  }>;
}

/**
 * Assert that Meta provider is configured. Throws if Zestwings is active.
 */
async function getMetaSettings() {
  const settings = await getWhatsappSettings();

  if (
    !settings ||
    !settings.accessToken ||
    !settings.businessAccountId
  ) {
    throw new Error("WhatsApp not configured or disabled");
  }

  if (settings.provider !== "META") {
    throw new Error(
      "Template management via API is only available with the Meta (Direct) provider. " +
      "When using Zestwings, manage templates in Meta Business Manager and register them locally."
    );
  }

  return settings;
}

/**
 * Create and submit a template for approval via Meta API
 * The template is automatically submitted for review when created
 */
export async function createTemplateInMeta(
  params: CreateTemplateParams
): Promise<{ id: string; status: string }> {
  const settings = await getMetaSettings();

  const components: TemplateComponent[] = [];

  if (params.headerText) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: params.headerText,
    });
  }

  components.push({
    type: "BODY",
    text: params.bodyText,
  });

  if (params.footerText) {
    components.push({
      type: "FOOTER",
      text: params.footerText,
    });
  }

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${settings.businessAccountId}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.name,
        category: params.category,
        language: params.language,
        components,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("Error creating WhatsApp template:", error);
    throw new Error(
      error?.error?.message || "Failed to create template in Meta"
    );
  }

  const data = await response.json();
  return {
    id: data.id,
    status: data.status || "PENDING",
  };
}

/**
 * Fetch all templates from Meta API along with their current statuses
 */
export async function fetchTemplatesFromMeta(): Promise<MetaTemplate[]> {
  const settings = await getMetaSettings();

  const templates: MetaTemplate[] = [];
  let nextUrl: string | null = `https://graph.facebook.com/${META_API_VERSION}/${settings.businessAccountId}/message_templates?limit=100`;

  while (nextUrl) {
    const fetchResponse: Response = await fetch(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    });

    if (!fetchResponse.ok) {
      const error = await fetchResponse.json();
      console.error("Error fetching WhatsApp templates:", error);
      throw new Error(
        error?.error?.message || "Failed to fetch templates from Meta"
      );
    }

    const pageData: { data?: MetaTemplate[]; paging?: { next?: string } } = await fetchResponse.json();
    if (pageData.data) {
      templates.push(...pageData.data);
    }

    nextUrl = pageData.paging?.next || null;
  }

  return templates;
}

/**
 * Delete a template from Meta API
 * @param templateName - The template name to delete
 */
export async function deleteTemplateFromMeta(
  templateName: string
): Promise<boolean> {
  const settings = await getMetaSettings();

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${settings.businessAccountId}/message_templates?name=${encodeURIComponent(templateName)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${settings.accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    console.error("Error deleting WhatsApp template:", error);
    throw new Error(
      error?.error?.message || "Failed to delete template from Meta"
    );
  }

  return true;
}
