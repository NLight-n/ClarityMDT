import { getMinioClient, getDefaultBucket, ensureBucket } from "../minio/client";
import { readFile, unlink, mkdir, writeFile, readdir, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { extract } from "tar";
import { uploadFile } from "../minio/upload";

/**
 * Restore MinIO from a backup tar.gz archive
 * @param backupBuffer - The backup file buffer (tar.gz archive)
 * @returns Promise that resolves when restore is complete
 */
export async function restoreMinIO(backupBuffer: Buffer): Promise<void> {
  const client = getMinioClient();
  const bucket = getDefaultBucket();

  // Ensure bucket exists
  await ensureBucket(bucket);

  // Create temporary directory for extraction
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const extractDir = join(tempDir, `minio-restore-${timestamp}`);
  const tarFilePath = join(tempDir, `minio-restore-${timestamp}.tar.gz`);

  try {
    // Create extraction directory
    await mkdir(extractDir, { recursive: true });

    // Write backup buffer to temporary tar file
    await writeFile(tarFilePath, backupBuffer);

    // Extract tar.gz archive
    await extract({
      file: tarFilePath,
      cwd: extractDir,
    });

    // Recursively read all files from extracted directory
    const filesToUpload: Array<{ path: string; relativePath: string }> = [];

    const collectFiles = async (dir: string, basePath: string = ""): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await collectFiles(fullPath, relativePath);
        } else {
          filesToUpload.push({ path: fullPath, relativePath });
        }
      }
    };

    await collectFiles(extractDir);

    // Upload each file to MinIO
    for (const file of filesToUpload) {
      try {
        const fileBuffer = await readFile(file.path);
        // Upload to MinIO using the relative path as storage key
        await client.putObject(
          bucket,
          file.relativePath,
          fileBuffer,
          fileBuffer.length,
          {
            "Content-Type": "application/octet-stream",
          }
        );
      } catch (error) {
        console.error(`Error restoring object ${file.relativePath}:`, error);
        // Continue with other files
      }
    }

    // Clean up temporary files
    await unlink(tarFilePath).catch(() => {});
    // Note: We don't recursively delete the extractDir as it might be large
    // The OS will clean it up eventually
  } catch (error: any) {
    // Clean up on error
    await unlink(tarFilePath).catch(() => {});
    throw new Error(`Failed to restore MinIO: ${error.message}`);
  }
}

