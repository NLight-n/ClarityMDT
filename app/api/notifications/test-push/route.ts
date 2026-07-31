import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";
import { sendWebPushNotification } from "@/lib/push/vapid";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find all push subscriptions for this user
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
    });

    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: "No push subscriptions found for your account. Make sure Web Push is enabled and the browser has granted notification permission." },
        { status: 400 }
      );
    }

    const payload = {
      title: "🔔 ClarityMDT Test Notification",
      body: `This is a test push notification sent at ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}. If you see this, Web Push is working!`,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      url: "/settings",
      vibrate: [200, 100, 200],
    };

    let successCount = 0;
    let failedCount = 0;
    const staleIds: string[] = [];

    for (const sub of subscriptions) {
      try {
        await sendWebPushNotification(
          {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
          payload
        );
        successCount++;
      } catch (err: any) {
        failedCount++;
        // If subscription is expired/invalid (410 Gone or 404), mark for cleanup
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id);
        }
        console.error(`[TestPush] Failed to send to subscription ${sub.id}:`, err?.statusCode || err?.message);
      }
    }

    // Clean up stale subscriptions
    if (staleIds.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: staleIds } },
      });
    }

    return NextResponse.json({
      success: successCount > 0,
      sent: successCount,
      failed: failedCount,
      staleRemoved: staleIds.length,
      totalSubscriptions: subscriptions.length,
    });
  } catch (error) {
    console.error("Error sending test push notification:", error);
    return NextResponse.json({ error: "Failed to send test push notification" }, { status: 500 });
  }
}
