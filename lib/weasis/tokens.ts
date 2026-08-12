import crypto from "crypto";

export interface WeasisTokenPayload {
  tid: string;          // Token unique ID (UUID)
  attachmentId: string; // Bound DICOM bundle attachment ID
  userId: string;       // User who generated the token
  caseId: string;       // Case ID
  exp: number;          // Expiration timestamp in ms
  iat: number;          // Issued at timestamp in ms
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory set of consumed manifest token IDs for single-use enforcement
const consumedManifestTokenIds = new Set<string>();

/**
 * Get signing secret from environment
 */
function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET must be configured for Weasis integration");
    }
    return "dev-weasis-fallback-secret-key-32bytes-min";
  }
  return secret;
}

/**
 * Generate a cryptographically secure, short-lived, attachment-scoped token for Weasis
 */
export function generateWeasisToken(params: {
  attachmentId: string;
  userId: string;
  caseId: string;
  ttlMs?: number;
}): { token: string; payload: WeasisTokenPayload } {
  const now = Date.now();
  const ttl = params.ttlMs || DEFAULT_TTL_MS;
  const payload: WeasisTokenPayload = {
    tid: crypto.randomUUID(),
    attachmentId: params.attachmentId,
    userId: params.userId,
    caseId: params.caseId,
    iat: now,
    exp: now + ttl,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(payloadBase64);
  const signatureBase64 = hmac.digest("base64url");

  const token = `${payloadBase64}.${signatureBase64}`;
  return { token, payload };
}

/**
 * Verify a Weasis token string. Returns payload if valid, null if invalid or expired.
 */
export function verifyWeasisToken(tokenStr: string): WeasisTokenPayload | null {
  if (!tokenStr || typeof tokenStr !== "string") {
    return null;
  }

  const parts = tokenStr.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payloadBase64, signatureBase64] = parts;

  try {
    const hmac = crypto.createHmac("sha256", getSecret());
    hmac.update(payloadBase64);
    const expectedSignature = hmac.digest("base64url");

    // Constant-time signature comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signatureBase64);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as WeasisTokenPayload;

    if (!payload || !payload.tid || !payload.attachmentId || !payload.exp) {
      return null;
    }

    // Expiration check
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Mark manifest token as consumed for single-use manifest fetching.
 * Returns true if this token ID was NOT previously consumed (valid single use).
 * Returns false if it was already consumed.
 */
export function markManifestTokenConsumed(tokenId: string): boolean {
  if (consumedManifestTokenIds.has(tokenId)) {
    return false;
  }
  consumedManifestTokenIds.add(tokenId);

  // Clean up old tokens periodically
  if (consumedManifestTokenIds.size > 10000) {
    consumedManifestTokenIds.clear();
  }

  return true;
}

/**
 * Reset consumed token cache (useful for testing)
 */
export function resetConsumedTokenCache(): void {
  consumedManifestTokenIds.clear();
}
