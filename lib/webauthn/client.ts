import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

/**
 * Checks if WebAuthn is supported and accessible.
 * Silently returns false if accessed via IP address or unsupported browser environment.
 */
export async function isWebAuthnAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return false;
  }

  // Check if hostname is an IPv4 or IPv6 address
  const hostname = window.location.hostname;
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIPv6 = /^\[?[a-fA-F0-9:]+\]?$/.test(hostname) && hostname.includes(":");

  // WebAuthn requires a domain name or localhost (browsers block raw IP origins)
  if (isIPv4 || isIPv6) {
    return false;
  }

  try {
    const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return isAvailable;
  } catch {
    return false;
  }
}

export async function registerPasskey(friendlyName?: string) {
  // 1. Get registration options from server
  const optRes = await fetch("/api/auth/webauthn/register-options", { method: "POST" });
  if (!optRes.ok) {
    const err = await optRes.json();
    throw new Error(err.error || "Failed to initiate passkey registration.");
  }
  const options = await optRes.json();

  // 2. Pass options to browser WebAuthn API
  // v13: startRegistration now takes { optionsJSON } instead of options directly
  const registrationResponse = await startRegistration({ optionsJSON: options });

  // 3. Verify registration on server
  const verifyRes = await fetch("/api/auth/webauthn/register-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: registrationResponse, friendlyName }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.error || "Failed to verify passkey registration.");
  }

  return await verifyRes.json();
}

export async function authenticateWithPasskey(loginId?: string) {
  // 1. Get authentication options from server
  const optRes = await fetch("/api/auth/webauthn/auth-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId }),
  });

  if (!optRes.ok) {
    const err = await optRes.json();
    throw new Error(err.error || "Failed to initiate passkey authentication.");
  }

  const { options, challengeSessionId } = await optRes.json();

  // 2. Pass options to browser WebAuthn API
  // v13: startAuthentication now takes { optionsJSON } instead of options directly
  const authResponse = await startAuthentication({ optionsJSON: options });

  // 3. Verify authentication on server
  const verifyRes = await fetch("/api/auth/webauthn/auth-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response: authResponse, challengeSessionId }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.error || "Passkey verification failed.");
  }

  return await verifyRes.json();
}
