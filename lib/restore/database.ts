import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Restore a PostgreSQL database from a backup file
 * @param backupBuffer - The backup file buffer (SQL dump)
 * @returns Promise that resolves when restore is complete
 */
export async function restoreDatabase(backupBuffer: Buffer): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  // Parse DATABASE_URL to extract connection details
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = url.port || "5432";
  const database = url.pathname.slice(1); // Remove leading /
  const user = url.username;
  const password = url.password;

  // Create temporary file for backup
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const backupFilePath = join(tempDir, `restore-${timestamp}.sql`);

  try {
    // Write backup buffer to temporary file
    await writeFile(backupFilePath, backupBuffer);

    // Build psql command to restore
    // Use PGPASSWORD environment variable for password
    const command = `psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${backupFilePath}"`;

    // Execute psql with password in environment
    const env = { ...process.env, PGPASSWORD: password };
    const { stdout, stderr } = await execAsync(command, {
      env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr && !stderr.includes("WARNING") && !stderr.includes("NOTICE")) {
      console.warn("psql stderr:", stderr);
      // Check if it's a real error (not just warnings)
      if (stderr.includes("ERROR")) {
        throw new Error(`Database restore failed: ${stderr}`);
      }
    }

    // Clean up temporary file
    await unlink(backupFilePath).catch(() => {
      // Ignore cleanup errors
    });
  } catch (error: any) {
    // Clean up temporary file on error
    await unlink(backupFilePath).catch(() => {
      // Ignore cleanup errors
    });

    if (error.code === "ENOENT") {
      throw new Error("psql is not installed or not found in PATH. Please install PostgreSQL client tools.");
    }

    throw new Error(`Failed to restore database: ${error.message}`);
  }
}

