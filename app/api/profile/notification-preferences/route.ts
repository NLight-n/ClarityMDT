import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/getCurrentUser";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        notifyInApp: true,
        notifyWebPush: true,
        notifyTelegram: true,
        notifyWhatsapp: true,
      },
    });

    return NextResponse.json(userData || {
      notifyInApp: true,
      notifyWebPush: true,
      notifyTelegram: true,
      notifyWhatsapp: true,
    });
  } catch (error) {
    console.error("Error getting notification preferences:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notifyInApp, notifyWebPush, notifyTelegram, notifyWhatsapp } = body;

    const updateData: any = {};
    if (typeof notifyInApp === "boolean") updateData.notifyInApp = notifyInApp;
    if (typeof notifyWebPush === "boolean") updateData.notifyWebPush = notifyWebPush;
    if (typeof notifyTelegram === "boolean") updateData.notifyTelegram = notifyTelegram;
    if (typeof notifyWhatsapp === "boolean") updateData.notifyWhatsapp = notifyWhatsapp;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        notifyInApp: true,
        notifyWebPush: true,
        notifyTelegram: true,
        notifyWhatsapp: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
