import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { getRelyingPartyConfig, setWebAuthnChallenge } from "@/lib/webauthn/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { loginId } = body;

    const { rpID } = getRelyingPartyConfig(request);

    let allowCredentials: { id: Uint8Array; type: "public-key"; transports?: any[] }[] = [];
    let userId = "anon-webauthn";

    if (loginId && typeof loginId === "string" && loginId.trim()) {
      const cleanLoginId = loginId.trim();
      const user = await prisma.user.findUnique({
        where: { loginId: cleanLoginId },
        select: { id: true },
      });

      if (!user) {
        return NextResponse.json(
          { error: `User ID "${cleanLoginId}" not found.` },
          { status: 404 }
        );
      }

      userId = user.id;
      const credentials = await prisma.webAuthnCredential.findMany({
        where: { userId: user.id },
        select: { credentialId: true, transports: true },
      });

      if (credentials.length === 0) {
        return NextResponse.json(
          { error: `No biometric passkeys registered for "${cleanLoginId}" in ClarityMDT. Please log in with password first.` },
          { status: 400 }
        );
      }

      allowCredentials = credentials.map((cred) => ({
        id: Buffer.from(cred.credentialId, "base64url"),
        type: "public-key" as const,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      }));
    } else {
      // If no loginId specified, restrict allowCredentials to ALL passkeys registered in ClarityMDT DB.
      // This prevents the browser from offering passkeys registered by other apps (like IRLog) on the same domain.
      const allCredentials = await prisma.webAuthnCredential.findMany({
        select: { credentialId: true, transports: true },
      });

      if (allCredentials.length === 0) {
        return NextResponse.json(
          { error: "No biometric passkeys registered in ClarityMDT yet. Please log in with password first." },
          { status: 400 }
        );
      }

      allowCredentials = allCredentials.map((cred) => ({
        id: Buffer.from(cred.credentialId, "base64url"),
        type: "public-key" as const,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    setWebAuthnChallenge(userId, options.challenge);

    return NextResponse.json({ options, challengeSessionId: userId });
  } catch (error) {
    console.error("Error generating WebAuthn auth options:", error);
    return NextResponse.json({ error: "Failed to generate authentication options" }, { status: 500 });
  }
}
