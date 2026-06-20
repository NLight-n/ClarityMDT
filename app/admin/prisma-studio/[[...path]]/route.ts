import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { isAdmin } from "@/lib/permissions/accessControl";

const PROXY_PREFIX = "/admin/prisma-studio";
const DEFAULT_STUDIO_URL = "http://prisma-studio:5555";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

function getStudioBaseUrl() {
  return (process.env.PRISMA_STUDIO_URL || DEFAULT_STUDIO_URL).replace(/\/$/, "");
}

function buildTargetUrl(request: NextRequest, path: string[] = []) {
  const targetPath = path.length > 0 ? `/${path.join("/")}` : "/";
  const targetUrl = new URL(`${getStudioBaseUrl()}${targetPath}`);
  targetUrl.search = request.nextUrl.search;
  return targetUrl;
}

function getForwardHeaders(request: NextRequest, targetUrl: URL) {
  const headers = new Headers(request.headers);

  headers.set("host", targetUrl.host);
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");

  return headers;
}

function shouldRewriteResponse(contentType: string | null) {
  if (!contentType) return false;
  return (
    contentType.includes("text/html") ||
    contentType.includes("text/css") ||
    contentType.includes("application/javascript") ||
    contentType.includes("text/javascript")
  );
}

function rewriteStudioText(text: string) {
  let rewritten = text
    .replace(/(href|src)="(?:\.\/|\/)(?!admin\/prisma-studio\/)([^"]*)"/g, `$1="${PROXY_PREFIX}/$2"`)
    .replace(/(["'`])(?:\.\/|\/)(?!admin\/prisma-studio\/)(api|bff|telemetry|adapter\.js|data\/|ui\/|assets\/|http\/|favicon\.ico)/g, `$1${PROXY_PREFIX}/$2`)
    .replace(/url\((?:\.\/|\/)(?!admin\/prisma-studio\/)/g, `url(${PROXY_PREFIX}/`);

  if (rewritten.includes("<head>")) {
    rewritten = rewritten.replace("<head>", `<head>\n    <base href="${PROXY_PREFIX}/">\n`);
  } else if (rewritten.includes("<!DOCTYPE html>")) {
    rewritten = rewritten.replace("<!DOCTYPE html>", `<!DOCTYPE html>\n<head><base href="${PROXY_PREFIX}/"></head>`);
  }

  return rewritten;
}

function applyStudioHeaders(headers: Headers) {
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self' https://cdn.jsdelivr.net https://esm.sh",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://esm.sh",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://esm.sh",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://cdn.jsdelivr.net https://esm.sh",
      "connect-src 'self' https://cdn.jsdelivr.net https://esm.sh",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
}

async function proxyPrismaStudio(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { path } = await context.params;

  // Debugging endpoint to inspect the backend Prisma Studio responses
  if (path && path.length === 1 && path[0] === "debug") {
    const debugInfo: any = {};
    const studioUrl = getStudioBaseUrl();
    debugInfo.studioUrl = studioUrl;
    
    // Test root URL
    try {
      const rootRes = await fetch(`${studioUrl}/`);
      debugInfo.rootStatus = rootRes.status;
      debugInfo.rootHeaders = Object.fromEntries(rootRes.headers.entries());
      const rootText = await rootRes.text();
      debugInfo.rootTextSnippet = rootText.substring(0, 3000);
    } catch (e: any) {
      debugInfo.rootError = e.message || e.toString();
    }

    // Test index.css URL
    try {
      const cssRes = await fetch(`${studioUrl}/index.css`);
      debugInfo.cssStatus = cssRes.status;
      debugInfo.cssHeaders = Object.fromEntries(cssRes.headers.entries());
      const cssText = await cssRes.text();
      debugInfo.cssTextSnippet = cssText.substring(0, 1000);
    } catch (e: any) {
      debugInfo.cssError = e.message || e.toString();
    }

    // Test index.js URL
    try {
      const jsRes = await fetch(`${studioUrl}/index.js`);
      debugInfo.jsStatus = jsRes.status;
      debugInfo.jsHeaders = Object.fromEntries(jsRes.headers.entries());
      const jsText = await jsRes.text();
      debugInfo.jsTextSnippet = jsText.substring(0, 1000);
    } catch (e: any) {
      debugInfo.jsError = e.message || e.toString();
    }

    return NextResponse.json(debugInfo);
  }

  const targetUrl = buildTargetUrl(request, path);
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  console.log(`[PrismaStudio Proxy] Proxying ${method} ${request.nextUrl.pathname} -> ${targetUrl}`);

  try {
    let body: any = undefined;
    if (hasBody) {
      body = await request.arrayBuffer();
    }

    const studioResponse = await fetch(targetUrl, {
      method,
      headers: getForwardHeaders(request, targetUrl),
      body,
    });

    console.log(`[PrismaStudio Proxy] Target response status: ${studioResponse.status} ${studioResponse.statusText}`);

    const responseHeaders = new Headers(studioResponse.headers);
    applyStudioHeaders(responseHeaders);

    if (shouldRewriteResponse(responseHeaders.get("content-type"))) {
      const text = await studioResponse.text();
      const rewritten = rewriteStudioText(text);
      return new NextResponse(rewritten, {
        status: studioResponse.status,
        statusText: studioResponse.statusText,
        headers: responseHeaders,
      });
    }

    return new NextResponse(studioResponse.body, {
      status: studioResponse.status,
      statusText: studioResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("Error proxying Prisma Studio:", error);
    return NextResponse.json(
      { error: "Prisma Studio is not available", details: error.message || error.toString() },
      { status: 502 }
    );
  }
}

export const GET = proxyPrismaStudio;
export const POST = proxyPrismaStudio;
export const PUT = proxyPrismaStudio;
export const PATCH = proxyPrismaStudio;
export const DELETE = proxyPrismaStudio;
export const OPTIONS = proxyPrismaStudio;
