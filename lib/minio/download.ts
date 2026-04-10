import { getMinioClient, getDefaultBucket } from "./client";
import { Readable } from "stream";

/**
 * Get a readable stream for a file from MinIO
 * @param storageKey - The storage key (path) of the file
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves to a Readable stream of the file content
 */
export async function getFileStream(
  storageKey: string,
  bucket?: string
): Promise<Readable> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  return await client.getObject(bucketName, storageKey);
}
