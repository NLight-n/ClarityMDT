import * as MinIO from "minio";

let minioClient: MinIO.Client | null = null;

/**
 * Get or create MinIO client instance
 * Configured using environment variables
 */
export function getMinioClient(): MinIO.Client {
  if (minioClient) {
    return minioClient;
  }

  const endpoint = process.env.MINIO_ENDPOINT;
  const port = process.env.MINIO_PORT
    ? parseInt(process.env.MINIO_PORT, 10)
    : process.env.MINIO_SSL === "true"
    ? 443
    : 9000;
  const useSSL = process.env.MINIO_SSL === "true";
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;

  if (!endpoint) {
    throw new Error("MINIO_ENDPOINT is not set in environment variables");
  }
  if (!accessKey) {
    throw new Error("MINIO_ACCESS_KEY is not set in environment variables");
  }
  if (!secretKey) {
    throw new Error("MINIO_SECRET_KEY is not set in environment variables");
  }

  minioClient = new MinIO.Client({
    endPoint: endpoint,
    port: port,
    useSSL: useSSL,
    accessKey: accessKey,
    secretKey: secretKey,
  });

  return minioClient;
}

/**
 * Get the default bucket name from environment variables
 */
export function getDefaultBucket(): string {
  const bucket = process.env.MINIO_BUCKET;
  if (!bucket) {
    throw new Error("MINIO_BUCKET is not set in environment variables");
  }
  return bucket;
}

/**
 * Ensure bucket exists, create if it doesn't
 */
export async function ensureBucket(bucketName?: string): Promise<void> {
  const client = getMinioClient();
  const bucket = bucketName || getDefaultBucket();

  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket, "");
  }
}
