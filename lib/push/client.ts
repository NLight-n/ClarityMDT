import { ensurePushServiceWorker } from "@/components/providers/PWARegister";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    throw new Error("Notifications are not supported by this browser.");
  }
  return await Notification.requestPermission();
}

export async function subscribeUserToPush(): Promise<PushSubscription | null> {
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied.");
  }

  // 1. Fetch public VAPID key
  const vapidRes = await fetch("/api/notifications/vapid-key");
  if (!vapidRes.ok) {
    throw new Error("Failed to retrieve server VAPID key.");
  }
  const { publicKey } = await vapidRes.json();
  if (!publicKey) {
    throw new Error("Invalid VAPID key received.");
  }

  // 2. Ensure ServiceWorker is ready (with 10s activation timeout protection)
  const registration = await ensurePushServiceWorker();

  // 3. Clear any existing/stale push subscription first
  const existingSub = await registration.pushManager.getSubscription();
  if (existingSub) {
    await existingSub.unsubscribe().catch(() => {});
  }

  // 4. Subscribe with applicationServerKey
  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
  });

  // 5. Send subscription details to DB
  const saveRes = await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!saveRes.ok) {
    throw new Error("Failed to save push subscription on server.");
  }

  return subscription;
}

export async function unsubscribeUserFromPush(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  const registration = await ensurePushServiceWorker();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    await fetch("/api/notifications/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }

  return true;
}

export async function getPushDiagnostics() {
  if (typeof window === "undefined") {
    return {
      secureContext: false,
      notificationPermission: "denied" as NotificationPermission,
      serviceWorkerState: "unavailable",
      pushManagerSupport: false,
      vapidKeyAvailable: false,
    };
  }

  const isSecureContext = window.isSecureContext;
  const permission = "Notification" in window ? Notification.permission : ("denied" as NotificationPermission);
  const hasSW = "serviceWorker" in navigator;

  let swState = "unavailable";
  let pushSupport = false;

  if (hasSW) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      swState = reg ? (reg.active ? "active" : "installing") : "unregistered";
      pushSupport = !!(reg && "pushManager" in reg);
    } catch {
      swState = "error";
    }
  }

  let vapidAvailable = false;
  try {
    const vapidRes = await fetch("/api/notifications/vapid-key");
    if (vapidRes.ok) {
      const data = await vapidRes.json();
      vapidAvailable = !!data.publicKey;
    }
  } catch {
    vapidAvailable = false;
  }

  return {
    secureContext: isSecureContext,
    notificationPermission: permission,
    serviceWorkerState: swState,
    pushManagerSupport: pushSupport,
    vapidKeyAvailable: vapidAvailable,
  };
}
