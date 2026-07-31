import webPush from "web-push";

let cachedVapidKeys: { publicKey: string; privateKey: string } | null = null;

export function getVapidKeys() {
  if (cachedVapidKeys) {
    return cachedVapidKeys;
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (publicKey && privateKey) {
    cachedVapidKeys = { publicKey, privateKey };
  } else {
    console.warn(
      "[WebPush] NEXT_PUBLIC_VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY env variables are missing. Auto-generating ephemeral VAPID keys."
    );
    cachedVapidKeys = webPush.generateVAPIDKeys();
  }

  try {
    webPush.setVapidDetails(
      "mailto:admin@claritymdt.app",
      cachedVapidKeys.publicKey,
      cachedVapidKeys.privateKey
    );
  } catch (error) {
    console.error("[WebPush] Failed to set VAPID details:", error);
  }

  return cachedVapidKeys;
}

export async function sendWebPushNotification(
  subscription: {
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    vibrate?: number[];
  }
) {
  getVapidKeys();

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  return webPush.sendNotification(pushSubscription, JSON.stringify(payload));
}
