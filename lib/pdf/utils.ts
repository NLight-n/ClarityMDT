/**
 * Utility functions for PDF generation
 */

/**
 * Recursively extracts text content from a ProseMirror/TipTap document structure
 * Strips out inline images and other non-text nodes
 */
export function extractTextFromProseMirror(node: any): string {
  if (!node) return "";

  // If node has text content, return it
  if (node.text) {
    return node.text;
  }

  // If node has marks, we can process them but for PDF we just want the text
  // For now, we'll ignore mark formatting (bold, italic, etc.) and just get text

  // If node has content (array of child nodes), recursively process them
  if (node.content && Array.isArray(node.content)) {
    return node.content
      .map((child: any) => extractTextFromProseMirror(child))
      .filter((text: string) => text.trim().length > 0)
      .join(" ");
  }

  // For paragraph, heading, etc., extract text from content
  // Skip image nodes (type: "image" or similar)
  if (node.type === "image" || node.type === "hardBreak") {
    return ""; // Skip images and just add space for hard breaks
  }

  return "";
}

/**
 * Strip inline images from radiology/pathology findings JSON
 * Converts the ProseMirror document to plain text
 * This function removes image nodes and extracts only text content
 */
export function stripInlineImages(findingsJson: any): string {
  if (!findingsJson) return "";

  // Handle string input (if it's already text)
  if (typeof findingsJson === "string") {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(findingsJson);
      return extractTextFromProseMirror(parsed);
    } catch {
      // If it's not JSON, return as-is
      return findingsJson;
    }
  }

  // Handle object input (ProseMirror document)
  if (typeof findingsJson === "object") {
    return extractTextFromProseMirror(findingsJson);
  }

  return "";
}

