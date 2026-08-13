import { NextRequest, NextResponse } from "next/server";
import { SteamError } from "@/lib/steam/client";
import { IGDBError } from "@/lib/igdb/client";
import { discoverGames } from "@/lib/games/source";
import {
  isGameCategory,
  isGameGenre,
  isGamePlatform,
  isGameSort,
} from "@/lib/steam/filters";
import type { GameSearchResponse } from "@/lib/types/game";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const query = sp.get("query")?.trim() || undefined;
  const genreRaw = sp.get("genre") ?? "";
  const platformRaw = sp.get("platform") ?? "";
  const categoryRaw = sp.get("category") ?? "";
  const sortRaw = sp.get("sort") ?? "";
  const pageRaw = Number(sp.get("page") ?? 0);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 0;

  try {
    const { results, hasMore, stale } = await discoverGames({
      query,
      genre: isGameGenre(genreRaw) ? genreRaw : undefined,
      platform: isGamePlatform(platformRaw) ? platformRaw : undefined,
      category: isGameCategory(categoryRaw) ? categoryRaw : undefined,
      sort: isGameSort(sortRaw) ? sortRaw : "popularity",
      page,
    });

    const payload: GameSearchResponse = { results, hasMore, stale };
    return NextResponse.json(payload);
  } catch (error) {
    const status =
      error instanceof IGDBError || error instanceof SteamError ? error.status : 500;

    let message = "Не удалось загрузить игры. Попробуйте ещё раз.";
    if (status === 429) {
      message = "Каталог временно ограничил доступ. Попробуйте через несколько минут.";
    } else if (error instanceof IGDBError && (status === 401 || status === 503)) {
      // A credential problem is fixed in .env.local, not by retrying.
      message = "Каталог игр IGDB не настроен: проверьте TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET.";
    }

    return NextResponse.json({ error: message }, { status });
  }
}
