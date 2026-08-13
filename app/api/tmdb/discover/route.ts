import { NextRequest, NextResponse } from "next/server";
import { TMDBError } from "@/lib/tmdb/client";
import { discoverTitles } from "@/lib/tmdb/discover";
import { isTitleSort } from "@/lib/tmdb/title-filters";
import type { TMDBMediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
  const pageRaw = Number(sp.get("page") ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

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
        ? "Слишком много запросов к TMDB. Попробуйте через минуту."
        : "Не удалось загрузить тайтлы. Попробуйте ещё раз.";
    return NextResponse.json({ error: message }, { status });
  }
}
