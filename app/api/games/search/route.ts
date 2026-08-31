import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedPage } from "@/lib/utils/request-bounds";
import { sanitizeSearchQuery } from "@/lib/utils/search-query";
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
  const limited = await rateLimitOrNull(request, "search");
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  // Was `.trim()` alone, which put a term of any length in front of IGDB's
  // query syntax and Steam's store search. The shared sanitizer caps it at 120
  // characters and drops the control and brace characters those two edges
  // answer with a bare 403.
  const query = sanitizeSearchQuery(sp.get("query") ?? "") || undefined;
  const genreRaw = sp.get("genre") ?? "";
  const platformRaw = sp.get("platform") ?? "";
  const categoryRaw = sp.get("category") ?? "";
  const sortRaw = sp.get("sort") ?? "";
  // Zero-based upstream, and capped: `?page=999999999` was forwarded verbatim.
  const page = boundedPage(sp.get("page"), true);

  try {
    const { results, hasMore, stale, correctedQuery } = await discoverGames({
      query,
      genre: isGameGenre(genreRaw) ? genreRaw : undefined,
      platform: isGamePlatform(platformRaw) ? platformRaw : undefined,
      category: isGameCategory(categoryRaw) ? categoryRaw : undefined,
      sort: isGameSort(sortRaw) ? sortRaw : "popularity",
      page,
    });

    const payload: GameSearchResponse = { results, hasMore, stale, correctedQuery };
    return NextResponse.json(payload);
  } catch (error) {
    const status =
      error instanceof IGDBError || error instanceof SteamError ? error.status : 500;

    let message = "Could not load games. Please try again.";
    if (status === 429) {
      message = "The catalogue is rate-limiting us. Try again in a few minutes.";
    } else if (error instanceof IGDBError && (status === 401 || status === 503)) {
      // A credential problem is fixed in .env.local, not by retrying.
      message = "The IGDB game catalogue is not configured: check TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.";
    }

    return NextResponse.json({ error: message }, { status });
  }
}
