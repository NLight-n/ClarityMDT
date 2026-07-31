import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { getRelyingPartyConfig, setWebAuthnChallenge } from "@/lib/webauthn/config";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { rpName, rpID } = getRelyingPartyConfig(request);

    const userCredentials = await prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });

    // v13: excludeCredentials takes base64url string IDs directly (no Uint8Array, no type field)
    const excludeCredentials = userCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: cred.transports ? JSON.parse(cred.transports) : undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.loginId || user.name || "User",
      userDisplayName: user.name || "User",
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    setWebAuthnChallenge(user.id, options.challenge);

    return NextResponse.json(options);
  } catch (error) {
    console.error("Error generating WebAuthn registration options:", error);
    return NextResponse.json({ error: "Failed to generate registration options" }, { status: 500 });
  }
}
