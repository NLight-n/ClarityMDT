import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { sendNotificationToUser, sendBulkNotifications } from "@/lib/telegram/sendMessage";
import { sendWhatsappNotificationToUser, sendBulkWhatsappNotifications } from "@/lib/whatsapp/sendMessage";
import { getWhatsappSettings } from "@/lib/whatsapp/getSettings";
import { sendWebPushNotification } from "@/lib/push/vapid";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  meetingId?: string;
  caseId?: string;
}

function getNotificationEmoji(type: NotificationType): string {
  switch (type) {
    case NotificationType.MEETING_CANCELLED:
    case NotificationType.CASE_POSTPONED:
      return "🚫";
    case NotificationType.CASE_SUBMITTED:
    case NotificationType.MDT_REVIEW_COMPLETED:
      return "✅";
    case NotificationType.MEETING_CREATED:
    case NotificationType.MEETING_REQUEST:
      return "📅";
    case NotificationType.CASE_RESUBMITTED:
    case NotificationType.MEETING_UPDATED:
      return "✏️";
    case NotificationType.MANUAL_NOTIFICATION:
    default:
      return "⚠️";
  }
}

function getNotificationTargetUrl(meetingId?: string, caseId?: string): string {
  if (caseId) return `/cases/${caseId}`;
  if (meetingId) return `/meetings`;
  return `/dashboard`;
}

/**
 * Create a notification for a user (respecting channel opt-in preferences)
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        telegramId: true,
        whatsappPhone: true,
        notifyInApp: true,
        notifyWebPush: true,
        notifyTelegram: true,
        notifyWhatsapp: true,
      },
    });

    if (!user) return;

    const emoji = getNotificationEmoji(params.type);
    const titleWithEmoji = `${emoji} ${params.title}`;
    const targetUrl = getNotificationTargetUrl(params.meetingId, params.caseId);

    // 1. In-App Notification channel (if enabled by user)
    if (user.notifyInApp) {
      await prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          meetingId: params.meetingId || null,
          caseId: params.caseId || null,
        },
      });
    }

    const channelPromises: Promise<void>[] = [];

    // 2. Web Push channel (if enabled by user)
    if (user.notifyWebPush) {
      channelPromises.push(
        (async () => {
          try {
            const subscriptions = await prisma.pushSubscription.findMany({
              where: { userId: user.id },
            });

            for (const sub of subscriptions) {
              try {
                await sendWebPushNotification(
                  { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
                  {
                    title: titleWithEmoji,
                    body: params.message,
                    icon: "/icon-192x192.png",
                    badge: "/icon-192x192.png",
                    url: targetUrl,
                    vibrate: [100, 50, 100],
                  }
                );
              } catch (pushErr: any) {
                // If endpoint is gone / expired (statusCode 410 or 404), remove stale subscription
                if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                  await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
                } else {
                  console.error("Web Push delivery failed for endpoint:", sub.endpoint, pushErr);
                }
              }
            }
          } catch (webPushErr) {
            console.error("Web Push channel error:", webPushErr);
          }
        })()
      );
    }

    // 3. Telegram channel (if enabled by user & telegramId set)
    if (user.notifyTelegram && user.telegramId) {
      channelPromises.push(
        (async () => {
          try {
            await sendNotificationToUser(user.telegramId!, `${titleWithEmoji}\n${params.message}`);
          } catch (tgError) {
            console.error("Telegram notification failed:", tgError);
          }
        })()
      );
    }

    // 4. WhatsApp channel (if enabled by user & whatsappPhone set)
    if (user.notifyWhatsapp && user.whatsappPhone) {
      channelPromises.push(
        (async () => {
          try {
            const whatsappSettings = await getWhatsappSettings();
            if (whatsappSettings?.enabled) {
              await sendWhatsappNotificationToUser(
                user.whatsappPhone!,
                params.type,
                [titleWithEmoji, params.message]
              );
            }
          } catch (waError) {
            console.error("WhatsApp notification failed:", waError);
          }
        })()
      );
    }

    if (channelPromises.length > 0) {
      await Promise.allSettled(channelPromises);
    }
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

/**
 * Create notifications for multiple users (respecting individual channel preferences)
 */
export async function createNotificationsForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, "userId">
) {
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        telegramId: true,
        whatsappPhone: true,
        notifyInApp: true,
        notifyWebPush: true,
        notifyTelegram: true,
        notifyWhatsapp: true,
      },
    });

    const emoji = getNotificationEmoji(params.type);
    const titleWithEmoji = `${emoji} ${params.title}`;
    const targetUrl = getNotificationTargetUrl(params.meetingId, params.caseId);

    // 1. In-App notifications for users who have notifyInApp enabled
    const inAppUsers = users.filter((u) => u.notifyInApp);
    if (inAppUsers.length > 0) {
      await prisma.notification.createMany({
        data: inAppUsers.map((user) => ({
          userId: user.id,
          type: params.type,
          title: params.title,
          message: params.message,
          meetingId: params.meetingId || null,
          caseId: params.caseId || null,
        })),
      });
    }

    await Promise.allSettled([
      // Web Push channel
      (async () => {
        const pushUserIds = users.filter((u) => u.notifyWebPush).map((u) => u.id);
        if (pushUserIds.length === 0) return;

        const subscriptions = await prisma.pushSubscription.findMany({
          where: { userId: { in: pushUserIds } },
        });

        for (const sub of subscriptions) {
          try {
            await sendWebPushNotification(
              { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
              {
                title: titleWithEmoji,
                body: params.message,
                icon: "/icon-192x192.png",
                badge: "/icon-192x192.png",
                url: targetUrl,
                vibrate: [100, 50, 100],
              }
            );
          } catch (pushErr: any) {
            if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            }
          }
        }
      })(),

      // Telegram channel
      (async () => {
        try {
          const telegramIds = users
            .filter((u) => u.notifyTelegram && u.telegramId)
            .map((u) => u.telegramId)
            .filter((id): id is string => !!id);

          if (telegramIds.length > 0) {
            await sendBulkNotifications(telegramIds, `${titleWithEmoji}\n${params.message}`);
          }
        } catch (tgError) {
          console.error("Telegram bulk notification failed:", tgError);
        }
      })(),

      // WhatsApp channel
      (async () => {
        try {
          const whatsappSettings = await getWhatsappSettings();
          if (whatsappSettings?.enabled) {
            const phones = users
              .filter((u) => u.notifyWhatsapp && u.whatsappPhone)
              .map((u) => u.whatsappPhone)
              .filter((p): p is string => !!p);

            if (phones.length > 0) {
              await sendBulkWhatsappNotifications(
                phones,
                params.type,
                [titleWithEmoji, params.message]
              );
            }
          }
        } catch (waError) {
          console.error("WhatsApp bulk notification failed:", waError);
        }
      })(),
    ]);
  } catch (error) {
    console.error("Error creating notifications for users:", error);
  }
}
