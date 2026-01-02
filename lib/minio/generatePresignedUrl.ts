import { getMinioClient, getDefaultBucket } from "./client";

/**
 * Generate a presigned URL for downloading a file
 * @param storageKey - The storage key (path) of the file
 * @param expirySeconds - URL expiry time in seconds (default: 7 days)
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves to the presigned URL
 */
export async function generatePresignedUrl(
  storageKey: string,
  expirySeconds: number = 7 * 24 * 60 * 60, // 7 days
  bucket?: string
): Promise<string> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  const url = await client.presignedGetObject(
    bucketName,
    storageKey,
    expirySeconds
  );

  return url;
}

/**
 * Generate a presigned URL for uploading a file
 * @param storageKey - The storage key (path) where the file will be stored
 * @param expirySeconds - URL expiry time in seconds (default: 1 hour)
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves to the presigned URL
 */
export async function generatePresignedPutUrl(
  storageKey: string,
  expirySeconds: number = 60 * 60, // 1 hour
  bucket?: string
): Promise<string> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  const url = await client.presignedPutObject(
    bucketName,
    storageKey,
    expirySeconds
  );

  return url;
}

/**
 * Generate presigned URLs for multiple files
 * @param storageKeys - Array of storage keys (paths)
 * @param expirySeconds - URL expiry time in seconds (default: 7 days)
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves to an object mapping storage keys to URLs
 */
export async function generatePresignedUrls(
  storageKeys: string[],
  expirySeconds: number = 7 * 24 * 60 * 60, // 7 days
  bucket?: string
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};

  await Promise.all(
    storageKeys.map(async (key) => {
      urls[key] = await generatePresignedUrl(key, expirySeconds, bucket);
    })
  );

  return urls;
}


