import { getMinioClient, getDefaultBucket, ensureBucket } from "./client";

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

  // Ensure bucket exists before deleting
  await ensureBucket(bucketName);

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

  // Ensure bucket exists before deleting
  await ensureBucket(bucketName);

  await client.removeObjects(bucketName, storageKeys);
}

/**
 * Delete all files within a specific folder (prefix) from MinIO
 * @param prefix - The folder path (prefix) to delete
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves when the folder is deleted
 */
export async function deleteFolder(
  prefix: string,
  bucket?: string
): Promise<void> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  await ensureBucket(bucketName);

  return new Promise((resolve, reject) => {
    const objectsList: string[] = [];
    const stream = client.listObjectsV2(bucketName, prefix, true);
    
    stream.on("data", (obj) => {
      if (obj.name) {
        objectsList.push(obj.name);
      }
    });
    
    stream.on("error", (err) => {
      reject(err);
    });
    
    stream.on("end", async () => {
      if (objectsList.length > 0) {
        try {
          console.log(`MinIO Delete: Deleting ${objectsList.length} object(s) with prefix: ${prefix}`);
          // Log individual files if they are few, otherwise just the count
          if (objectsList.length <= 10) {
            objectsList.forEach(name => console.log(`  - Deleting: ${name}`));
          }
          await client.removeObjects(bucketName, objectsList);
          resolve();
        } catch (err) {
          console.error(`Failed to delete objects with prefix ${prefix}:`, err);
          reject(err);
        }
      } else {
        console.log(`MinIO Delete: No objects found with prefix: ${prefix}`);
        resolve();
      }
    });
  });
}

/**
 * Derive the prefix for all raw DICOM files belonging to a bundle manifest
 * @param manifestKey - The storage key of the manifest.json
 */
export function getDicomFolderPrefix(manifestKey: string): string | null {
  const parts = manifestKey.split("/");
  const fileName = parts[parts.length - 1];
  const dashIndex = fileName.indexOf("-");
  
  if (dashIndex > 0) {
    const timestamp = fileName.substring(0, dashIndex);
    return parts.slice(0, -1).join("/") + "/" + timestamp + "-";
  }
  return null;
}


/**
 * Get the total size of all objects sharing a specific prefix in MinIO
 * @param prefix - The folder path (prefix) to scan
 * @param bucket - Optional bucket name (defaults to MINIO_BUCKET env var)
 * @returns Promise that resolves to the total size in bytes
 */
export async function getObjectsSizeByPrefix(
  prefix: string,
  bucket?: string
): Promise<number> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  await ensureBucket(bucketName);

  return new Promise((resolve, reject) => {
    let totalSize = 0;
    const stream = client.listObjectsV2(bucketName, prefix, true);

    stream.on("data", (obj) => {
      if (obj.size) {
        totalSize += obj.size;
      }
    });

    stream.on("error", (err) => {
      reject(err);
    });

    stream.on("end", () => {
      resolve(totalSize);
    });
  });
}

/**
 * Calculate the total size of a DICOM bundle by reading its manifest
 * and summing the sizes of all referenced files in MinIO.
 */
export async function getDicomManifestRealSize(
  manifestKey: string,
  bucket?: string
): Promise<number> {
  const client = getMinioClient();
  const bucketName = bucket || getDefaultBucket();

  try {
    // 1. Get the manifest content
    const dataStream = await client.getObject(bucketName, manifestKey);
    const content = await new Promise<string>((resolve, reject) => {
      let data = "";
      dataStream.on("data", (chunk) => (data += chunk));
      dataStream.on("error", (err) => reject(err));
      dataStream.on("end", () => resolve(data));
    });

    const manifest = JSON.parse(content);
    let totalSize = 0;
    const tasks: Promise<void>[] = [];

    // 2. Collect all instance URLs from the manifest
    if (manifest.studies) {
      for (const study of manifest.studies) {
        if (study.series) {
          for (const series of study.series) {
            if (series.instances) {
              for (const instance of series.instances) {
                if (instance.url) {
                  // The URL might be stored as "dicomweb:blob://..." or a storage key
                  const storageKey = instance.url.replace(/^.*:\/\//, "");
                  tasks.push(
                    (async () => {
                      try {
                        const stat = await client.statObject(bucketName, storageKey);
                        totalSize += stat.size;
                      } catch (e) {
                        // File might be missing or deleted
                      }
                    })()
                  );
                }
              }
            }
          }
        }
      }
    }

    // Wait for all stats to complete
    await Promise.all(tasks);

    // Don't forget the manifest itself
    try {
      const manifestStat = await client.statObject(bucketName, manifestKey);
      totalSize += manifestStat.size;
    } catch (e) {}

    return totalSize;
  } catch (error) {
    console.error(`Failed to calculate size from manifest ${manifestKey}:`, error);
    // Fallback: If parsing fails, try prefix matching as a last resort
    const parts = manifestKey.split("/");
    const fileName = parts[parts.length - 1];
    const dashIndex = fileName.indexOf("-");
    if (dashIndex > 0) {
      const timestamp = fileName.substring(0, dashIndex);
      const prefix = parts.slice(0, -1).join("/") + "/" + timestamp + "-";
      return await getObjectsSizeByPrefix(prefix, bucketName);
    }
    return 0;
  }
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


