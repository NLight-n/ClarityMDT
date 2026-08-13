import { NextRequest } from "next/server";

function isIpAddress(host: string): boolean {
  const hostname = host.split(":")[0];
  return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname);
}

/**
 * Determine the public origin for Weasis manifest and DICOM download URLs.
 * Handles both LAN IP access and external domain access cleanly.
 */
export function getPublicOrigin(request: NextRequest): string {
  if (process.env.WEASIS_PUBLIC_ORIGIN) {
    return process.env.WEASIS_PUBLIC_ORIGIN.replace(/\/+$/, "");
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();

  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  let proto = forwardedProto || (request.url.startsWith("https") ? "https" : "http");

  // Java (Weasis) strictly validates HTTPS certificates and throws SSLHandshakeException
  // when accessing self-signed IP addresses (e.g. https://192.168.11.143).
  // If request host is a raw IP address on LAN, default to HTTP for Weasis endpoints.
  if (isIpAddress(host) && process.env.WEASIS_FORCE_HTTPS !== "true") {
    proto = "http";
  }

  return `${proto}://${host}`;
}
