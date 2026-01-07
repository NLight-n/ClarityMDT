import { exec, execSync } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, rm, mkdir, readdir } from "fs/promises";
import { accessSync, constants } from "fs";
import { join, extname, basename } from "path";
import { tmpdir, platform } from "os";

const execAsync = promisify(exec);

/**
 * Get the LibreOffice command based on the platform
 */
function getLibreOfficeCommand(): string {
  const osPlatform = platform();
  
  if (osPlatform === "win32") {
    // On Windows, try common installation paths
    const possiblePaths = [
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\LibreOffice\\program\\soffice.exe` : null,
      process.env["ProgramFiles(x86)"] ? `${process.env["ProgramFiles(x86)"]}\\LibreOffice\\program\\soffice.exe` : null,
    ].filter(Boolean) as string[];
    
    // First try if soffice is in PATH
    try {
      execSync("soffice --version", { stdio: "ignore" });
      return "soffice";
    } catch {
      // Try the common paths
      for (const path of possiblePaths) {
        try {
          accessSync(path, constants.F_OK);
          return `"${path}"`;
        } catch {
          continue;
        }
      }
    }
    
    // Fallback to soffice (might be in PATH)
    return "soffice";
  }
  
  // Linux/macOS - use libreoffice command
  // In Docker containers, libreoffice package provides the 'libreoffice' command
  return "libreoffice";
}

/**
 * Convert an Office file to PDF using LibreOffice
 * @param fileBuffer - The file buffer to convert
 * @param originalFileName - The original file name (used to determine file type)
 * @returns Promise that resolves to the PDF buffer
 */
export async function convertToPdf(
  fileBuffer: Buffer,
  originalFileName: string
): Promise<Buffer> {
  // Create temporary directory for conversion
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const sanitizedFileName = originalFileName.replace(/[<>:"/\\|?*]/g, "_"); // Sanitize for Windows
  const inputFilePath = join(tempDir, `input-${timestamp}-${sanitizedFileName}`);
  const outputDir = join(tempDir, `output-${timestamp}`);
  
  try {
    // Create output directory
    await mkdir(outputDir, { recursive: true });
    
    // Write input file to temporary location
    await writeFile(inputFilePath, fileBuffer);

    // Get the appropriate LibreOffice command for the platform
    const libreOfficeCmd = getLibreOfficeCommand();
    
    // Run LibreOffice conversion
    // --headless: Run without GUI
    // --convert-to pdf: Convert to PDF
    // --outdir: Output directory
    // On Windows, paths need to be handled differently
    const osPlatform = platform();
    let command: string;
    
    if (osPlatform === "win32") {
      // Windows: Use the paths as-is with quotes, but ensure they're properly escaped
      // LibreOffice on Windows can handle backslashes, but we need to ensure paths are quoted
      const escapedInputPath = inputFilePath.replace(/"/g, '\\"');
      const escapedOutputPath = outputDir.replace(/"/g, '\\"');
      command = `${libreOfficeCmd} --headless --convert-to pdf --outdir "${escapedOutputPath}" "${escapedInputPath}"`;
    } else {
      // Linux/Docker: Add --nodefault to prevent user installation issues
      // Set HOME environment variable is handled by Dockerfile
      command = `${libreOfficeCmd} --headless --nodefault --nolockcheck --convert-to pdf --outdir "${outputDir}" "${inputFilePath}"`;
    }
    
    console.log("Running LibreOffice conversion command:", command);
    console.log("Input file:", inputFilePath);
    console.log("Output directory:", outputDir);
    
    const execOptions: any = {
      timeout: 60000, // 60 second timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    };
    if (osPlatform === "win32") {
      execOptions.shell = true; // Use shell on Windows for better path handling
    }
    const { stdout, stderr } = await execAsync(command, execOptions);

    console.log("LibreOffice stdout:", stdout);
    if (stderr) {
      const stderrStr = typeof stderr === 'string' ? stderr : stderr.toString();
      console.log("LibreOffice stderr:", stderrStr);
      // Check if there's an actual error (not just INFO messages)
      if (!stderrStr.includes("INFO") && !stderrStr.includes("convert") && stderrStr.trim().length > 0) {
        console.warn("LibreOffice may have encountered an error:", stderrStr);
      }
    }

    // Give LibreOffice a moment to finish writing the file (especially on Windows)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find the output PDF file
    // LibreOffice creates output with same name but .pdf extension
    // However, the name might be slightly different, so we'll search for PDF files
    const baseName = sanitizedFileName.replace(/\.[^/.]+$/, "");
    const expectedPdfFileName = `${baseName}.pdf`;
    const expectedOutputPath = join(outputDir, expectedPdfFileName);

    // Try to read the expected file first
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await readFile(expectedOutputPath);
    } catch (readError: any) {
      // If expected file doesn't exist, search for any PDF file in the output directory
      if (readError.code === "ENOENT") {
        try {
          const files = await readdir(outputDir);
          const pdfFile = files.find(file => extname(file).toLowerCase() === ".pdf");
          
          if (!pdfFile) {
            // List all files for debugging
            console.error("No PDF file found in output directory. Files found:", files);
            console.error("Expected file:", expectedPdfFileName);
            console.error("Output directory:", outputDir);
            throw new Error(`LibreOffice conversion completed but no PDF file was created. Files in output: ${files.join(", ")}`);
          }
          
          const actualOutputPath = join(outputDir, pdfFile);
          pdfBuffer = await readFile(actualOutputPath);
        } catch (searchError: any) {
          console.error("Error searching for PDF file:", searchError);
          throw new Error(`Failed to find converted PDF file. LibreOffice may have failed to convert the file. Error: ${searchError.message}`);
        }
      } else {
        throw readError;
      }
    }

    return pdfBuffer;
  } catch (error: any) {
    console.error("Error converting file to PDF:", error);
    
    // Check if error message already contains useful information
    if (error.message && error.message.includes("LibreOffice")) {
      throw error;
    }
    
    // Provide more specific error messages
    if (error.code === "ENOENT" && error.syscall === "spawn") {
      // This means the command itself wasn't found
      throw new Error("LibreOffice is not installed or not found in PATH. Please install LibreOffice and ensure 'soffice' is accessible.");
    }
    if (error.code === "ETIMEDOUT" || error.signal === "SIGTERM") {
      throw new Error("Conversion timed out. File may be too large or complex.");
    }
    
    // If it's already a meaningful error message, re-throw it
    if (error.message && !error.message.includes("Failed to convert")) {
      throw error;
    }
    
    throw new Error(`Failed to convert file to PDF: ${error.message || "Unknown error"}`);
  } finally {
    // Clean up temporary files
    try {
      await unlink(inputFilePath).catch(() => {});
      // Clean up output directory (LibreOffice may create multiple files)
      await rm(outputDir, { recursive: true, force: true }).catch(() => {});
    } catch (cleanupError) {
      console.warn("Error cleaning up temporary files:", cleanupError);
    }
  }
}

/**
 * Check if LibreOffice is available on the system
 * @returns Promise that resolves to true if LibreOffice is available
 */
export async function isLibreOfficeAvailable(): Promise<boolean> {
  try {
    const libreOfficeCmd = getLibreOfficeCommand();
    const osPlatform = platform();
    const checkOptions: any = { timeout: 5000 };
    if (osPlatform === "win32") {
      checkOptions.shell = true;
    }
    const { stdout, stderr } = await execAsync(`${libreOfficeCmd} --version`, checkOptions);
    // Check if we got a version output
    const stdoutStr = typeof stdout === 'string' ? stdout : stdout?.toString() || '';
    if (stdoutStr.trim().length > 0) {
      console.log("LibreOffice version:", stdoutStr.trim());
      return true;
    }
    return false;
  } catch (error: any) {
    console.error("LibreOffice check failed:", error.message);
    return false;
  }
}

/**
 * Get LibreOffice version and command path for debugging
 * @returns Object with version info and command used
 */
export async function getLibreOfficeInfo(): Promise<{
  available: boolean;
  command: string;
  version?: string;
  platform: string;
  error?: string;
}> {
  const osPlatform = platform();
  const command = getLibreOfficeCommand();
  
  try {
    const checkOptions: any = { timeout: 5000 };
    if (osPlatform === "win32") {
      checkOptions.shell = true;
    }
    const { stdout, stderr } = await execAsync(`${command} --version`, checkOptions);
    const stdoutStr = typeof stdout === 'string' ? stdout : stdout?.toString() || '';
    return {
      available: true,
      command,
      version: stdoutStr.trim() || "Unknown",
      platform: osPlatform,
    };
  } catch (error: any) {
    return {
      available: false,
      command,
      platform: osPlatform,
      error: error.message || "Unknown error",
    };
  }
}

