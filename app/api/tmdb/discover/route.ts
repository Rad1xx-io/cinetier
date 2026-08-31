import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedPage } from "@/lib/utils/request-bounds";
import { TMDBError } from "@/lib/tmdb/client";
import { discoverTitles } from "@/lib/tmdb/discover";
import { isTitleSort } from "@/lib/tmdb/title-filters";
import type { TMDBMediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "search");
  if (limited) return limited;

  const sp = request.nextUrl.searchParams;
  const typeRaw = sp.get("type") ?? "all";
  const type: "all" | TMDBMediaType =
    typeRaw === "movie" || typeRaw === "tv" ? (typeRaw as TMDBMediaType) : "all";
  const genre = sp.get("genre")?.trim() || undefined;
  const yearRaw = Number(sp.get("year") ?? 0);
  const year = Number.isFinite(yearRaw) && yearRaw > 1800 ? yearRaw : undefined;
  const ratingRaw = Number(sp.get("minRating") ?? 0);
  const minRating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : undefined;
  const sortRaw = sp.get("sort") ?? "";
  const page = boundedPage(sp.get("page"));

  try {
    const data = await discoverTitles({
      type,
      genre,
      year,
      minRating,
      sort: isTitleSort(sortRaw) ? sortRaw : "popularity",
      page,
    });
    return NextResponse.json(data);
  } catch (error) {
    const status = error instanceof TMDBError ? error.status : 500;
    const message =
      status === 429
        ? "Too many requests to TMDB. Try again in a minute."
        : "Could not load titles. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
