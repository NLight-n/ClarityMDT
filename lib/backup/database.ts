import { exec } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Create a PostgreSQL database backup using pg_dump
 * @returns Promise that resolves to the backup file buffer
 */
export async function createDatabaseBackup(): Promise<Buffer> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  // Parse DATABASE_URL to extract connection details
  // Format: postgresql://user:password@host:port/database
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = url.port || "5432";
  const database = url.pathname.slice(1); // Remove leading /
  const user = url.username;
  const password = url.password;

  // Create temporary file for backup
  const tempDir = tmpdir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = `backup-${timestamp}.sql`;
  const backupFilePath = join(tempDir, backupFileName);

  try {
    // Build pg_dump command (plain SQL format for better compatibility)
    // Use PGPASSWORD environment variable for password
    const command = `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} -F p -f "${backupFilePath}"`;

    // Execute pg_dump with password in environment
    const env = { ...process.env, PGPASSWORD: password };
    const { stdout, stderr } = await execAsync(command, {
      env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr && !stderr.includes("WARNING")) {
      console.warn("pg_dump stderr:", stderr);
    }

    // Read the backup file
    const backupBuffer = await readFile(backupFilePath);

    // Clean up temporary file
    await unlink(backupFilePath).catch(() => {
      // Ignore cleanup errors
    });

    return backupBuffer;
  } catch (error: any) {
    // Clean up temporary file on error
    await unlink(backupFilePath).catch(() => {
      // Ignore cleanup errors
    });

    if (error.code === "ENOENT") {
      throw new Error("pg_dump is not installed or not found in PATH. Please install PostgreSQL client tools.");
    }

    throw new Error(`Failed to create database backup: ${error.message}`);
  }
}

