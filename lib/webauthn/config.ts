import { NextRequest } from "next/server";

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
