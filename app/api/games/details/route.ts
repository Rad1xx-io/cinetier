import { NextRequest, NextResponse } from "next/server";
import { SteamError } from "@/lib/steam/client";
import { getGameDetails } from "@/lib/games/source";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("id");
  const appId = raw ? Number(raw) : NaN;

  if (!Number.isFinite(appId)) {
    return NextResponse.json({ error: "Некорректный идентификатор игры." }, { status: 400 });
  }

  try {
    const game = await getGameDetails(appId);
    if (!game) {
      return NextResponse.json({ error: "Игра не найдена." }, { status: 404 });
    }
    return NextResponse.json(game);
  } catch (error) {
    const status = error instanceof SteamError ? error.status : 500;
    return NextResponse.json({ error: "Не удалось загрузить данные об игре." }, { status });
  }
}
