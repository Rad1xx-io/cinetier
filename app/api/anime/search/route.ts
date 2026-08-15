import { NextRequest, NextResponse } from "next/server";
import { sanitizeSearchQuery } from "@/lib/utils/search-query";
import { AniListError } from "@/lib/anilist/client";
import { discoverAnime } from "@/lib/anilist/discovery";
import { isAnimeFormat, type AnimeSortMode } from "@/lib/anilist/anime-filters";
import type { AnimeSeason, AnimeStatus } from "@/lib/types/anime";

export const dynamic = "force-dynamic";

const VALID_SORTS: AnimeSortMode[] = ["popularity", "score", "favourites", "release_date", "title"];
const VALID_SEASONS: AnimeSeason[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
const VALID_STATUSES: AnimeStatus[] = ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];

export async function GET(request: NextRequest) {
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
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const formatRaw = sp.get("format") ?? "";
  const format = isAnimeFormat(formatRaw) ? formatRaw : undefined;

  try {
    const data = await discoverAnime({ query, genre, year, season, status, format, sort, page, perPage: 24 });
    return NextResponse.json(data);
  } catch (error) {
    const httpStatus = error instanceof AniListError ? error.status : 500;
    const message = httpStatus === 429 ? "Too many requests. Please try again later." : "Could not load anime. Please try again.";
    return NextResponse.json({ error: message }, { status: httpStatus });
  }
}
