import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { getRelyingPartyConfig, setWebAuthnChallenge } from "@/lib/webauthn/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { loginId } = body;

    const { rpID } = getRelyingPartyConfig(request);

    let allowCredentials;
    let userId = "anon-webauthn";

    if (loginId) {
      const user = await prisma.user.findUnique({
        where: { loginId },
        select: { id: true },
      });

      if (user) {
        userId = user.id;
        const credentials = await prisma.webAuthnCredential.findMany({
          where: { userId: user.id },
          select: { credentialId: true, transports: true },
        });

        allowCredentials = credentials.map((cred) => ({
          id: cred.credentialId,
          transports: cred.transports ? JSON.parse(cred.transports) : undefined,
        }));
      }
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
