/**
 * Process images in TipTap/ProseMirror JSON content
 * Extracts base64 images, uploads them to MinIO, and replaces with storageKeys
 */

interface ImageNode {
  type: string;
  attrs?: {
    src?: string;
    storageKey?: string;
  };
  content?: any[];
}

/**
 * Recursively find all image nodes
 */
function findImageNodes(node: any): Array<{ node: any; path: number[] }> {
  const images: Array<{ node: any; path: number[] }> = [];

  function traverse(n: any, path: number[] = []): void {
    if (n.type === "image" && n.attrs?.src) {
      images.push({ node: n, path });
    }

    if (n.content && Array.isArray(n.content)) {
      n.content.forEach((child: any, index: number) => {
        traverse(child, [...path, index]);
      });
    }
  }

  traverse(node);
  return images;
}

/**
 * Replace base64 image with storageKey in JSON structure
 */
function replaceImageSrc(
  content: any,
  oldSrc: string,
  newSrc: string,
  storageKey: string
): any {
  if (!content) return content;

  if (content.type === "image" && content.attrs?.src === oldSrc) {
    return {
      ...content,
      attrs: {
        ...content.attrs,
        src: newSrc,
        storageKey: storageKey,
      },
    };
  }

  if (content.content && Array.isArray(content.content)) {
    return {
      ...content,
      content: content.content.map((child: any) =>
        replaceImageSrc(child, oldSrc, newSrc, storageKey)
      ),
    };
  }

  return content;
}

/**
 * Process all base64 images in the editor content
 * Uploads images and replaces base64 with presigned URLs
 */
export async function processEditorImages(
  content: any,
  caseId: string,
  imageType: "radiology" | "pathology" | "clinical"
): Promise<any> {
  if (!content || !content.content) {
    return content;
  }

  const imageNodes = findImageNodes(content);
  
  if (imageNodes.length === 0) {
    return content; // No images to process
  }

  let processedContent = { ...content };

  // Process each image (only upload base64 images, skip already uploaded ones)
  for (const { node } of imageNodes) {
    const src = node.attrs?.src;
    if (!src) continue;

    // Skip if image is already uploaded (has storageKey or is a URL)
    if (node.attrs?.storageKey || (!src.startsWith("data:") && !src.startsWith("/api/images/"))) {
      // If it has storageKey but src is not a presigned URL, update src to use our API endpoint
      if (node.attrs?.storageKey && src.startsWith("data:")) {
        const storageKey = node.attrs.storageKey;
        const imageUrl = `/api/images/${storageKey}`;
        processedContent = replaceImageSrc(
          processedContent,
          src,
          imageUrl,
          storageKey
        );
      }
      continue;
    }

    // Only process base64 images
    if (!src.startsWith("data:")) continue;

    try {
      // Extract base64 data
      const matches = src.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) continue;

      const extension = matches[1] === "jpeg" ? "jpg" : matches[1];
      const base64Data = matches[2];
      const imageId = crypto.randomUUID();

      // Upload to server
      const formData = new FormData();
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: `image/${extension}` });
      const file = new File([blob], `${imageId}.${extension}`, {
        type: `image/${extension}`,
      });

      formData.append("file", file);
      formData.append("type", imageType);
      formData.append("imageId", imageId);

      const response = await fetch(
        `/api/cases/${caseId}/upload-inline-image`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        console.error("Failed to upload image:", await response.text());
        continue;
      }

      const { imageUrl, storageKey } = await response.json();

      // Replace base64 with presigned URL in the content
      processedContent = replaceImageSrc(
        processedContent,
        src,
        imageUrl,
        storageKey
      );
    } catch (error) {
      console.error("Error processing image:", error);
      // Continue with other images even if one fails
    }
  }

  return processedContent;
}

