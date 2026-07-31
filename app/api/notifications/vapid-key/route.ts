import { NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/push/vapid";

export async function GET() {
  try {
    const keys = getVapidKeys();
    return NextResponse.json({ publicKey: keys.publicKey });
  } catch (error) {
    console.error("Error fetching VAPID key:", error);
    return NextResponse.json({ error: "Failed to get VAPID key" }, { status: 500 });
  }
}
