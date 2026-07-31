import { NextRequest } from "next/server";
import nodeCrypto from "node:crypto";

// Ensure Node's native C++ WebCrypto implementation is set on globalThis
// to prevent Next.js bundler polyfills from throwing RSA-PSS salt errors during verification
export function ensureNativeWebCrypto() {
  if (typeof globalThis !== "undefined" && nodeCrypto && nodeCrypto.webcrypto) {
    try {
      Object.defineProperty(globalThis, "crypto", {
        value: nodeCrypto.webcrypto,
        writable: true,
        configurable: true,
      });
    } catch {
      // Fallback assignment if defineProperty fails
      (globalThis as any).crypto = nodeCrypto.webcrypto;
    }
  }
}

// Execute immediately when module is imported
ensureNativeWebCrypto();

const challengeMap = new Map<string, { challenge: string; expiresAt: number }>();

export function setWebAuthnChallenge(userId: string, challenge: string) {
  challengeMap.set(userId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes validity
  });
}

export function getWebAuthnChallenge(userId: string): string | null {
  const data = challengeMap.get(userId);
  if (!data) return null;
  if (Date.now() > data.expiresAt) {
    challengeMap.delete(userId);
    return null;
  }
  return data.challenge;
}

export function deleteWebAuthnChallenge(userId: string) {
  challengeMap.delete(userId);
}

export function getRelyingPartyConfig(request: NextRequest) {
  ensureNativeWebCrypto();

  const hostHeader = request.headers.get("host") || "localhost";
  const hostname = hostHeader.split(":")[0];
  const protocol = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
  
  const currentOrigin = `${protocol}://${hostHeader}`;
  
  // Support both http and https as well as with/without port to handle reverse proxies (Nginx/Traefik/Docker)
  const origins = Array.from(new Set([
    currentOrigin,
    `https://${hostHeader}`,
    `http://${hostHeader}`,
    `https://${hostname}`,
    `http://${hostname}`,
  ]));

  const rpID = process.env.WEBAUTHN_RP_ID || hostname;

  return {
    rpName: "ClarityMDT",
    rpID,
    origin: origins,
  };
}
