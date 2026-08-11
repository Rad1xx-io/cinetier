import { NextRequest, NextResponse } from "next/server";
import { tmdbFetch, TMDBError } from "@/lib/tmdb/client";
import { mapToSummary } from "@/lib/tmdb/mappers";
import type { TMDBPagedResponse, TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";
import type { SearchResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

type MultiResult = (TMDBRawMovie | TMDBRawTVShow) & { media_type: "movie" | "tv" | "person" };

async function runSearch(
  type: string,
  query: string,
  page: number,
  language?: string
): Promise<SearchResponse> {
  if (type === "movie") {
    const data = await tmdbFetch<TMDBPagedResponse<TMDBRawMovie>>("/search/movie", {
      query,
      page,
      include_adult: "false",
      language,
    });
    return {
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map((r) => mapToSummary(r, "movie")),
    };
  }

  if (type === "tv") {
    const data = await tmdbFetch<TMDBPagedResponse<TMDBRawTVShow>>("/search/tv", {
      query,
      page,
      include_adult: "false",
      language,
    });
    return {
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
      results: data.results.map((r) => mapToSummary(r, "tv")),
    };
  }

  const data = await tmdbFetch<TMDBPagedResponse<MultiResult>>("/search/multi", {
    query,
    page,
    include_adult: "false",
    language,
  });
  return {
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
    results: data.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => mapToSummary(r, r.media_type as "movie" | "tv")),
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query")?.trim() ?? "";
  const type = searchParams.get("type") ?? "all";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  if (!query) {
    const empty: SearchResponse = { page: 1, totalPages: 0, totalResults: 0, results: [] };
    return NextResponse.json(empty);
  }

  try {
    // TMDB's own search already matches Russian queries against localized titles
    // (no need to translate the query ourselves). If the ru-RU pass genuinely
    // finds nothing, retry once against en-US in case that title has no Russian
    // translation indexed at all.
    let payload = await runSearch(type, query, page);
    if (payload.results.length === 0) {
      payload = await runSearch(type, query, page, "en-US");
    }

    return NextResponse.json(payload);
  } catch (error) {
    const status = error instanceof TMDBError ? error.status : 500;
    return NextResponse.json(
      { error: "Не удалось выполнить поиск в TMDB. Попробуйте ещё раз." },
      { status }
    );
  }
}
