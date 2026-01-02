import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { sendNotificationToUser, sendBulkNotifications } from "@/lib/telegram/sendMessage";

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

    // Also send via Telegram if user has linked telegramId
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { telegramId: true },
    });
    if (user?.telegramId) {
      await sendNotificationToUser(user.telegramId, `${params.title}\n${params.message}`);
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

    // Telegram fan-out for linked users
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
  } catch (error) {
    console.error("Error creating notifications:", error);
    // Don't throw - notifications are non-critical
  }
}


