import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getRelyingPartyConfig, getWebAuthnChallenge, deleteWebAuthnChallenge } from "@/lib/webauthn/config";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookies";
import { createAuditLog, AuditAction } from "@/lib/audit/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { response, challengeSessionId } = body;

    const credentialId = response.id;
    const rawId = response.rawId;

    // 1. Find matching credential in database (checking id and rawId)
    let dbCredential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId },
      include: {
        user: {
          include: { department: true },
        },
      },
    });

    if (!dbCredential && rawId && rawId !== credentialId) {
      dbCredential = await prisma.webAuthnCredential.findUnique({
        where: { credentialId: rawId },
        include: {
          user: {
            include: { department: true },
          },
        },
      });
    }

    if (!dbCredential || !dbCredential.user || !dbCredential.user.isActive) {
      return NextResponse.json({ error: "Passkey credential not recognized for ClarityMDT or user deactivated." }, { status: 400 });
    }

    const user = dbCredential.user;
    const lookupId = challengeSessionId || user.id;
    const expectedChallenge = getWebAuthnChallenge(lookupId) || getWebAuthnChallenge("anon-webauthn");

    if (!expectedChallenge) {
      return NextResponse.json({ error: "Challenge expired. Please try again." }, { status: 400 });
    }

    const { rpID, origin } = getRelyingPartyConfig(request);

    // 2. Verify WebAuthn response
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(dbCredential.credentialId, "base64url"),
        credentialPublicKey: Buffer.from(dbCredential.publicKey, "base64url"),
        counter: Number(dbCredential.counter),
        transports: dbCredential.transports ? JSON.parse(dbCredential.transports) : undefined,
      },
    });

    deleteWebAuthnChallenge(lookupId);

    if (!verification.verified || !verification.authenticationInfo) {
      return NextResponse.json({ error: "Biometric authentication failed" }, { status: 400 });
    }

    // 3. Update counter in DB
    await prisma.webAuthnCredential.update({
      where: { id: dbCredential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
      },
    });

    // 4. Create NextAuth JWT Session Token
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Server authentication error (secret missing)" }, { status: 500 });
    }

    const maxAgeMinutes = parseInt(process.env.SESSION_MAX_AGE_MINUTES || "30", 10);
    const token = await encode({
      token: {
        userId: user.id,
        role: user.role,
        departmentId: user.departmentId,
        departmentName: user.department?.name || null,
        loginId: user.loginId,
        name: user.name,
      },
      secret,
      maxAge: maxAgeMinutes * 60,
    });

    // Create Audit Log for biometric login
    await createAuditLog({
      action: AuditAction.LOGIN,
      userId: user.id,
      details: {
        loginId: user.loginId,
        role: user.role,
        method: "WEBAUTHN_BIOMETRIC",
      },
    }).catch(() => {});

    // 5. Build response and set session cookie
    const res = NextResponse.json({ verified: true, user: { id: user.id, name: user.name } });

    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: maxAgeMinutes * 60,
    });

    return res;
  } catch (error: any) {
    console.error("Error verifying WebAuthn authentication:", error);
    const errMsg = error?.message || "Unknown verification error";
    return NextResponse.json({ error: `Biometric verification error: ${errMsg}` }, { status: 500 });
  }
}
