import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedPage } from "@/lib/utils/request-bounds";
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
  const genre = sp.get("genre")?.trim() || undefined;
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
    // The upstream's own wording is passed through for the states a user can
    // act on — rate limited, catalogue down — because "try again" and "try
    // again in an hour" are different instructions.
    const message =
      error instanceof AnimeSourceError && (httpStatus === 429 || httpStatus === 503)
        ? error.message
        : "Could not load anime. Please try again.";
    if (httpStatus >= 500) console.error("[anime/search]", error);
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
