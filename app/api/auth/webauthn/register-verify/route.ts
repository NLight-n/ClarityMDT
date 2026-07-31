import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { getRelyingPartyConfig, getWebAuthnChallenge, deleteWebAuthnChallenge } from "@/lib/webauthn/config";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expectedChallenge = getWebAuthnChallenge(user.id);
    if (!expectedChallenge) {
      return NextResponse.json({ error: "Challenge expired or missing. Please try again." }, { status: 400 });
    }

    const body = await request.json();
    const { response, friendlyName } = body;

    const { rpID, origin } = getRelyingPartyConfig(request);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    deleteWebAuthnChallenge(user.id);

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      const credentialId = credential.id;
      const publicKey = Buffer.from(credential.publicKey).toString("base64url");
      const counter = credential.counter;
      const transports = credential.transports ? JSON.stringify(credential.transports) : null;

      await prisma.webAuthnCredential.create({
        data: {
          userId: user.id,
          credentialId,
          publicKey,
          counter: BigInt(counter),
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          transports,
          friendlyName: friendlyName || "Biometric Passkey",
        },
      });

      return NextResponse.json({ verified: true, credentialId });
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  } catch (error) {
    console.error("Error verifying WebAuthn registration:", error);
    return NextResponse.json({ error: "Verification error" }, { status: 500 });
  }
}
