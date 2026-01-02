import { Readable } from "stream";
import { getMinioClient, getDefaultBucket, ensureBucket } from "./client";

export interface UploadOptions {
  bucket?: string;
  metadata?: Record<string, string>;
  contentType?: string;
}

/**
 * Upload a file buffer to MinIO
 * @param fileBuffer - The file buffer to upload
 * @param storageKey - The storage key (path) where the file will be stored
 * @param options - Optional upload options (bucket, metadata, contentType)
 * @returns Promise that resolves to the storage key
 */
export async function uploadFile(
  fileBuffer: Buffer,
  storageKey: string,
  options: UploadOptions = {}
): Promise<string> {
  const client = getMinioClient();
  const bucket = options.bucket || getDefaultBucket();

  // Ensure bucket exists
  await ensureBucket(bucket);

  // Upload the file
  await client.putObject(
    bucket,
    storageKey,
    fileBuffer,
    fileBuffer.length,
    {
      "Content-Type": options.contentType || "application/octet-stream",
      ...options.metadata,
    }
  );

  return storageKey;
}

/**
 * Upload a file from a readable stream
 * @param stream - The readable stream to upload (Node.js Readable stream)
 * @param storageKey - The storage key (path) where the file will be stored
 * @param size - The size of the file in bytes
 * @param options - Optional upload options (bucket, metadata, contentType)
 * @returns Promise that resolves to the storage key
 */
export async function uploadStream(
  stream: Readable,
  storageKey: string,
  size: number,
  options: UploadOptions = {}
): Promise<string> {
  const client = getMinioClient();
  const bucket = options.bucket || getDefaultBucket();

  // Ensure bucket exists
  await ensureBucket(bucket);

  // Upload the stream
  await client.putObject(
    bucket,
    storageKey,
    stream,
    size,
    {
      "Content-Type": options.contentType || "application/octet-stream",
      ...options.metadata,
    }
  );

  return storageKey;
}

/**
 * Generate a storage key for a case attachment
 * @param caseId - The case ID
 * @param fileName - The original file name
 * @returns The storage key
 */
export function generateCaseAttachmentKey(
  caseId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `cases/${caseId}/attachments/${timestamp}-${sanitizedFileName}`;
}

/**
 * Generate a storage key for an inline radiology image
 * @param caseId - The case ID
 * @param imageId - The image ID (UUID)
 * @param extension - The file extension (default: png)
 * @returns The storage key
 */
export function generateRadiologyInlineKey(
  caseId: string,
  imageId: string,
  extension: string = "png"
): string {
  return `cases/${caseId}/radiologyInline/${imageId}.${extension}`;
}

/**
 * Generate a storage key for an inline pathology image
 * @param caseId - The case ID
 * @param imageId - The image ID (UUID)
 * @param extension - The file extension (default: png)
 * @returns The storage key
 */
export function generatePathologyInlineKey(
  caseId: string,
  imageId: string,
  extension: string = "png"
): string {
  return `cases/${caseId}/pathologyInline/${imageId}.${extension}`;
}

/**
 * Generate a storage key for an inline clinical details image
 * @param caseId - The case ID
 * @param imageId - The image ID (UUID)
 * @param extension - The file extension (default: png)
 * @returns The storage key
 */
export function generateClinicalInlineKey(
  caseId: string,
  imageId: string,
  extension: string = "png"
): string {
  return `cases/${caseId}/clinicalInline/${imageId}.${extension}`;
}

/**
 * Generate a storage key for a backup file
 * @param type - Type of backup ("database" or "minio")
 * @param timestamp - Timestamp for the backup
 * @param extension - File extension (default: "sql" for database, "tar.gz" for minio)
 * @returns The storage key
 */
export function generateBackupKey(
  type: "database" | "minio",
  timestamp: string,
  extension?: string
): string {
  const ext = extension || (type === "database" ? "sql" : "tar.gz");
  return `backups/${type}/${timestamp}.${ext}`;
}

