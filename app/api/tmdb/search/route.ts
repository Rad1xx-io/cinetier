import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";
import { boundedPage } from "@/lib/utils/request-bounds";
import { sanitizeSearchQuery } from "@/lib/utils/search-query";
import { tmdbFetch, TMDBError } from "@/lib/tmdb/client";
import { mapToSummary } from "@/lib/tmdb/mappers";
import type { TMDBPagedResponse, TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";
import type { SearchResponse } from "@/lib/types";
import { MIN_RESULTS_BEFORE_FALLBACK, searchWithFallback } from "@/lib/search/with-fallback";

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
  /*
   * One request here can become several upstream: the fallback path below
   * retries a thin result with corrected spellings and then again in en-US.
   * Metered before any of that happens.
   */
  const limited = await rateLimitOrNull(request, "search");
  if (limited) return limited;

  const searchParams = request.nextUrl.searchParams;
  const query = sanitizeSearchQuery(searchParams.get("query") ?? "");
  const type = searchParams.get("type") ?? "all";
  const page = boundedPage(searchParams.get("page"));

  if (!query) {
    const empty: SearchResponse = { page: 1, totalPages: 0, totalResults: 0, results: [] };
    return NextResponse.json(empty);
  }

  try {
    // TMDB matches Russian queries against its localized titles, so the typed
    // term is tried untouched first. Only when that comes back thin do the
    // corrected spellings get a turn — and the en-US retry stays as the last
    // resort for titles with no Russian translation indexed at all.
    let correctedQuery: string | null = null;
    let page1 = await runSearch(type, query, page);

    if (page1.results.length < MIN_RESULTS_BEFORE_FALLBACK) {
      const merged = await searchWithFallback(
        query,
        async (term) => (await runSearch(type, term, page)).results,
        (t) => `${t.mediaType}-${t.tmdbId}`
      );
      correctedQuery = merged.correctedQuery;
      page1 = { ...page1, results: merged.results };
    }

    if (page1.results.length === 0) {
      page1 = await runSearch(type, query, page, "en-US");
    }

    return NextResponse.json({ ...page1, correctedQuery });
  } catch (error) {
    const status = error instanceof TMDBError ? error.status : 500;
    return NextResponse.json(
      { error: "The TMDB search failed. Please try again." },
      { status }
    );
  }
}
