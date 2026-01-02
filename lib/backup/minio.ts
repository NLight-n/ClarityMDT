import { getMinioClient, getDefaultBucket, ensureBucket } from "../minio/client";
import { readFile, unlink, mkdir, writeFile } from "fs/promises";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { create } from "tar";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

/**
 * Create a MinIO backup by creating a tar archive of all objects
 * @returns Promise that resolves to the backup file buffer
 */
export async function createMinIOBackup(): Promise<Buffer> {
  const client = getMinioClient();
  const bucket = getDefaultBucket();

  // Ensure bucket exists
  await ensureBucket(bucket);

  // Create temporary directory for backup
  const tempDir = tmpdir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(tempDir, `minio-backup-${timestamp}`);
  const tarFilePath = join(tempDir, `minio-backup-${timestamp}.tar.gz`);

  try {
    // Create backup directory
    await mkdir(backupDir, { recursive: true });

    // List all objects in the bucket
    const objects: string[] = [];
    const objectsStream = client.listObjects(bucket, "", true);

    for await (const obj of objectsStream) {
      if (obj.name) {
        objects.push(obj.name);
      }
    }

    if (objects.length === 0) {
      // No objects to backup, create empty tar
      await create(
        {
          gzip: true,
          file: tarFilePath,
          cwd: backupDir,
        },
        []
      );
    } else {
      // Download each object and save to backup directory
      for (const objectName of objects) {
        try {
          // Get object data
          const dataStream = await client.getObject(bucket, objectName);

          // Create directory structure if needed
          const objectPath = join(backupDir, objectName);
          const lastSlash = Math.max(objectPath.lastIndexOf("/"), objectPath.lastIndexOf("\\"));
          if (lastSlash > 0) {
            const objectDir = objectPath.substring(0, lastSlash);
            await mkdir(objectDir, { recursive: true }).catch(() => {
              // Directory might already exist
            });
          }

          // Write object to file
          const chunks: Buffer[] = [];
          for await (const chunk of dataStream as Readable) {
            chunks.push(Buffer.from(chunk));
          }
          const fileBuffer = Buffer.concat(chunks);
          await writeFile(objectPath, fileBuffer);
        } catch (error) {
          console.error(`Error backing up object ${objectName}:`, error);
          // Continue with other objects
        }
      }

      // Create tar.gz archive of the backup directory
      // List all files recursively and archive them
      const { readdir, stat } = await import("fs/promises");
      const filesToArchive: string[] = [];
      
      const collectFiles = async (dir: string, basePath: string = ""): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            await collectFiles(fullPath, relativePath);
          } else {
            filesToArchive.push(relativePath);
          }
        }
      };
      
      await collectFiles(backupDir);
      
      await create(
        {
          gzip: true,
          file: tarFilePath,
          cwd: backupDir,
        },
        filesToArchive
      );
    }

    // Read the tar file
    const backupBuffer = await readFile(tarFilePath);

    // Clean up temporary files
    await unlink(tarFilePath).catch(() => {});
    // Note: We don't recursively delete the backupDir as it might be large
    // The OS will clean it up eventually

    return backupBuffer;
  } catch (error: any) {
    // Clean up on error
    await unlink(tarFilePath).catch(() => {});
    throw new Error(`Failed to create MinIO backup: ${error.message}`);
  }
}

