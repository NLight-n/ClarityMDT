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
      // v13: registrationInfo.credential contains { id (base64url string), publicKey (Uint8Array), counter }
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      const credentialIdStr = credential.id; // Already a base64url string in v13
      const publicKeyStr = Buffer.from(credential.publicKey).toString("base64url");

      await prisma.webAuthnCredential.create({
        data: {
          userId: user.id,
          credentialId: credentialIdStr,
          publicKey: publicKeyStr,
          counter: BigInt(credential.counter),
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          friendlyName: friendlyName || "Biometric Passkey",
          transports: response.response?.transports
            ? JSON.stringify(response.response.transports)
            : null,
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
