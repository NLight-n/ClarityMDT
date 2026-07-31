import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { getRelyingPartyConfig, getWebAuthnChallenge, deleteWebAuthnChallenge, ensureNativeWebCrypto } from "@/lib/webauthn/config";

export async function POST(request: NextRequest) {
  try {
    ensureNativeWebCrypto();
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
      const {
        credentialID,
        credentialPublicKey,
        counter,
        credentialDeviceType,
        credentialBackedUp,
      } = verification.registrationInfo;

      const credentialIdStr = Buffer.from(credentialID).toString("base64url");
      const publicKeyStr = Buffer.from(credentialPublicKey).toString("base64url");

      await prisma.webAuthnCredential.create({
        data: {
          userId: user.id,
          credentialId: credentialIdStr,
          publicKey: publicKeyStr,
          counter: BigInt(counter),
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          friendlyName: friendlyName || "Biometric Passkey",
        },
      });

      return NextResponse.json({ verified: true, credentialId: credentialIdStr });
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  } catch (error) {
    console.error("Error verifying WebAuthn registration:", error);
    return NextResponse.json({ error: "Verification error" }, { status: 500 });
  }
}
