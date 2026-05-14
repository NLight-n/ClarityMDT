import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { sendNotificationToUser, sendBulkNotifications } from "@/lib/telegram/sendMessage";
import { sendWhatsappNotificationToUser, sendBulkWhatsappNotifications } from "@/lib/whatsapp/sendMessage";
import { getWhatsappSettings } from "@/lib/whatsapp/getSettings";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  meetingId?: string;
  caseId?: string;
}

/**
 * Create a notification for a user
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
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

    // Fetch user with both notification channels
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { telegramId: true, whatsappPhone: true },
    });

    // Send via both channels in parallel — each channel is independent
    // so a failure in one never blocks the other
    const channelPromises: Promise<void>[] = [];

    // Telegram channel
    if (user?.telegramId) {
      channelPromises.push(
        (async () => {
          try {
            await sendNotificationToUser(user.telegramId!, `${params.title}\n${params.message}`);
          } catch (tgError) {
            console.error("Telegram notification failed:", tgError);
          }
        })()
      );
    }

    // WhatsApp channel
    if (user?.whatsappPhone) {
      channelPromises.push(
        (async () => {
          try {
            const whatsappSettings = await getWhatsappSettings();
            if (whatsappSettings?.enabled) {
              await sendWhatsappNotificationToUser(
                user.whatsappPhone!,
                params.type,
                [params.title, params.message]
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
    // Don't throw - notifications are non-critical
  }
}

/**
 * Create notifications for multiple users
 */
export async function createNotificationsForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, "userId">
) {
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: params.type,
        title: params.title,
        message: params.message,
        meetingId: params.meetingId || null,
        caseId: params.caseId || null,
      })),
    });

    // Send via both channels in parallel — each channel is fully independent
    // so a failure (or slowness) in one never blocks or skips the other
    await Promise.allSettled([
      // Telegram fan-out
      (async () => {
        try {
          const usersWithTelegram = await prisma.user.findMany({
            where: { id: { in: userIds }, telegramId: { not: null } },
            select: { telegramId: true },
          });

          const telegramIds = usersWithTelegram
            .map((u) => u.telegramId)
            .filter((id): id is string => !!id);

          if (telegramIds.length > 0) {
            await sendBulkNotifications(telegramIds, `${params.title}\n${params.message}`);
          }
        } catch (tgError) {
          console.error("Telegram bulk notification failed:", tgError);
        }
      })(),

      // WhatsApp fan-out
      (async () => {
        try {
          const whatsappSettings = await getWhatsappSettings();
          if (whatsappSettings?.enabled) {
            const usersWithWhatsapp = await prisma.user.findMany({
              where: { id: { in: userIds }, whatsappPhone: { not: null } },
              select: { whatsappPhone: true },
            });

            const phones = usersWithWhatsapp
              .map((u) => u.whatsappPhone)
              .filter((p): p is string => !!p);

            if (phones.length > 0) {
              await sendBulkWhatsappNotifications(
                phones,
                params.type,
                [params.title, params.message]
              );
            }
          }
        } catch (waError) {
          console.error("WhatsApp bulk notification failed:", waError);
        }
      })(),
    ]);
  } catch (error) {
    console.error("Error creating notifications:", error);
    // Don't throw - notifications are non-critical
  }
}


