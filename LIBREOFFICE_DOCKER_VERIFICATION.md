# LibreOffice Verification in Docker

## Fonts Installed

The Docker container includes Microsoft-compatible fonts for proper PDF conversion:

- **fonts-liberation / fonts-liberation2**: Free fonts metric-compatible with Arial, Times New Roman, Courier New
- **fonts-dejavu**: High-quality fonts compatible with many document fonts
- **fonts-freefont-ttf**: Free alternatives to common fonts
- **fonts-noto / fonts-noto-core**: Google Noto fonts for international character support
- **fontconfig**: Font configuration library

These fonts ensure that Office documents convert to PDF with proper formatting and size.

## Important: Docker Platform Detection

**When using Docker Desktop on Windows:**
- Docker containers **always run Linux** (even on Windows hosts)
- The `platform()` function from Node.js `os` module will return `"linux"`, **NOT** `"win32"`
- This means the code will use the Linux LibreOffice command (`libreoffice`), which is correct

## How to Verify LibreOffice Installation

### Method 1: Check via Docker Container Shell

1. **Find your container name:**
   ```bash
   docker ps
   ```
   Look for your app container (usually named something like `mdtapp-app-1` or similar)

2. **Enter the container:**
   ```bash
   docker exec -it <container-name> /bin/bash
   ```
   Or if bash is not available:
   ```bash
   docker exec -it <container-name> /bin/sh
   ```

3. **Check LibreOffice version:**
   ```bash
   libreoffice --version
   ```
   You should see output like: `LibreOffice 7.x.x.x`

4. **Check if command is in PATH:**
   ```bash
   which libreoffice
   ```
   Should return: `/usr/bin/libreoffice`

5. **Test conversion (optional):**
   ```bash
   echo "Test" > /tmp/test.txt
   libreoffice --headless --convert-to pdf --outdir /tmp /tmp/test.txt
   ls -la /tmp/test.pdf
   ```

### Method 2: Check via API Endpoint (After Deployment)

I've created an admin-only API endpoint to check LibreOffice status:

**Endpoint:** `GET /api/admin/libreoffice-check`

**Response example:**
```json
{
  "available": true,
  "command": "libreoffice",
  "version": "7.5.8.2 30(Build:2)",
  "platform": "linux"
}
```

**To test:**
1. Log in as admin
2. Open browser console or use curl:
   ```bash
   curl http://localhost:3001/api/admin/libreoffice-check \
     -H "Cookie: your-session-cookie"
   ```

### Method 3: Check Docker Build Logs

During `docker-compose build`, you should see LibreOffice being installed:
```
Step X/Y : RUN apt-get install -y libreoffice ...
```

If the build completes successfully, LibreOffice is installed.

## About the dconf Warning

If you see this warning when running `libreoffice --version`:
```
(process:151): dconf-CRITICAL **: unable to create directory '/home/nodejs/.cache/dconf': Permission denied.
```

**This is harmless and can be ignored.** It occurs because:
- The container runs as a non-root user (`nodejs`)
- LibreOffice's dconf system tries to create a cache directory
- The permission is denied, but this doesn't affect headless LibreOffice operations

The Dockerfile includes `ENV DCONF_PROFILE=""` to suppress this warning in production logs.

## Troubleshooting

### If LibreOffice is not found:

1. **Check if it's installed:**
   ```bash
   docker exec -it <container-name> dpkg -l | grep libreoffice
   ```

2. **Reinstall if needed:**
   The Dockerfile should install it automatically. If not, check:
   - Docker build logs for errors
   - Ensure the Dockerfile includes the LibreOffice installation step

3. **Check permissions:**
   ```bash
   docker exec -it <container-name> ls -la /usr/bin/libreoffice
   ```
   Should be executable by all users

### Common Issues:

1. **"LibreOffice is not installed or not found in PATH"**
   - LibreOffice might not be installed in the container
   - Check Dockerfile build logs
   - Rebuild with `docker-compose build --no-cache`

2. **"Conversion timed out"**
   - File might be too large or complex
   - Check container resources (CPU/Memory)
   - Increase timeout in `convertToPdf.ts` if needed

3. **"Failed to convert file to PDF"**
   - Check container logs for detailed error messages
   - Verify the file format is supported
   - Test with a simple Office file first

## Platform Detection in Code

The code uses `platform()` from Node.js `os` module:
- **In Docker containers:** Always returns `"linux"` (even on Windows host)
- **On Windows host (without Docker):** Returns `"win32"`
- **On Linux host:** Returns `"linux"`
- **On macOS host:** Returns `"darwin"`

For Docker deployments, the code will always use the Linux path, which is correct since Docker containers run Linux.

