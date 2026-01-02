import { NextRequest, NextResponse } from "next/server";
import { startTelegramPolling, stopTelegramPolling } from "@/lib/telegram/polling";

/**
 * POST /api/telegram/polling - Start Telegram bot polling
 * GET /api/telegram/polling - Check polling status
 * DELETE /api/telegram/polling - Stop Telegram bot polling
 * 
 * Use this endpoint to start/stop polling for local development
 * For production, use webhook instead
 */
export async function POST(request: NextRequest) {
  try {
    startTelegramPolling();
    return NextResponse.json({ 
      message: "Telegram polling started",
      status: "running"
    });
  } catch (error) {
    console.error("Error starting Telegram polling:", error);
    return NextResponse.json(
      { error: "Failed to start polling" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: "Telegram polling endpoint",
    usage: "POST to start, DELETE to stop"
  });
}

export async function DELETE(request: NextRequest) {
  try {
    stopTelegramPolling();
    return NextResponse.json({ 
      message: "Telegram polling stopped",
      status: "stopped"
    });
  } catch (error) {
    console.error("Error stopping Telegram polling:", error);
    return NextResponse.json(
      { error: "Failed to stop polling" },
      { status: 500 }
    );
  }
}

