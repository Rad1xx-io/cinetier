import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedFilterTerm, boundedPage } from "@/lib/utils/request-bounds";
import { sanitizeSearchQuery } from "@/lib/utils/search-query";
import { AnimeSourceError, getAnimeSource } from "@/lib/anime-sources";
import { isAnimeFormat, type AnimeSortMode } from "@/lib/anilist/anime-filters";
import type { AnimeSeason, AnimeStatus } from "@/lib/types/anime";

export const dynamic = "force-dynamic";

const VALID_SORTS: AnimeSortMode[] = ["popularity", "score", "favourites", "release_date", "title"];
const VALID_SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const VALID_STATUSES: AnimeStatus[] = ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "search");
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(sp.get("query") ?? "") || undefined;
  // Looked up against a known genre list downstream rather than forwarded,
  // so this is a ceiling on work rather than an injection defence.
  const genre = boundedFilterTerm(sp.get("genre"));
  const yearRaw = sp.get("year");
  const year = yearRaw ? Number(yearRaw) : undefined;
  const seasonRaw = sp.get("season");
  const season = VALID_SEASONS.includes(seasonRaw as AnimeSeason) ? (seasonRaw as AnimeSeason) : undefined;
  const statusRaw = sp.get("status");
  const status = VALID_STATUSES.includes(statusRaw as AnimeStatus) ? (statusRaw as AnimeStatus) : undefined;
  const sortRaw = sp.get("sort") ?? "popularity";
  const sort = VALID_SORTS.includes(sortRaw as AnimeSortMode) ? (sortRaw as AnimeSortMode) : "popularity";
  const page = boundedPage(sp.get("page"));
  const formatRaw = sp.get("format") ?? "";
  const format = isAnimeFormat(formatRaw) ? formatRaw : undefined;

  try {
    const source = getAnimeSource();
    const data = await source.search({ query, genre, year, season, status, format, sort, page, perPage: 24 });
    return NextResponse.json(data);
  } catch (error) {
    const httpStatus = error instanceof AnimeSourceError ? error.status : 500;
    // Logged unconditionally, not just at httpStatus >= 500: AniList's own
    // self-disable answers 403, and that outage (2026-09-08) left nothing in
    // the logs under the old `>= 500` gate — a real incident, invisible the
    // whole time it was happening. Reaching this catch at all means the
    // source failed one way or another; that is always worth a trace.
    console.error("[anime/search]", error);
    const message =
      error instanceof AnimeSourceError
        ? httpStatus === 429 || httpStatus === 503
          ? // The upstream's own wording, for the two states a user can act
            // on — rate limited, catalogue down — because "try again" and
            // "try again in an hour" are different instructions.
            error.message
          : "The anime catalogue's data source is unavailable right now. Please try again later."
        : "Could not load anime. Please try again.";
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
