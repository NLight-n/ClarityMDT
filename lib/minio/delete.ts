import { getMinioClient, getDefaultBucket } from "./client";

/**
 * Delete a file from MinIO
 * @param storageKey - The storage key (path) of the file to delete
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves when the file is deleted
 */
export async function deleteFile(
  storageKey: string,
  bucket?: string
): Promise<void> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  await client.removeObject(bucketName, storageKey);
}

/**
 * Delete multiple files from MinIO
 * @param storageKeys - Array of storage keys (paths) to delete
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves when all files are deleted
 */
export async function deleteFiles(
  storageKeys: string[],
  bucket?: string
): Promise<void> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  if (storageKeys.length === 0) {
    return;
  }

  await client.removeObjects(bucketName, storageKeys);
}

/**
 * Check if a file exists in MinIO
 * @param storageKey - The storage key (path) to check
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves to true if the file exists, false otherwise
 */
export async function fileExists(
  storageKey: string,
  bucket?: string
): Promise<boolean> {
  try {
    const client = getMinioClient();
    const bucketName = bucket || getDefaultBucket();

    await client.statObject(bucketName, storageKey);
    return true;
  } catch (error: any) {
    // If error code is "NotFound", the file doesn't exist
    if (error.code === "NotFound" || error.code === "NoSuchKey") {
      return false;
    }
    // Re-throw other errors
    throw error;
  }
}


