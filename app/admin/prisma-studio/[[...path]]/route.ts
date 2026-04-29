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
  return text
    .replace(/(href|src)="\/(?!admin\/prisma-studio\/)([^"]*)"/g, `$1="${PROXY_PREFIX}/$2"`)
    .replace(/(["'`])\/(?!admin\/prisma-studio\/)(bff|telemetry|adapter\.js|data\/|ui\/|assets\/|favicon\.ico)/g, `$1${PROXY_PREFIX}/$2`)
    .replace(/url\(\/(?!admin\/prisma-studio\/)/g, `url(${PROXY_PREFIX}/`);
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
  const targetUrl = buildTargetUrl(request, path);
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    const studioResponse = await fetch(targetUrl, {
      method,
      headers: getForwardHeaders(request, targetUrl),
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit & { duplex?: "half" });

    const responseHeaders = new Headers(studioResponse.headers);
    applyStudioHeaders(responseHeaders);

    const location = responseHeaders.get("location");
    if (location?.startsWith("/")) {
      responseHeaders.set("location", `${PROXY_PREFIX}${location}`);
    }

    if (shouldRewriteResponse(responseHeaders.get("content-type"))) {
      const text = await studioResponse.text();
      return new NextResponse(rewriteStudioText(text), {
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
  } catch (error) {
    console.error("Error proxying Prisma Studio:", error);
    return NextResponse.json(
      { error: "Prisma Studio is not available" },
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
